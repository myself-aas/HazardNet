/**
 * Agent loop — think, plan, act, check. Then hand the evidence to the answer.
 *
 * THE SHAPE OF IT
 * ---------------
 * `runAgent()` resolves dependencies between steps, calls the read-only MCP tool
 * pack, checks what came back, and returns a trace. It does not write an answer:
 * the answer is still composed by the provider cascade in `chatService`, because
 * that cascade is the part with five fallbacks and a circuit breaker, and
 * duplicating it here would mean two places to keep honest.
 *
 * So the division is deliberate. The agent decides WHAT to look at and reports
 * WHAT IT FOUND; the model turns that into language; `review.js` then checks the
 * language against the evidence.
 *
 * WHY EVERY STEP IS RECORDED
 * --------------------------
 * The trace is not a debugging aid, it is part of the response. An answer that
 * says "the outlook for Sunamganj is quiet" is worthless unless you can see that
 * the agent read the forecast artifact, got zero rows, and that zero rows is not
 * the same thing as no risk. `steps` therefore carries the tool, the arguments,
 * whether it succeeded, what it returned in one line, and how long it took — and
 * a step that was skipped says why instead of silently vanishing.
 *
 * NOTHING HERE IS OPTIONAL-LOOKING BUT ACTUALLY REQUIRED
 * ------------------------------------------------------
 * If no public artifact reader is available in the runtime, the loop reports
 * `enabled: false` with the reason and the answer proceeds on knowledge alone.
 * It never throws: a support agent that 500s because it could not read an
 * artifact is worse than one that answers without it and says so.
 */

import { executeMcpTool } from '../mcp/tools.js';
import { buildPlan } from '../../packages/core/src/agent/planner.js';

const MAX_STEPS = 4;
const DIGEST_BUDGET = 900;

/** One line per tool result: what an operator (and the model) needs, no more. */
function digestFor(tool, data) {
  if (!data || typeof data !== 'object') return 'no structured result';
  switch (tool) {
    case 'get_district_info': {
      const d = data.district ?? {};
      return `${d.district_name ?? '?'} · ${d.division ?? '?'} division · pcode ${d.pcode ?? '?'} · centroid ${d.latitude ?? '?'},${d.longitude ?? '?'}`;
    }
    case 'get_hazard_forecast': {
      const rows = data.advisories ?? data.records ?? [];
      const run = data.run ?? {};
      const head = `status ${data.status ?? '?'} · ${rows.length} row(s) · run ${run.generatedAt ?? '?'}${run.expiresAt ? ` expires ${run.expiresAt}` : ''}`;
      if (!rows.length) {
        // The single most important sentence this module can produce.
        return `${head} · NO PUBLISHED ROW for this district/hazard/date — absence of a row is not an all-clear`;
      }
      const first = rows[0];
      return `${head} · first: ${first.target_date ?? first.date ?? '?'} ${first.hazard_type ?? first.hazard ?? '?'} severity ${first.severity_score ?? '?'} confidence_kind ${first.confidence_kind ?? '?'}`;
    }
    case 'list_alerts': {
      const rows = data.records ?? [];
      if (!rows.length) return `${data.total_count ?? 0} published alert(s) matching the filter · none in force`;
      const levels = [...new Set(rows.map((r) => r.level).filter(Boolean))].join('/') || 'none';
      const first = rows[0];
      return `${data.total_count ?? rows.length} published alert(s) · levels ${levels} · top: ${first.level} ${first.hazard_type} target ${first.target_date} severity ${first.severity_score} confidence_kind ${first.confidence_kind}`;
    }
    case 'get_weather': {
      const c = data.current ?? data;
      return `observed ${c.time ?? '?'} · ${c.temperature_2m ?? '?'}°C · precipitation ${c.precipitation ?? '?'}mm · wind ${c.wind_speed_10m ?? '?'} km/h · ${data.source ?? 'upstream read'}`;
    }
    case 'get_historical_events': {
      const rows = data.records ?? [];
      return rows.length
        ? `${data.total_count ?? rows.length} historical event(s) · e.g. ${rows.slice(0, 2).map((r) => `${r.year ?? r.date ?? '?'} ${r.hazard_type ?? r.hazard ?? ''} ${r.district_name ?? ''}`.trim()).join('; ')}`
        : 'no published historical events for this filter';
    }
    case 'get_site_status': {
      const s = data.status ?? {};
      return `freshness artifact built ${s.built_at ?? '?'} · ${s.what_this_is ? 'a build-time statement about artifacts, not a live health probe' : 'no detail'}`;
    }
    case 'get_hazard_info': {
      const text = typeof data.markdown === 'string' ? data.markdown : JSON.stringify(data);
      return `published explainer (${text.length} chars): ${text.slice(0, 160).replace(/\s+/g, ' ')}…`;
    }
    default:
      return JSON.stringify(data).slice(0, 160);
  }
}

