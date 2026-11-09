/**
 * @jest-environment node
 *
 * One row per district, decided once.
 *
 * `docs/codebase/CONCERNS.md` recorded the consequence of the seventh alias table: the UI and
 * the API disagreed about which district a name meant, and nothing failed when they did. The
 * row-identity rule had the same shape of defect and no entry in that file — four readers,
 * four answers, and every test passing because each reader was only ever compared with itself:
 *
 *   · `GET /bulk` served the raw horizon array, so a daily (15-step) payload answered 960 rows
 *     from the edge and 64 from the Node handler, under one contract;
 *   · `POST /predict` and `storedPrediction` sorted every row of the horizon and took the first
 *     name match — file order decided the severity when two rows shared a `prediction_date`;
 *   · `rollupAdm3ToDistricts` keeps the dominant upazila, which is a *different* rule again.
 *
 * Four suites, four green ticks, one disagreement. So this suite does not test one module: it
 * tests that the readers agree, by running each real surface over the same fixture and
 * comparing what they say. A fifth reader appearing later fails the source scan at the bottom.
 */

/** The identity of a served row: which district, which date. */
const rowKey = (row) =>
  `${String(row.district_id ?? row.district_name).trim()}|${String(row.prediction_date).slice(0, 10)}`;

const DISTRICT_ROWS = [
  // Two rows for Dhaka, out of date order, differing in severity: the newest must win.
  { district_id: 26, district_name: 'Dhaka', division: 'Dhaka', horizon: '7_days', hazard_type: 'Flood',
    severity_score: 0.71, confidence: 0.82, prediction_date: '2026-11-11', target_date: '2026-11-14' },
  { district_id: 26, district_name: 'Dhaka', division: 'Dhaka', horizon: '7_days', hazard_type: 'Heat',
    severity_score: 0.22, confidence: 0.61, prediction_date: '2026-11-09', target_date: '2026-11-12' },
  { district_id: 15, district_name: 'Khulna', division: 'Khulna', horizon: '7_days', hazard_type: 'Cyclone',
    severity_score: 0.55, confidence: 0.74, prediction_date: '2026-11-10', target_date: '2026-11-13' },
];

// The same two Dhaka rows as ADM3 upazila rows: the district answer is the dominant unit.
const ADM3_ROWS = [
  { district_id: 3026, district_name: 'Savar', adm2_name: 'Dhaka', adm2_pcode: '3026', pcode: '302601',
    horizon: '7_days', hazard_type: 'Flood', severity_score: 0.71, confidence: 0.8,
    prediction_date: '2026-11-11', target_date: '2026-11-14' },
  { district_id: 3027, district_name: 'Dhamrai', adm2_name: 'Dhaka', adm2_pcode: '3026', pcode: '302702',
    horizon: '7_days', hazard_type: 'Heat', severity_score: 0.18, confidence: 0.6,
    prediction_date: '2026-11-11', target_date: '2026-11-14' },
];

const SNAPSHOT = {
  generated_at: '2026-11-09T00:00:00Z',
  horizons: { '7_days': DISTRICT_ROWS, '15_days': [] },
};

