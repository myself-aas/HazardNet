/**
 * HazardNet High-Availability AI Fallback Engine
 *
 * Bulletproof Multi-Tier Fallback Architecture for High-Concurrency Load:
 * 1. In-Memory TTL LRU Cache (deduplicates identical prompt requests)
 * 2. Provider Circuit Breakers (auto-trips 429/quota limits for 45s)
 * 3. Multi-Model Cascade (all free-tier LLM APIs, RAG-grounded prompts):
 *    - Tier 1: Primary Gemini Model (gemini-2.5-flash / gemini-flash-latest)
 *    - Tier 2: Backup Gemini Models & Key Rotation (gemini-2.5-flash-lite / gemini-2.0-flash)
 *    - Tier 3: OpenRouter API (Llama 3.3 70B, DeepSeek V3, Gemma 2 9B, Qwen 2.5)
 *    - Tier 4: Groq API (Llama 3.3 70B, Llama 3.1 8B)
 *    - Tier 5: HuggingFace Inference Router (Mistral 7B, Llama 3.1 8B)
 *    - Tier 6: Zero-Latency Deterministic AEZ Neural-Heuristic Engine
 *
 * Every successful response is stamped with `provider_source` so consumers
 * (the AI Advisor chat, the advisory panel) can show which engine answered.
 */

import { sha256Hex } from './portableHash.js';
import { defaultEnv } from './runtimeEnv.js';
import { routeSkillsStructured, finiteOrNull } from '../services/knowledge/skills.js';
import { assertAdvisory, createVerifiedCache } from './cacheContract.js';

// In-Memory Cache for Advisory Requests (10-minute TTL).
// Phase 2: a generated advisory is only cached after a value assertion, and a cached
// advisory is re-checked before it is served. A truncated/failed generation must never
// become the answer to the next ten minutes of identical prompts.
const CACHE_TTL_MS = 10 * 60 * 1000;
const advisoryCache = createVerifiedCache({
  ttlMs: CACHE_TTL_MS,
  label: 'advisory',
  validate: (entry) => assertAdvisory(entry && entry.data),
  age: (entry, now) => now - (entry?.timestamp ?? 0),
});

// Per-provider timeout: a hung upstream must not eat the whole cascade (the
// chat function has a hard wall-clock budget on a function host).
const PROVIDER_TIMEOUT_MS = 12_000;

// Human-readable provenance stamped onto successful LLM responses
const PROVIDER_LABELS = {
  gemini_primary: 'Google Gemini API (free tier) — HazardNet RAG',
  gemini_secondary: 'Google Gemini API, backup key (free tier) — HazardNet RAG',
  openrouter: 'OpenRouter free model (Llama/DeepSeek/Qwen) — HazardNet RAG',
  groq: 'Groq API free tier (Llama) — HazardNet RAG',
  huggingface: 'HuggingFace Inference Router (free tier) — HazardNet RAG',
};

// Provider Circuit Breaker States
const circuitBreakers = {
  gemini_primary: { state: 'CLOSED', trippedAt: 0, failures: 0 },
  gemini_secondary: { state: 'CLOSED', trippedAt: 0, failures: 0 },
  openrouter: { state: 'CLOSED', trippedAt: 0, failures: 0 },
  groq: { state: 'CLOSED', trippedAt: 0, failures: 0 },
  huggingface: { state: 'CLOSED', trippedAt: 0, failures: 0 },
};

const TRIP_COOLDOWN_MS = 45 * 1000; // 45 seconds cooldown before retrying a tripped provider

// System metrics tracking
const engineStats = {
  totalRequests: 0,
  cacheHits: 0,
  providerSuccessCount: {
    gemini_primary: 0,
    gemini_secondary: 0,
    openrouter: 0,
    groq: 0,
    huggingface: 0,
    offline_heuristic: 0
  },
  lastFallbackProvider: 'gemini_primary'
};

/**
 * Check if a circuit breaker is healthy or ready to retry
 */
