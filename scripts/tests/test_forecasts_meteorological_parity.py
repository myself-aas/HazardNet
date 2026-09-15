"""Firebase migration: protect active parser/API weather fields, not removed SQL adapters.
Actual persistence is exercised in __tests__/forecastStore.test.js.
"""
import re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
FIELDS = ['temperature_mean', 'temperature_max', 'temperature_min', 'precipitation_mm',
          'wind_max_kmh', 'dewpoint_mean', 'solar_radiation_mj_m2', 'evapotranspiration_mm']


def test_parser_and_json_ingest_preserve_all_weather_fields():
    parser = (ROOT / 'backend/utils/forecastRow.js').read_text()
    block = parser.split('const METEOROLOGICAL_FIELDS = [')[1].split(']')[0]
    assert re.findall(r"'(\w+)'", block) == FIELDS
    api = (ROOT / 'api/ingest.js').read_text()
    for field in FIELDS:
        assert f'{field}: z.number().optional()' in api


def test_sql_cutover_is_not_an_active_workflow():
    for workflow in (ROOT / '.github/workflows').glob('*.yml'):
        text = workflow.read_text()
        assert 'FORECAST_STORE: supabase' not in text
        assert 'verify-supabase-cutover.mjs' not in text