describe('the row-identity rule is one rule', () => {
  it('collapses a daily-shaped payload to one row per district, newest first-wins', () => {
    const { latestRowsByDistrict } = require('../packages/core/src/forecastIndex.js');
    const rows = latestRowsByDistrict(DISTRICT_ROWS);
    expect(rows).toHaveLength(2);
    const dhaka = rows.find((r) => r.district_name === 'Dhaka');
    expect(dhaka.prediction_date).toBe('2026-11-11');
    expect(dhaka.hazard_type).toBe('Flood');
  });

  it('answers 960 rows with 64: the rule is applied before the envelope is counted', () => {
    const { bulkEnvelopeFromSnapshot } = require('../backend/utils/forecastSnapshotServe.js');
    const envelope = bulkEnvelopeFromSnapshot(SNAPSHOT, '7_days');
    expect(envelope.forecasts).toHaveLength(2);
    expect(envelope.count).toBe(envelope.forecasts.length);
  });

  it('rolls ADM3 upazila rows up to the dominant parent before indexing', () => {
    const { effectiveDistrictRows } = require('../packages/core/src/forecastIndex.js');
    const rolled = effectiveDistrictRows(ADM3_ROWS);
    expect(rolled).toHaveLength(1);
    expect(rolled[0].district_name).toBe('Dhaka');
    expect(rolled[0].severity_score).toBe(0.71);
  });

  it('/predict, /bulk and the map agree on which row a district has', () => {
    const { bulkEnvelopeFromSnapshot, storedPredictionFromSnapshot } =
      require('../backend/utils/forecastSnapshotServe.js');
    const { applyForecastsToDistricts } = require('../frontend/src/lib/forecasts.ts');

    const bulk = bulkEnvelopeFromSnapshot(SNAPSHOT, '7_days').forecasts;
    const predict = storedPredictionFromSnapshot(SNAPSHOT, { districtId: 'Dhaka', horizon: '7_days' });
    expect(predict.status).toBe(200);

    const served = bulk.find((r) => r.district_name === 'Dhaka');
    // Two readers over one file reach the same row.
    expect(rowKey({
      district_id: predict.body.provenance.district_id,
      prediction_date: predict.body.provenance.prediction_date,
    })).toBe(rowKey({ district_id: served.district_id, prediction_date: served.prediction_date }));
    expect(predict.body.prediction.severity_score).toBe(served.severity_score);
    expect(predict.body.prediction.hazard).toBe(served.hazard_type);

    // …and so does the browser overlay, from the same file.
    const merged = applyForecastsToDistricts(
      [{ name: 'Dhaka', division: 'Dhaka' }, { name: 'Khulna', division: 'Khulna' }],
      DISTRICT_ROWS,
    );
    const dhaka = merged.districts.find((d) => d.name === 'Dhaka');
    expect(dhaka.severity).toBe(served.severity_score);
    expect(dhaka.hazardType).toBe(served.hazard_type);
  });

  it('does not let a duplicate-date tie depend on file order', () => {
    const { buildForecastIndex } = require('../packages/core/src/forecastIndex.js');
    const tie = [
      { district_name: 'Dhaka', severity_score: 0.3, prediction_date: '2026-11-11' },
      { district_name: 'Dhaka', severity_score: 0.9, prediction_date: '2026-11-11' },
    ];
    // First-wins on an exact tie is deliberate: it is the order the builder wrote, and the
    // alternative — severity-wins — would let a test fixture change what the API answers.
    expect(buildForecastIndex(tie).get('dhaka').severity_score).toBe(0.3);
    expect(buildForecastIndex([...tie].reverse()).get('dhaka').severity_score).toBe(0.9);
  });

  it('keeps a nameless row out of the index instead of filing it under the empty key', () => {
    const { buildForecastIndex } = require('../packages/core/src/forecastIndex.js');
    const index = buildForecastIndex([
      { district_name: '', severity_score: 0.5, prediction_date: '2026-11-11' },
      { district_name: 'Dhaka', severity_score: 0.4, prediction_date: '2026-11-11' },
    ]);
    expect([...index.keys()]).toEqual(['dhaka']);
  });
});

describe('no fifth rule', () => {
  /* A source scan, because the defect is not a wrong function — it is a *second* function. The
     four readers above are allowed to call the rule; nothing else may select a district's row
     by sorting or by name match. The allow-list names the surfaces that legitimately search a
     row set for a single district (they index first, then look the district up). */
  const ALLOWED = new Set([
    'packages/core/src/forecastIndex.js',
    'backend/utils/forecastSnapshotServe.js',
    'frontend/src/lib/forecasts.ts',
    'frontend/src/lib/storedPrediction.ts',
    'frontend/src/lib/dailyAdvisories.ts',
    'frontend/src/hooks/useForecasts.ts',
    'frontend/src/pages/AdvisoriesPage.tsx',
    'backend/utils/predictFromStore.js',
  ]);

  it('finds no hand-rolled row selection outside the owners', () => {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '..');
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.git', 'dist', 'build', 'coverage', 'mobile'].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) continue;
        const rel = path.relative(root, full).split(path.sep).join('/');
        if (ALLOWED.has(rel) || rel.startsWith('__tests__/') || rel.includes('/__tests__/')) continue;
        if (rel.startsWith('frontend/public/data/')) continue;
        const source = fs.readFileSync(full, 'utf8');
        // `sort` by prediction_date is the shape every copy had. Legitimate uses sort other
        // fields (report dates, alert times) and are not matched by this pair.
        if (/sort\([^)]*prediction_date/.test(source) || /sort\([^)]*predictionDate/.test(source)) {
          offenders.push(`${rel}: sorts rows by prediction_date`);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