/** Numbers worth checking the final answer against. */
function evidenceFrom(tool, data) {
  const values = new Set();
  const walk = (node, depth = 0) => {
    if (depth > 4 || node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'number' && Number.isFinite(value)) values.add(value);
      else if (typeof value === 'string' && /^(level|hazard_type|target_date|status|confidence_kind|district_name)$/i.test(key)) {
        values.add(value);
      } else if (value && typeof value === 'object') walk(value, depth + 1);
    }
  };
  if (data && typeof data === 'object') walk(data);
  return { tool, values: [...values] };
}

/**
 * Run the plan.
 *
 * @param {object} options
 * @param {string} options.query
 * @param {string|null} [options.district]
 * @param {string} [options.skill] routed skill label, for the hazard enum
 * @param {object} [options.env] runtime env — `context.env` on Pages
 * @param {object} [options.assets] public artifact reader; Pages supplies one on
 *   `env.ASSETS`, Node callers pass `createNodeAssetReader()`. Without either the
 *   loop reports itself disabled rather than failing.
 * @param {Request} [options.request] base request for URL/signal; synthesised if absent
 * @returns {Promise<{enabled:boolean, reason:string|null, plan:object, steps:Array,
 *   evidence:Array, digest:string, tools_called:string[]}>}
 */
export async function runAgent({
  query,
  district = null,
  skill = 'Multi-Hazard',
  env = {},
  assets = null,
  request = null,
  maxSteps = MAX_STEPS,
} = {}) {
  const plan = buildPlan({ query, district, skill, maxSteps });
  const base = { enabled: false, reason: null, plan, steps: [], evidence: [], digest: '' };

  const resolvedAssets = assets ?? env?.ASSETS ?? null;
  if (!resolvedAssets) {
    return { ...base, reason: 'no public artifact reader in this runtime — answered from the knowledge base alone' };
  }
  if (!plan.steps.length) {
    return { ...base, reason: 'no tool was relevant to this question' };
  }

  const baseRequest = request ?? new Request('https://hazardnet.live/api/agent');
  const steps = [];
  const evidence = [];
  const results = new Map();

  for (const planned of plan.steps) {
    const startedAt = Date.now();

    // A step whose dependency did not resolve is skipped, loudly. Silently
    // dropping it is how an answer ends up asserting something nobody checked.
    if (planned.needs) {
      const source = results.get(planned.needs.from);
      const holder = source?.district ?? source;
      const values = (planned.needs.fields ?? []).map((field) => holder?.[field]);
      if (!holder || values.some((value) => value === undefined || value === null)) {
        steps.push({
          ...planned,
          ok: false,
          skipped: `dependency ${planned.needs.from} did not supply ${planned.needs.fields.join(', ')}`,
          ms: Date.now() - startedAt,
        });
        continue;
      }
      planned.args = { latitude: values[0], longitude: values[1] };
    }

    if (!planned.tool) {
      steps.push({ ...planned, ok: false, ms: Date.now() - startedAt });
      continue;
    }

    let result;
    try {
      result = await executeMcpTool(planned.tool, planned.args ?? {}, { ...env, ASSETS: resolvedAssets }, baseRequest);
    } catch (error) {
      steps.push({
        ...planned,
        ok: false,
        error: String(error?.message ?? error).slice(0, 160),
        ms: Date.now() - startedAt,
      });
      continue;
    }

    const ms = Date.now() - startedAt;

    if (result?.invalidParams) {
      steps.push({ ...planned, ok: false, invalidParams: true, error: result.message, ms });
      continue;
    }
    if (result?.isError) {
      steps.push({
        ...planned,
        ok: false,
        error: result.structuredContent?.error ?? 'tool error',
        digest: digestFor(planned.tool, null),
        ms,
      });
      continue;
    }

    const data = result.structuredContent;
    results.set(planned.tool, data);
    evidence.push(evidenceFrom(planned.tool, data));
    const digest = digestFor(planned.tool, data);
    steps.push({ ...planned, ok: true, digest, ms });
  }

  const succeeded = steps.filter((step) => step.ok);
  const toolsCalled = succeeded.map((step) => step.tool);
  let digest = succeeded.length
    ? `=== LIVE DATA READ BY THE AGENT (${succeeded.length} tool call(s)) ===\n` +
      steps
        .map((step) => `- ${step.tool ?? 'skipped'}${step.ok ? `: ${step.digest}` : ` — NOT AVAILABLE (${step.skipped ?? step.error ?? 'skipped'})`}`)
        .join('\n') + '\n'
    : '';

  if (digest.length > DIGEST_BUDGET) digest = `${digest.slice(0, DIGEST_BUDGET - 20)}\n[digest truncated]\n`;

  return {
    enabled: true,
    reason: succeeded.length ? null : 'every planned tool call failed — answered from the knowledge base alone',
    plan,
    steps,
    evidence,
    digest,
    tools_called: toolsCalled,
  };
}