function isProviderHealthy(providerKey) {
  const breaker = circuitBreakers[providerKey];
  if (!breaker) return true;
  if (breaker.state === 'TRIPPED') {
    if (Date.now() - breaker.trippedAt > TRIP_COOLDOWN_MS) {
      // Cooldown expired, transition to HALF-OPEN
      breaker.state = 'HALF_OPEN';
      console.info(`[AI Fallback Engine] Circuit breaker for '${providerKey}' HALF-OPEN. Retrying provider...`);
      return true;
    }
    return false;
  }
  return true;
}

/**
 * Record failure & trip breaker if rate limited or repeated error
 */
function recordProviderFailure(providerKey, error) {
  const breaker = circuitBreakers[providerKey];
  if (!breaker) return;

  const errMsg = String(error?.message || error || '').toLowerCase();
  const isRateLimit = errMsg.includes('429') || 
                      errMsg.includes('quota') || 
                      errMsg.includes('resource_exhausted') || 
                      errMsg.includes('rate limit') ||
                      errMsg.includes('403') ||
                      errMsg.includes('permission_denied');

  breaker.failures += 1;
  if (isRateLimit || breaker.failures >= 2) {
    breaker.state = 'TRIPPED';
    breaker.trippedAt = Date.now();
    console.warn(`[AI Fallback Engine] Circuit breaker TRIPPED for '${providerKey}'. Reason: ${isRateLimit ? 'Rate limit / Quota (429)' : 'Repeated Failures'}. Cooling down for ${TRIP_COOLDOWN_MS / 1000}s.`);
  }
}

/**
 * Record success & reset breaker
 */
function recordProviderSuccess(providerKey) {
  const breaker = circuitBreakers[providerKey];
  if (breaker) {
    breaker.state = 'CLOSED';
    breaker.failures = 0;
  }
  engineStats.providerSuccessCount[providerKey] = (engineStats.providerSuccessCount[providerKey] || 0) + 1;
  engineStats.lastFallbackProvider = providerKey;
}

/**
 * Clean json response text if encapsulated in markdown backticks
 */
function parseCleanJson(text) {
  if (!text) throw new Error('Empty AI response');
  let clean = text.trim();
  if (clean.startsWith('```json')) {
    clean = clean.replace(/^```json/, '').replace(/```$/, '').trim();
  } else if (clean.startsWith('```')) {
    clean = clean.replace(/^```/, '').replace(/```$/, '').trim();
  }
  return JSON.parse(clean);
}

/**
 * Gemini REST call — the raw `:generateContent` endpoint over `fetch`.
 *
 * The SDK (`@google/genai`) is a Node package; a Worker isolate cannot load it, and
 * this module is bundled into `functions/api/chat/query.ts` on the edge. The REST
 * surface is identical for what the cascade needs (JSON-mode text out), and `fetch`
 * exists in Node 20 and Workers alike, so one implementation serves both runtimes.
 *
 * @returns {Promise<string>} the candidate's concatenated text parts
 */
async function callGeminiRest(modelName, prompt, systemInstruction, apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  );

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Gemini (${modelName}) status ${res.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p?.text || '').join('');
}

/**
 * TIER 1: Primary Gemini API Call
 */
async function callGeminiPrimary(prompt, systemInstruction, env) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  if (!isProviderHealthy('gemini_primary')) throw new Error('gemini_primary breaker TRIPPED');

  const geminiModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-flash-latest'];
  
  let lastErr;
  for (const modelName of geminiModels) {
    try {
      const text = await callGeminiRest(modelName, prompt, systemInstruction, apiKey);
      const parsed = parseCleanJson(text);
      recordProviderSuccess('gemini_primary');
      return parsed;
    } catch (err) {
      const msg = String(err?.message || err);
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
        throw new Error('Gemini API Quota Exceeded (429)', { cause: err });
      }
      lastErr = err;
    }
  }

  throw lastErr || new Error('All Gemini primary models failed');
}

/**
 * TIER 2: Backup Gemini Call with Alternative Model / Secondary Key
 */
