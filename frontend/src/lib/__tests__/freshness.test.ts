import '@testing-library/jest-dom';
/// <reference types="jest" />
/**
 * The freshness client (Phase 7).
 *
 * These are the rules that keep `/status` honest at the boundary where it is easiest to be
 * dishonest: an unrecognised payload must not be drawn as this contract, an unknown age must
 * not become `0 h`, and a failed fetch must not become an empty-but-cheerful table.
 */

import {
  FRESHNESS_URL,
  describeAge,
  describeSlo,
  describeStamp,
  loadFreshness,
  parseFreshness,
  stateLabel,
  stateTone,
} from '../freshness';

const artifact = (over: Record<string, unknown> = {}) => ({
  schema: 'hazardnet-freshness/v1',
  built_at: '2026-09-18T12:00:00.000Z',
  generated_by: 'scripts/build_freshness_artifact.mjs',
  what_this_is: 'A derived statement about the committed data artifacts this deployment ships.',
  overall: { state: 'fresh', counts: { fresh: 2, unknown: 1 }, not_fresh: ['site_probe'] },
  sources: [
    {
      id: 'forecast_snapshot',
      label: 'Website forecast snapshot',
      artifact: 'frontend/public/data/forecasts-latest.json',
      state: 'fresh',
      reason: null,
      generated_at: '2026-09-17T16:11:19.128Z',
      prediction_date: '2026-09-16',
      age_hours: 45.7,
      slo_hours: 192,
      detail: { schema: 'hazardnet-forecast-snapshot/v2' },
    },
    {
      id: 'site_probe',
      label: 'Site-health probe',
      artifact: 'data/site-health/latest.json',
      state: 'unknown',
      reason: 'no probe result has been published to this checkout yet',
      generated_at: null,
      age_hours: null,
      slo_hours: 2,
      outcome: 'unknown',
      detail: null,
    },
  ],
  coverage: {
    status: 'partial',
    produced_units: 74,
    districts_covered: 60,
    districts_expected: 64,
    missing_district_ids: null,
    horizons: ['7_days', '15_days'],
    units_per_horizon: { '7_days': 25, '15_days': 49 },
  },
  model: {
    model_version: null,
    stamped: false,
    tensor_build_id: null,
    pipeline_version: null,
    run_id: null,
    dataset_version: null,
    soil_channels_fabricated: false,
  },
  honesty: ['model_version is null: the ingest pipeline does not stamp one yet.'],
  ...over,
});

const response = (payload: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => payload }) as unknown as Response;

describe('parseFreshness', () => {
  it('accepts the shipped contract', () => {
    const parsed = parseFreshness(artifact());
    expect(parsed).not.toBeNull();
    expect(parsed?.sources).toHaveLength(2);
    expect(parsed?.overall.state).toBe('fresh');
    expect(parsed?.coverage?.districts_covered).toBe(60);
    expect(parsed?.model?.stamped).toBe(false);
  });

  it('refuses a payload from a different contract instead of guessing', () => {
    expect(parseFreshness(artifact({ schema: 'hazardnet-freshness/v2' }))).toBeNull();
    expect(parseFreshness(null)).toBeNull();
    expect(parseFreshness('nope')).toBeNull();
    expect(parseFreshness(artifact({ sources: [] }))).toBeNull();
  });

  it('downgrades unknown states and missing ages rather than trusting the producer', () => {
    const parsed = parseFreshness(
      artifact({
        overall: { state: 'excellent', counts: {}, not_fresh: null },
        sources: [
          {
            id: 'x',
            state: 'sort-of-fine',
            age_hours: '45.7',
            slo_hours: null,
            detail: 'not-an-object',
          },
        ],
        honesty: ['kept', 42],
      }),
    );
    expect(parsed?.overall.state).toBe('unknown');
    expect(parsed?.overall.counts).toEqual({});
    expect(parsed?.sources[0].state).toBe('unknown');
    expect(parsed?.sources[0].age_hours).toBeNull();
    expect(parsed?.sources[0].slo_hours).toBeNull();
    expect(parsed?.sources[0].detail).toBeNull();
    expect(parsed?.honesty).toEqual(['kept']);
  });

  it('treats a present model version as stamped even without the flag', () => {
    const parsed = parseFreshness(
      artifact({ model: { model_version: 'mn-v1', stamped: false } }),
    );
    expect(parsed?.model?.stamped).toBe(true);
    expect(parsed?.model?.model_version).toBe('mn-v1');
  });
});

describe('the labels', () => {
  it('never renders an unknown age as a number', () => {
    expect(describeAge(null)).toBe('—');
    expect(describeAge(undefined)).toBe('—');
    expect(describeAge(Number.NaN)).toBe('—');
    expect(describeAge(-1)).toBe('—');
    expect(describeAge(3.44)).toBe('3.4 h');
    expect(describeAge(71.2)).toBe('3 d');
  });

  it('states the SLO it was measured against, or an em dash', () => {
    expect(describeSlo(192)).toBe('192 h');
    expect(describeSlo(null)).toBe('—');
  });

  it('formats instants in UTC and passes unparseable ones through unchanged', () => {
    expect(describeStamp('2026-09-17T16:11:19.128Z')).toBe('2026-09-17 16:11 UTC');
    expect(describeStamp(null)).toBe('—');
    expect(describeStamp('whenever')).toBe('whenever');
  });

  it('labels every state and gives unknown its own label', () => {
    expect(stateLabel('fresh')).toBe('Within SLO');
    expect(stateLabel('stale')).toBe('Past SLO');
    expect(stateLabel('failing')).toBe('Checks failing');
    expect(stateLabel('missing')).toBe('No data');
    expect(stateLabel('unknown')).toBe('Unknown');
    expect(stateTone('failing')).toContain('rose');
    expect(stateTone('fresh')).toContain('emerald');
  });
});

describe('loadFreshness', () => {
  it('returns the parsed artifact on success, with a no-store request', async () => {
    const fetcher = jest.fn(async () => response(artifact()));
    const result = await loadFreshness({ fetcher: fetcher as unknown as typeof fetch });
    expect(result.error).toBeNull();
    expect(result.artifact?.overall.state).toBe('fresh');
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith(FRESHNESS_URL)).toBe(true);
    expect(init.cache).toBe('no-store');
  });

  it('reports a non-200, an unrecognised payload and a thrown fetch without throwing', async () => {
    const notFound = await loadFreshness({
      fetcher: (async () => response({}, false, 404)) as unknown as typeof fetch,
    });
    expect(notFound.artifact).toBeNull();
    expect(notFound.error).toBe('HTTP 404');

    const wrongSchema = await loadFreshness({
      fetcher: (async () => response({ schema: 'something-else' })) as unknown as typeof fetch,
    });
    expect(wrongSchema.error).toMatch(/unrecognised payload/);

    const thrown = await loadFreshness({
      fetcher: (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    });
    expect(thrown.artifact).toBeNull();
    expect(thrown.error).toBe('network down');
  });

  it('reports the absence of a fetch implementation instead of pretending to be offline', async () => {
    const result = await loadFreshness({ fetcher: undefined });
    expect(result.artifact).toBeNull();
    expect(result.error).toBe('no fetch implementation available');
    expect(result.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
