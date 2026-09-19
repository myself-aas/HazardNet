/**
 * @jest-environment node
 *
 * The severity-index publication embargo (constraint C1) and the owner decision
 * that closed its last open question.
 *
 * `scripts/check-severity-embargo.mjs` has two tiers. The `block` tier fails the
 * build on derivation language (weights, calibrated thresholds, cluster
 * membership, research framing). The `review` tier prints composite-index copy
 * that only the owner can classify — and until 2026-09-19 it printed the same two
 * `NationalOverview.tsx` phrases on every single run, which is how a question
 * stays open forever.
 *
 * ADR 0012 records the answer: both are **presentation aggregations** (a district
 * count multiplied by the mean of the per-district severity the product already
 * publishes), not the embargoed derived index, and they are kept *on the condition
 * that the copy says so*. These tests hold both halves of that: the live tree is
 * classified and clean, and removing the disclosure label turns the phrase back
 * into a build failure instead of silently becoming an unqualified index.
 *
 * One review item is left open on purpose and pinned below: the weighted
 * `Vulnerability Formula` in the same component, which the ADR escalates to the
 * owner rather than classifies.
 */

import { spawnSync } from 'node:child_process';

import {
  LABEL_WINDOW_CHARS,
  REVIEW_CLASSIFICATIONS,
  applyClassification,
  findClassification,
  scan,
} from '../scripts/check-severity-embargo.mjs';

const COMPONENT = 'frontend/src/components/NationalOverview.tsx';
const DECIDED = '2026-09-19';

const reviewMatch = (file = COMPONENT, match = 'Composite Risk Index') => ({
  tier: 'review',
  file,
  line: 1,
  rule: 'composite-index',
  match,
  why: 'A composite index with a stated formula in public copy.',
});

describe('severity embargo — the live tree', () => {
  let violations;

  beforeAll(() => {
    violations = scan();
  });

  it('finds nothing that blocks the build', () => {
    expect(violations.filter((v) => v.tier === 'block')).toEqual([]);
  });

  it('has exactly one review item still open, and it is the named one', () => {
    // ADR 0012 classified the two composite-index blocks. The weighted
    // `Vulnerability Formula` in the same component is deliberately left open: it
    // prints explicit coefficients (× 0.6 / × 0.4), and whether those belong to
    // the embargoed index or to a presentation-level ranking is the owner's call,
    // not the gate's (ADR 0012, "Not decided here"). Pinning the exact list means
    // a *second* unclassified phrase fails this test instead of quietly joining
    // the standing noise — the failure mode that kept the original two open.
    const awaiting = violations.filter((v) => v.tier === 'review' && !v.classification);
    expect(awaiting.map((v) => `${v.file} [${v.rule}] "${v.match}"`)).toEqual([
      `${COMPONENT} [weighted-formula] "Vulnerability Formula"`,
    ]);
  });

  it('reports exactly the two classified blocks, with the decision attached', () => {
    const classified = violations.filter((v) => v.classification);
    expect(classified.map((v) => v.match).sort()).toEqual([
      'Composite Hazard Score',
      'Composite Risk Index',
    ]);
    for (const v of classified) {
      expect(v.file).toBe(COMPONENT);
      expect(v.classification).toBe('presentation-aggregation');
      expect(v.decided).toBe(DECIDED);
      // The basis is what a future reader argues with; an empty one is a guess.
      expect(v.basis.length).toBeGreaterThan(40);
    }
  });
});

describe('severity embargo — the classification registry', () => {
  it('carries a file, a phrase, a date, a basis and a label pattern per entry', () => {
    expect(REVIEW_CLASSIFICATIONS.length).toBeGreaterThan(0);
    for (const entry of REVIEW_CLASSIFICATIONS) {
      expect(typeof entry.file).toBe('string');
      expect(entry.file.length).toBeGreaterThan(0);
      expect(typeof entry.match).toBe('string');
      expect(entry.classification).toBe('presentation-aggregation');
      expect(entry.decided).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof entry.basis).toBe('string');
      expect(entry.label).toBeInstanceOf(RegExp);
    }
  });

  it('classifies the phrase only in the file the owner reviewed', () => {
    // The registry must not become a blanket allowlist: the same words on a new
    // page are a new question, and have to be asked again.
    expect(findClassification('frontend/src/pages/About.tsx', 'Composite Risk Index')).toBeNull();
    expect(findClassification(COMPONENT, 'Composite Risk Index')).not.toBeNull();
  });

  it('matches the registered phrase case-insensitively', () => {
    expect(findClassification(COMPONENT, 'composite hazard score')).toMatchObject({
      classification: 'presentation-aggregation',
    });
  });
});