async function callGeminiSecondary(prompt, systemInstruction, env) {
  const apiKey = env.GEMINI_API_KEY_BACKUP;
  if (!apiKey) throw new Error('GEMINI_API_KEY_BACKUP not configured');
  if (!isProviderHealthy('gemini_secondary')) throw new Error('gemini_secondary breaker TRIPPED');

  const backupModels = ['gemini-2.0-flash', 'gemini-flash-latest'];

  let lastErr;
  for (const modelName of backupModels) {
    try {
      const text = await callGeminiRest(modelName, prompt, systemInstruction, apiKey);
      const parsed = parseCleanJson(text);
      recordProviderSuccess('gemini_secondary');
      return parsed;
    } catch (err) {
      const msg = String(err?.message || err);
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
        throw new Error('Backup Gemini API Quota Exceeded (429)', { cause: err });
      }
      lastErr = err;
    }
  }

  throw lastErr || new Error('All Gemini secondary models failed');
}

/**
 * TIER 3: OpenRouter API Call (Free Models)
 */
async function callOpenRouter(prompt, systemInstruction, env) {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');
  if (!isProviderHealthy('openrouter')) throw new Error('openrouter breaker TRIPPED');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://hazardnet.ai',
    'X-Title': 'HazardNet AI GIS'
  };

  // Try top free models on OpenRouter (failures cascade to the next slug)
  const freeModels = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'deepseek/deepseek-chat-v3-0324:free',
    'google/gemma-2-9b-it:free',
    'qwen/qwen-2.5-coder-32b-instruct:free',
    'mistralai/mistral-7b-instruct:free'
  ];

  let lastErr;
  for (const model of freeModels) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemInstruction + '\nRespond strictly with valid JSON only.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`OpenRouter (${model}) status ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      const parsed = parseCleanJson(text);
      recordProviderSuccess('openrouter');
      return parsed;
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('All OpenRouter free models failed');
}

/**
 * TIER 4: Groq API Call (High Throughput Free Tier)
 */
async function callGroq(prompt, systemInstruction, env) {
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');
  if (!isProviderHealthy('groq')) throw new Error('groq breaker TRIPPED');

  const groqModels = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
  let lastErr;
  for (const model of groqModels) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemInstruction + '\nReturn JSON format only.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Groq (${model}) status ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      const parsed = parseCleanJson(text);
      recordProviderSuccess('groq');
      return parsed;
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('All Groq models failed');
}

/**
 * TIER 5: HuggingFace Inference API
 */
