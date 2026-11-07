/**
 * Answer review — the "checking" half of the agent.
 *
 * WHY THIS EXISTS
 * ---------------
 * Everything upstream of this can work perfectly and the answer can still be
 * wrong, because the last step is a language model restating evidence it was
 * given. The specific failures worth catching are the ones this pipeline has
 * already produced: a severity percentage that appeared in no artifact, an
 * "all clear" inferred from an empty result set, and a claim about current
 * conditions when nothing current was ever read.
 *
 * This is a deterministic checker, not a judge. It flags; it does not rewrite.
 * The flags travel in the response so the UI can show them and an operator can
 * see them, and so a test can pin each rule. A reviewer that silently edits the
 * answer would be another unaccountable voice in the pipeline.
 *
 * FALSE POSITIVES ARE THE REAL RISK
 * ---------------------------------
 * A reviewer that cries wolf gets ignored, so the numeric check only looks at
 * figures that are *claims about the world* — percentages, and numbers beside
 * "severity" or "confidence" — and allows anything that appears in the evidence,
 * in the retrieved knowledge base, or in the small set of public constants this
 * product quotes (helplines, released variety names, standard time windows).
 * Ordinary prose numbers are left alone.
 */

/** Public constants the product legitimately states without evidence. */
const ALLOWED_CONSTANTS = new Set([
  999, 1090, 16123, 16163, 16263, 109, // national helplines
  24, 48, 72, 7, 15, 3, 5, 10, // standard action windows in hours/days
  49, 51, 52, 53, 56, 71, 47, 33, // BRRI dhan / BARI Gom variety numbers
  0, 1, 100,
]);

const ALL_CLEAR = /\b(no risk|no danger|all clear|completely safe|entirely safe|nothing to worry)\b/i;
const ALL_CLEAR_GLOBAL = /\b(no risk|no danger|all clear|completely safe|entirely safe|nothing to worry)\b/gi;
// Scoped to the claims that are actually wrong. "An official warning has been
// issued" and "HazardNet issued a warning" both assert something this product
// cannot do. "BMD issued a warning" is deliberately NOT matched — attributing a
// warning to the body that can issue one is correct, and flagging it would be a
// false positive. "HazardNet does not issue official warnings" is the disclaimer
// we want, and the denial window below protects it.
const OFFICIAL_CLAIM = /\b(official warning|official alert|hazardnet (?:has )?issu\w* (?:an? )?warning)\b/gi;
const OFFICIAL_DENIAL = /\b(not|never|cannot|can't|does not|doesn't|isn't|no such|rather than|instead of)\b/i;
const LIVE_ASSERTION = /\b(currently|right now|at this moment|today's (?:weather|forecast)|as of today)\b/i;

const collectNumbers = (source) => {
  const found = new Set();
  const walk = (node, depth = 0) => {
    if (depth > 6) return;
    if (typeof node === 'number' && Number.isFinite(node)) {
      found.add(node);
      return;
    }
    if (typeof node === 'string') {
      for (const match of node.match(/-?\d+(?:\.\d+)?/g) ?? []) {
        const value = Number(match);
        if (Number.isFinite(value)) found.add(value);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (node && typeof node === 'object') {
      for (const value of Object.values(node)) walk(value, depth + 1);
    }
  };
  walk(source);
  return found;
};

/**
 * Review a drafted answer.
 *
 * @param {object} options
 * @param {string} options.answer the Markdown answer about to be returned
 * @param {object} [options.agent] the `runAgent()` result
 * @param {Array} [options.knowledge] retrieved knowledge-base documents
 * @returns {{ok: boolean, flags: Array<{code: string, detail: string}>}}
 */
export function reviewAnswer({ answer, agent = null, knowledge = [] } = {}) {
  const text = String(answer ?? '');
  const flags = [];
  if (!text.trim()) return { ok: true, flags };

  const allowed = new Set(ALLOWED_CONSTANTS);
  for (const entry of agent?.evidence ?? []) {
    for (const value of entry.values ?? []) {
      if (typeof value === 'number') {
        allowed.add(value);
        allowed.add(Number(value.toFixed(1)));
        allowed.add(Number(value.toFixed(2)));
        allowed.add(Math.round(value * 100)); // a 0.3 score quoted as 30%
      }
    }
  }
  for (const doc of knowledge) allowed.add(...collectNumbers(doc.body));
  for (const doc of knowledge) allowed.add(...collectNumbers(doc.title));

  // 1. A metric quoted to the user has to exist somewhere in what was read.
  const metricClaims = [
    ...[...text.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g)].map((m) => ({ value: Number(m[1]), where: `${m[1]}%` })),
    ...[...text.matchAll(/\b(?:severity|confidence|score)\D{0,12}(\d{1,3}(?:\.\d+)?)\s*%?/gi)].map((m) => ({
      value: Number(m[1]),
      where: m[0].trim(),
    })),
  ];
  for (const claim of metricClaims) {
    const value = Number(claim.value);
    if (allowed.has(value) || allowed.has(Number(value.toFixed(1)))) continue;
    // Allow the hundredths form too: 0.905 is legitimately quoted as 90.5.
    if (allowed.has(Number((value / 100).toFixed(3))) || allowed.has(Number((value / 100).toFixed(2)))) continue;
    flags.push({
      code: 'unsupported_metric',
      detail: `"${claim.where}" does not appear in the artifacts the agent read or the knowledge base cited.`,
    });
  }

  // 2. Absence of data is not absence of risk.
  //
  // Negation-aware on purpose. "There is no risk" is a claim; "an empty result
  // means no row was published, not that there is no risk" is the correct
  // explanation, and flagging it would train everyone to ignore the reviewer.
  // The window either side of the phrase is checked for a denial.
  for (const match of text.matchAll(ALL_CLEAR_GLOBAL)) {
    const window = text.slice(Math.max(0, match.index - 60), match.index + match[0].length + 20);
    if (/\b(not|never|rather than|instead of|does not|doesn't|isn't|no such|nor)\b/i.test(window)) continue;
    flags.push({
      code: 'all_clear_claim',
      detail: 'The answer states or implies there is no risk. An empty or missing result means no row was published, not that the hazard is absent.',
    });
    break;
  }

  // 3. Claiming current conditions with nothing current read.
  const liveRead = (agent?.steps ?? []).some((step) => step.ok);
  if (!liveRead && LIVE_ASSERTION.test(text)) {
    flags.push({
      code: 'live_claim_without_data',
      detail: 'The answer asserts current conditions, but no live tool call succeeded, so nothing current was read.',
    });
  }

  // 4. HazardNet cannot issue an official warning.
  for (const match of text.matchAll(OFFICIAL_CLAIM)) {
    const window = text.slice(Math.max(0, match.index - 60), match.index + match[0].length + 20);
    if (OFFICIAL_DENIAL.test(window)) continue;
    flags.push({
      code: 'official_warning_claim',
      detail: 'The answer implies an official warning was issued. Official warnings come from BMD, FFWC and local administration.',
    });
    break;
  }

  return { ok: flags.length === 0, flags };
}