describe('severity embargo — the disclosure label is part of the decision', () => {
  it('keeps a labelled phrase in the review tier', () => {
    const text =
      '<h4>Composite Risk Index = Hazard District Count × Average Severity Score</h4>' +
      '<p>Presentation aggregation — a count multiplied by the mean of the published severity.</p>';
    const out = applyClassification(reviewMatch(), text, text.indexOf('Composite Risk Index'));
    expect(out.tier).toBe('review');
    expect(out.classification).toBe('presentation-aggregation');
  });

  it('escalates to a build failure when the label is deleted', () => {
    const text = '<h4>Composite Risk Index = Hazard District Count × Average Severity Score</h4>';
    const out = applyClassification(reviewMatch(), text, text.indexOf('Composite Risk Index'));
    expect(out.tier).toBe('block');
    expect(out.rule).toBe('composite-index-unlabelled');
    expect(out.why).toMatch(/ADR 0012/);
    // The decision stays visible in the report even when it is being violated.
    expect(out.classification).toBe('presentation-aggregation');
  });

  it('escalates when the label drifts further away than the window allows', () => {
    const gap = 'padding '.repeat(Math.ceil((LABEL_WINDOW_CHARS + 64) / 8));
    const text = `Composite Risk Index${gap}Presentation aggregation of published values.`;
    const out = applyClassification(reviewMatch(), text, 0);
    expect(out.tier).toBe('block');
  });

  it('leaves an unclassified phrase exactly as the rules found it', () => {
    const unclassified = reviewMatch('frontend/src/pages/HazardArchivePage.tsx');
    expect(applyClassification(unclassified, 'Composite Risk Index', 0)).toEqual(unclassified);
  });
});

describe('severity embargo — the gate as CI runs it', () => {
  // No cwd: jest runs from the repository root, which is what the gate's own
  // SCAN_ROOTS are relative to (same pattern as __tests__/alertSnapshot.test.js).
  const run = (args = []) =>
    spawnSync('node', ['scripts/check-severity-embargo.mjs', ...args], { encoding: 'utf8' });

  it('exits 0 and names the recorded decision', () => {
    const { status, stdout } = run();
    expect(status).toBe(0);
    expect(stdout).toMatch(/classified: 2 composite-index reference/);
    expect(stdout).toMatch(/presentation-aggregation/);
    expect(stdout).toMatch(/PASS/);
  });

  it('keeps the undecided item visible even while the gate passes', () => {
    // Passing must not read as "nothing is open". The review tier goes to stderr,
    // so a green run still names what the owner has not classified yet — here the
    // weighted `Vulnerability Formula` that ADR 0012 escalates instead of deciding.
    const { status, stderr } = run();
    expect(status).toBe(0);
    expect(stderr).toMatch(/review: 1 reference\(s\) awaiting owner classification/);
    expect(stderr).toMatch(/weighted-formula\]\s+"Vulnerability Formula"/);
  });

  it('reports the same thing as JSON', () => {
    const { status, stdout } = run(['--json']);
    expect(status).toBe(0);
    const json = JSON.parse(stdout);
    expect(json.ok).toBe(true);
    expect(json.blocked).toEqual([]);
    expect(json.review.map((v) => `${v.file} [${v.rule}] "${v.match}"`)).toEqual([
      `${COMPONENT} [weighted-formula] "Vulnerability Formula"`,
    ]);
    expect(json.classified).toHaveLength(2);
    expect(json.stale_classifications).toEqual([]);
  });
});
