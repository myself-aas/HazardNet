import { VALID_HORIZONS } from './forecastRow.js';
import { predictFromStore } from './predictFromStore.js';
import { getForecastStore } from '../forecastStore.js';
import { clientError } from './clientError.js';

// Same GAUL/current-name aliases used by the forecast overlay.
const aliases = {
  jessore: 'jashore',
  chittagong: 'chattogram',
  comilla: 'cumilla',
  barishal: 'barisal',
  khagrachari: 'khagrachhari',
  bogura: 'bogra',
  jaipurhat: 'joypurhat',
  netrakona: 'netrokona',
  maulvibazar: 'moulvibazar',
  brahamanbaria: 'brahmanbaria',
  jhalakathi: 'jhalokati',
  nawabganj: 'chapainawabganj',
};
const key = (value) => {
  const normalized = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return aliases[normalized] || normalized;
};

export async function serveStoredPrediction(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(422).json({ error: 'District payload required' });
  }
  if ('tensor' in body || 'rasterName' in body) {
    return res
      .status(400)
      .json({ error: 'On-demand tensor/raster inference is retired. Supply a district and horizon.' });
  }
  const district = body.district_id ?? body.districtId;
  if (
    !['string', 'number'].includes(typeof district) ||
    !String(district).trim() ||
    String(district).length > 100 ||
    !/^[a-zA-Z0-9 _-]+$/.test(String(district))
  ) {
    return res.status(422).json({ error: 'A valid district_id or districtId is required' });
  }
  const horizon = body.horizon ?? '7_days';
  if (!VALID_HORIZONS.includes(horizon)) {
    return res.status(400).json({ error: 'Invalid horizon. Use: 7_days, 15_days' });
  }
  try {
    const start = Date.now();
    const rows = await getForecastStore().getLatestForecastsByHorizon(horizon);
    const numeric = /^\d+$/.test(String(district));
    const row = rows
      .filter(
        (r) =>
          r.horizon === horizon &&
          (numeric ? String(r.district_id) === String(district) : key(r.district_name) === key(district)),
      )
      .sort((a, b) => String(b.prediction_date).localeCompare(String(a.prediction_date)))[0];
    if (!row) return res.status(404).json({ error: 'No stored forecast for this district and horizon' });
    return res.status(200).json(predictFromStore(row, { storeLatencyMs: Date.now() - start }));
  } catch (err) {
    return clientError(res, err, { scope: 'predict:stored', fallback: 'Stored forecast unavailable' });
  }
}