async function callHuggingFace(prompt, systemInstruction, env) {
  const apiKey = env.HUGGINGFACE_API_KEY;
  if (!apiKey) throw new Error('HUGGINGFACE_API_KEY not configured');
  if (!isProviderHealthy('huggingface')) throw new Error('huggingface breaker TRIPPED');

  // HuggingFace's serverless inference is served by the router's
  // OpenAI-compatible chat-completions endpoint (the legacy
  // api-inference.huggingface.co /models/* surface was sunset).
  const hfModels = ['mistralai/Mistral-7B-Instruct-v0.3', 'meta-llama/Llama-3.1-8B-Instruct'];
  let lastErr;
  for (const model of hfModels) {
    try {
      const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemInstruction + '\nRespond strictly with valid JSON only.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2,
          max_tokens: 2048
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HuggingFace (${model}) status ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      const rawText = data?.choices?.[0]?.message?.content;
      if (!rawText) throw new Error(`HuggingFace (${model}) returned no content`);

      // Extract json snippet (models may wrap JSON in prose or fences)
      const jsonStart = rawText.indexOf('{');
      const jsonEnd = rawText.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const parsed = parseCleanJson(rawText.slice(jsonStart, jsonEnd + 1));
        recordProviderSuccess('huggingface');
        return parsed;
      }
      throw new Error(`HuggingFace (${model}) did not return a valid JSON block`);
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('All HuggingFace models failed');
}

/**
 * TIER 6: Zero-latency deterministic fallback — the answer a user gets when
 * every provider tier is unavailable.
 *
 * WHAT THIS WAS
 * -------------
 * This tier used to assert things it had no way of knowing. Verbatim, it told
 * farmers that "BMD synoptic telemetry confirms barometric pressure drop and
 * wind convergence", printed "severity index 65.0%" from a severity_score that
 * `chatService` hardcoded to 0.65, credited itself to "Agri-Shield Official
 * Institutional Telemetry", recommended lowering gher water "by 20%" and
 * shock-chlorinating tube-wells with a "1% bleaching powder solution" — and it
 * did all of that for EVERY hazard, so a cold-wave question was told to drain
 * its fields.
 *
 * None of that is recoverable by rewording. This tier has no network, no
 * telemetry and no measurement; it is a template engine. So it now says what it
 * is, routes to the same skill cards the rest of the agent uses (one source of
 * truth for hazard-appropriate advice), and refuses to state numbers it was not
 * given. Where a real number matters — a fertiliser rate, a lime dose, a
 * chlorination strength — it names the officer who can give the correct one for
 * that pond or soil, because a plausible wrong dose is worse than no dose.
 *
 * The response shape is unchanged: `chatService` and two frontend renderers
 * read these exact field names.
 */
function generateDeterministicHeuristicAdvisory(params) {
  const { district_name = 'Bangladesh', hazard_type = 'Hazard', severity_score = null, confidence = null, crop_context } = params;

  // A severity the caller invented is not a measurement. `chatService` has no
  // severity signal for a free-text question, so it now passes null and this
  // tier says so instead of printing a percentage.
  // finiteOrNull, not Number.isFinite(Number(x)): Number(null) is 0, which is
  // finite, so the naive form read a missing severity as a measured 0.0%.
  const severity = finiteOrNull(severity_score);
  const hasSeverity = severity !== null;
  const isEmergency = severity !== null && severity >= 0.7;
  const urgency = isEmergency ? 'EMERGENCY' : 'WARNING';
  const severityClause = hasSeverity
    ? `The severity index supplied for this assessment was ${(severity * 100).toFixed(1)}% — that value came from the caller's published outlook, not from a new measurement made here.`
    : 'No severity score was supplied with this question, so none is claimed here; check the district outlook page for the published index.';

  const skill = routeSkillsStructured({ district_name, hazard_type, severity_score: severity });

  recordProviderSuccess('offline_heuristic');

  return {
    advisory_id: `ADV-${(district_name || 'DIST').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)}-${Date.now().toString().slice(-4)}`,
    provider_source: 'HazardNet Offline Heuristic Tier (no model provider, no live telemetry)',
    tensor_diagnosis: `Offline assessment for ${district_name}. The question was routed to the ${skill.label} playbook (${skill.skill}). ${severityClause} This tier consulted no live telemetry and no weather observations.`,
    // Field name kept for the frontend contract; the content now states the
    // truth instead of claiming a signal that was never read.
    bmd_signal_alignment: `No live BMD or FFWC signal was read by this offline tier, so no observation is confirmed or denied here. For the current official warning see the Bangladesh Meteorological Department (bmd.gov.bd) or, for river levels, the Flood Forecasting and Warning Centre (ffwc.gov.bd). In an emergency call 999.`,
    urgency_tier: urgency,
    urgency_level: urgency,
    risk_assessment: severity === null
      ? `Risk depends on the published outlook for ${district_name}, which this offline tier did not read. Treat the actions below as preparation, and check the district page for the current severity and confidence before deciding how urgently to act.`
      : `At the supplied severity of ${(severity * 100).toFixed(1)}% for ${district_name}, standing crops, livestock enclosures and aquaculture structures are the exposures to protect first.`,
    crop_context: {
      primary_crop: crop_context?.primary_crop || 'Not supplied with this question',
      current_stage: crop_context?.current_stage || 'Not supplied with this question',
      vulnerability: 'Depends on crop and growth stage — ask the Upazila Agriculture Officer (UAO) to assess your specific field.'
    },
    immediate_actions_48h: [
      ...skill.first_actions,
      `Report the situation to the UAO or Union Parishad so the official loss record starts early.`,
      `Helplines: ${skill.helplines.join('; ')}.`
    ],
    protective_measures_7d: [
      `Follow the ${skill.label} guidance from the responsible bodies: ${skill.owners.join('; ')}.`,
      'Inspect structures daily — embankments, sluice gates, sheds and fencing — and repair small damage before it becomes a failure.',
      'Ask the UAO about the correct fertiliser or soil-amendment rate for your field; rates depend on soil, water volume and crop stage, and this tier will not guess one.'
    ],
    institutional_recommendations: {
      seed_varieties: [
        'BRRI dhan49, dhan51, dhan52 (submergence tolerant)',
        'BRRI dhan47, dhan53 (salinity tolerant)',
        'BRRI dhan56 (drought), BRRI dhan71 (late-season flooding)',
        'BARI Gom-33 (heat-tolerant wheat)'
      ],
      // Deliberately rate-free: the previous version quoted gypsum, lime and
      // bleaching-powder figures it could not have verified.
      application_rates: [
        'Lime, gypsum and pond-treatment rates depend on water volume and pH — get the rate from the Upazila Fisheries Officer (UFO) before applying.',
        'Fertiliser top-dressing rates depend on soil test and crop stage — confirm with the UAO.',
        'Vaccination schedules are set per upazila by the Upazila Livestock Officer (ULO); ask before treating animals privately.'
      ],
      infrastructure: [
        'Protect the structure that holds the livelihood: embankments and sluice gates for polders, roof and walls for sheds and stores.',
        'Agree a water source and a response plan with neighbours before the season, not during it.'
      ]
    },
    health_and_wash_alerts: [
      'Treat or boil drinking water until your tube-well has been made safe; ask the local health worker for the correct treatment for your well rather than applying a generic dose.',
      'Keep the latrine usable and away from the water source, and watch for diarrhoea and fever — start oral rehydration immediately and contact the health service (16263 or the nearest Upazila Health Complex).',
      'Dispose of animal carcasses by burial or as the ULO directs, never into a pond or canal.'
    ],
    // Routed by hazard. The previous list was hardcoded for flooding, so it
    // recommended submergence and salinity varieties in answer to a cold wave.
    recommended_varieties: skill.varieties.length
      ? skill.varieties
      : [`No variety change is the first response to ${String(hazard_type).toLowerCase()} — ask the UAO which variety suits your zone and the days left in the season.`],
    brri_variety_recommendation: 'Buy certified seed from BADC or a licensed dealer, and ask the UAO which variety fits your agro-ecological zone and the days left in your season — the wrong zone costs more than not replanting.',
    post_event_recovery: [
      'Drain standing water as soon as the flood water starts to fall; a waterlogged root zone kills a crop that survived the event itself.',
      'Have the field assessed by the UAO before replanting, and report the loss so relief and input support follow the official record.',
      'Restart feeding and fertilising gradually once growth resumes rather than applying a full dose to a stressed crop.'
    ],
    confidence_caveat: `Generated offline by the deterministic tier because no model provider was available. It contains no live observation and no new measurement${finiteOrNull(confidence) !== null ? `, and the confidence figure supplied with this request (${(finiteOrNull(confidence) * 100).toFixed(0)}%) is the caller's own value, not an estimate of accuracy` : ''}. HazardNet is not an official warning service: follow BMD, FFWC and local administration, and consult the Upazila Agriculture Officer for site-specific advice.`
  };
}

/**
 * Main Orchestration Handler with Multi-Provider Cascade Execution & Caching
 */
/**
 * `env` is the runtime environment: `process.env` on Node (the default, so the
 * Express route and the `serverless/*` twins keep working unchanged) and
 * `context.env` on a Pages Function, passed in by `functions/api/chat/query.ts`.
 */
async function generateAdvisoryWithFallback(params, systemInstruction, prompt, env = defaultEnv()) {
  engineStats.totalRequests += 1;

  // 1. Construct unique cache key. The PROMPT is part of the key: it embeds
  //    the user's actual query + the retrieved RAG context, so two different
  //    questions (even from the same district) must never share a cached
  //    answer. Before 2026-09-17 the key was district:hazard:severity only —
  //    with hazard fixed per caller, every chat turn in a district returned
  //    the first question's answer for 10 minutes.
  // sha256Hex is the portable (Node + Worker) digest — see portableHash.js.
  const promptHash = sha256Hex(`${systemInstruction}\n${prompt}`).slice(0, 16);
  const cacheKey = `${params.district_name || 'dist'}:${params.hazard_type || 'haz'}:${Math.round((params.severity_score || 0) * 10)}:${promptHash}`;
  // Post-read guard: `get` re-runs assertAdvisory and deletes a hollow entry, so a bad
  // generation is a miss that re-runs the cascade rather than a cached answer.
  const cached = advisoryCache.get(cacheKey);
  if (cached.hit) {
    engineStats.cacheHits += 1;
    console.info(`[AI Fallback Engine] Serving cached advisory for key: ${cacheKey}`);
    return { ...cached.entry.data, cached: true };
  }

  // Define multi-tier fallback cascade array
  const cascadeProviders = [
    { key: 'gemini_primary', fn: () => callGeminiPrimary(prompt, systemInstruction, env) },
    { key: 'gemini_secondary', fn: () => callGeminiSecondary(prompt, systemInstruction, env) },
    { key: 'openrouter', fn: () => callOpenRouter(prompt, systemInstruction, env) },
    { key: 'groq', fn: () => callGroq(prompt, systemInstruction, env) },
    { key: 'huggingface', fn: () => callHuggingFace(prompt, systemInstruction, env) },
  ];

  for (const provider of cascadeProviders) {
    if (!isProviderHealthy(provider.key)) {
      continue;
    }

    try {
      console.info(`[AI Fallback Engine] Attempting advisory generation via provider '${provider.key}'...`);
      const result = await provider.fn();

      // Stamp which free-tier LLM actually answered (the deterministic tier
      // sets its own provider_source; never overwrite an explicit one).
      if (result && typeof result === 'object' && !result.provider_source) {
        result.provider_source = PROVIDER_LABELS[provider.key];
      }

      // Store in cache for concurrent request deduplication. Pre-write guard: a hollow
      // generation is NOT cached; the caller still gets whatever the provider returned,
      // and `onReject` logs the named missing fields for the next run.
      const guard = advisoryCache.set(cacheKey, { timestamp: Date.now(), data: result });
      if (!guard.ok) {
        console.warn(`[AI Fallback Engine] advisory not cached: missing ${guard.missing.join(', ')}`);
      }
      return result;
    } catch (err) {
      const msg = String(err?.message || err);

      // A missing key is CONFIGURATION, not provider health. Recording it against
      // the breaker meant two turns with no keys marked every provider unhealthy
      // for 45s — and then a working key (added later, or rotated in) was skipped
      // as "unhealthy" and the engine silently degraded to the heuristic tier
      // while a perfectly good credential sat unused. That is the same silent
      // degradation that made this pipeline look broken, so: not a failure.
      const notConfigured = msg.includes('not configured') || msg.includes('missing');
      if (!notConfigured) recordProviderFailure(provider.key, err);

      if (notConfigured) {
        console.info(`[AI Fallback Engine] Provider '${provider.key}' skipped (${msg}).`);
      } else if (msg.includes('429') || msg.includes('Quota Exceeded') || msg.includes('RESOURCE_EXHAUSTED')) {
        console.info(`[AI Fallback Engine] Provider '${provider.key}' quota/rate-limited (429). Tripping circuit breaker & initiating next fallback tier.`);
      } else {
        console.info(`[AI Fallback Engine] Provider '${provider.key}' unavailable (${msg.slice(0, 120)}). Activating fallback...`);
      }
    }
  }

  // Final Tier: Offline Deterministic Heuristic Engine
  console.info('[AI Fallback Engine] All cloud AI providers unavailable or rate limited. Invoking Tier 6 Offline Neural Heuristic Engine.');
  const heuristicResult = generateDeterministicHeuristicAdvisory(params);
  // Pre-write guard applies to the deterministic tier too — it is still a cache write.
  const guard = advisoryCache.set(cacheKey, { timestamp: Date.now(), data: heuristicResult });
  if (!guard.ok) {
    console.warn(`[AI Fallback Engine] heuristic advisory not cached: missing ${guard.missing.join(', ')}`);
  }
  return heuristicResult;
}

/**
 * Get system status & telemetry for the fallback engine
 */
function getEngineStatus() {
  return {
    circuitBreakers: Object.fromEntries(
      Object.entries(circuitBreakers).map(([k, v]) => [k, { state: v.state, failures: v.failures }])
    ),
    stats: {
      ...engineStats,
      cacheSize: advisoryCache.size(),
      hitRatioPercent: engineStats.totalRequests > 0 ? ((engineStats.cacheHits / engineStats.totalRequests) * 100).toFixed(1) + '%' : '0%'
    }
  };
}

export {
  generateAdvisoryWithFallback,
  getEngineStatus,
  generateDeterministicHeuristicAdvisory
};
