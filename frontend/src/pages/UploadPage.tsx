import { useRef, useState } from 'react';
import { ALL_64_DISTRICTS } from '../data/bangladeshDistricts';
import { fetchStoredPrediction, type StoredPrediction } from '../lib/storedPrediction';
import StoredForecastPanel from '../components/StoredForecastPanel';

export default function UploadPage() {
  const [district, setDistrict] = useState('dhaka');
  const [horizon, setHorizon] = useState('7_days');
  const [forecast, setForecast] = useState<StoredPrediction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  const clear = () => {
    sequence.current++;
    setForecast(null);
    setError(null);
    setLoading(false);
  };
  const load = async () => {
    const id = ++sequence.current;
    setLoading(true);
    setError(null);
    setForecast(null);
    try {
      const result = await fetchStoredPrediction(district, horizon);
      if (id === sequence.current) setForecast(result);
    } catch {
      if (id === sequence.current) setError('No stored forecast could be loaded. Please try again later.');
    } finally {
      if (id === sequence.current) setLoading(false);
    }
  };
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">District forecast lookup</h1>
      <p>
        Read a previously published forecast. Raster uploads and on-demand inference are not supported; selecting a
        district does not run a model.
      </p>
      <form
        className="flex flex-wrap gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <label>
          District{' '}
          <select
            value={district}
            onChange={(event) => {
              clear();
              setDistrict(event.target.value);
            }}
          >
            {ALL_64_DISTRICTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Horizon{' '}
          <select
            value={horizon}
            onChange={(event) => {
              clear();
              setHorizon(event.target.value);
            }}
          >
            <option value="7_days">7 days</option>
            <option value="15_days">15 days</option>
          </select>
        </label>
        <button type="submit" disabled={loading} className="bg-nasa-blue text-white px-4 py-2">
          {loading ? 'Loading stored forecast…' : 'Load stored forecast'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <StoredForecastPanel forecast={forecast} />
    </main>
  );
}
