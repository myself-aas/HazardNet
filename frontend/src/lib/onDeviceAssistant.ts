/**
 * The on-device assistant.
 *
 * When the network is unavailable the `/assistant` page still answers, using the
 * retrieval, planning and review code from `@hazardnet/core` that the server runs.
 * One implementation on both sides is the point: a second copy in the frontend is
 * how the two drift, and then the page would cite a corpus the server does not have.
 *
 * WHAT THIS CAN AND CANNOT DO
 * ---------------------------
 * It can read the published knowledge base, because that corpus is compiled into
 * the bundle. It CANNOT read live data. Every planned tool call (`list_alerts`,
 * `get_hazard_forecast`, `get_weather`) needs the network, so each is reported as
 * skipped with the reason rather than quietly dropped: an answer that omits the
 * steps it could not run reads as an answer that checked them.
 *
 * The prose is assembled from the retrieved documents, not written by a model, and
 * it says so. Nothing here invents a figure, a warning status or a severity index;
 * the reviewer runs over the result exactly as it does server-side, so a claim that
 * is not in the cited documents is still flagged.
 */

import { buildPlan, retrieveKnowledge, reviewAnswer } from '@hazardnet/core';

interface OnDeviceStep {
  step: number;
  tool: string | null;
  args: Record<string, unknown> | null;
  purpose: string | null;
  ok: boolean;
  digest: string | null;
  skipped: string | null;
  error: string | null;
  ms: number | null;
}

interface OnDeviceSource {
  id: string;
  title: string;
  category: string;
  authority?: string;
  url?: string | null;
  basis?: string | null;
  relevanceScore?: number;
  snippet?: string;
}

export interface OnDeviceAnswer {
  answer: string;
  retrieved_sources: OnDeviceSource[];
  retrieval: {
    engine: string;
    applied: boolean;
    reason: string;
    candidates: number;
    cited: number;
    omitted: number;
  };
  agent: {
    enabled: boolean;
    reason: string | null;
    goal: string | null;
    district: string | null;
    hazard: string | null;
    intents: string[];
    steps: OnDeviceStep[];
    tools_called: string[];
    review: { ok: boolean; flags: Array<{ code: string; detail: string }> };
  };
  provider_source: string;
}

/** How many retrieved documents the on-device answer quotes. */
const MAX_CITED = 4;

const BASIS_LABEL: Record<string, string> = {
  'repo-artifact': 'published HazardNet artifact',
  'official-directory': 'official directory',
  'general-practice': 'general practice',
};

/**
 * Answer a question entirely on the device.
 *
 * @param query the reader's question
 * @param district optional district, as typed in the district field
 * @returns the same response shape `/api/chat/query` returns, so the page renders
 *   an on-device turn and a server turn identically
 */
export async function answerOnDevice(
  query: string,
  district?: string | null,
): Promise<OnDeviceAnswer> {
  const plan = buildPlan({ query, district: district?.trim() || null });

  // `retrieveKnowledge` is async because it can re-rank with an embedding model.
  // On device there is no key, so it resolves to the lexical result immediately.
  // It returns `{ results, retrieval }`, not an array: `retrieval` records which
  // engine actually ran, and reporting that is the whole point of the trace.
  const { results, retrieval: retrievalInfo } = await retrieveKnowledge(query, {
    district: plan.district,
    hazard: plan.hazard,
    limit: MAX_CITED,
  });

  const cited = results.slice(0, MAX_CITED);
  const sources: OnDeviceSource[] = cited.map((doc) => ({
    id: doc.id,
    title: doc.title,
    category: doc.category,
    // Passed through rather than coalesced to null: `RetrievedSource` on the page
    // declares `authority?: string`, and a null here would not be assignable to it.
    authority: doc.authority,
    url: doc.url ?? null,
    basis: doc.basis ?? null,
    relevanceScore: doc.score,
    snippet: doc.snippet ?? '',
  }));

  const answer = composeAnswer({ plan, sources });
  const review = reviewAnswer({ answer, knowledge: cited });

  // Every planned call needed the network, so none ran. They stay in the trace.
  const steps: OnDeviceStep[] = plan.steps.map((step) => ({
    step: step.step,
    tool: step.tool ?? null,
    args: (step.args as Record<string, unknown> | undefined) ?? null,
    purpose: step.purpose ?? null,
    ok: false,
    digest: null,
    skipped: 'Not run: this answer was produced on your device, so no live artifact could be read.',
    error: null,
    ms: null,
  }));

  return {
    answer,
    retrieved_sources: sources,
    retrieval: {
      // Reported by the retrieval itself rather than assumed here: on device there is
      // no embedding key, so this comes back `bm25` / not applied, and the reason is
      // the retrieval's own ("no embedding key configured") rather than a claim this
      // module makes about itself.
      engine: retrievalInfo.engine,
      applied: retrievalInfo.applied,
      reason: retrievalInfo.reason,
      candidates: retrievalInfo.candidates,
      cited: sources.length,
      omitted: Math.max(0, results.length - sources.length),
    },
    agent: {
      enabled: false,
      reason: 'Answered on your device. No network, so no live alert, outlook or weather data was read.',
      goal: plan.goal,
      district: plan.district,
      hazard: plan.hazard,
      intents: plan.intents as string[],
      steps,
      tools_called: [],
      review: { ok: review.ok, flags: review.flags },
    },
    provider_source: 'on-device',
  };
}

/**
 * Assemble the answer prose from the retrieved documents.
 *
 * Deliberately mechanical. Every sentence below is either a fixed disclosure or a
 * quoted field from a cited document, so there is nothing here that could state a
 * condition the page did not read.
 */
function composeAnswer({
  plan,
  sources,
}: {
  plan: { goal: string; district: string | null; hazard: string | null };
  sources: OnDeviceSource[];
}): string {
  const lines: string[] = [];

  lines.push('**This answer was produced on your device.**');
  lines.push('');
  lines.push(
    'HazardNet could not be reached, so no live alert, outlook or weather data was read. ' +
      'What follows comes only from the published knowledge base stored in this app, and it ' +
      'does not tell you what is in force right now.',
  );

  if (plan.district) {
    lines.push('');
    lines.push(
      `For ${plan.district}, check the current position with the Bangladesh Meteorological ` +
        'Department, the Flood Forecasting and Warning Centre, or your district administration ' +
        'before acting on anything here.',
    );
  }

  if (sources.length === 0) {
    lines.push('');
    lines.push(
      'Nothing in the stored knowledge base matched this question closely enough to quote. ' +
        'Rephrase it, or reconnect and ask again for a live answer.',
    );
    return lines.join('\n');
  }

  lines.push('');
  lines.push('**What the published guidance says**');
  sources.forEach((source, index) => {
    const basis = source.basis ? BASIS_LABEL[source.basis] ?? source.basis : null;
    const attribution = [source.authority, basis].filter(Boolean).join(', ');
    lines.push('');
    lines.push(`${index + 1}. **${source.title}**${attribution ? ` (${attribution})` : ''}`);
    if (source.snippet) {
      lines.push(`   ${source.snippet}`);
    }
  });

  lines.push('');
  lines.push(
    'In an emergency call 999. For flood forecasting call the FFWC on 16123.',
  );

  return lines.join('\n');
}
