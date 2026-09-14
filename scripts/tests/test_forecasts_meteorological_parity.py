"""Meteorological column parity guards.

The eight Open-Meteo columns the weekly notebook emits are declared in four
places, and drift between them silently destroys weather data — which is
exactly what shipped before 007: the columns did not exist, so the Supabase
store's 15-column INSERT dropped every value with no error at all.

  * scripts/db/007_forecasts_meteorological.sql     — the schema
  * scripts/db/verify_forecasts_meteorological.sql  — the operator's check
  * backend/forecastStore.js                        — the write path
  * backend/utils/forecastRow.js                    — the ingest parser

These tests pin the four together so a rename or a type change in one file
cannot pass unnoticed.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / 'scripts' / 'db' / '007_forecasts_meteorological.sql'
VERIFY_SQL = ROOT / 'scripts' / 'db' / 'verify_forecasts_meteorological.sql'
STORE_JS = ROOT / 'backend' / 'forecastStore.js'
PARSER_JS = ROOT / 'backend' / 'utils' / 'forecastRow.js'
JEST_STORE_TEST = ROOT / '__tests__' / 'forecastStore.test.js'

# The contract: names as stored, in the order the write path binds them.
EXPECTED_COLUMNS = [
    'temperature_mean',
    'temperature_max',
    'temperature_min',
    'precipitation_mm',
    'wind_max_kmh',
    'dewpoint_mean',
    'solar_radiation_mj_m2',
    'evapotranspiration_mm',
]

ADD_COLUMN_RE = re.compile(
    r'add\s+column\s+if\s+not\s+exists\s+(\w+)\s+([a-z ]+?)\s*[,;]',
    re.IGNORECASE,
)


def _migration_columns() -> dict[str, str]:
    """{column_name: declared type} from the 007 migration."""
    return {
        name: ' '.join(dtype.split())
        for name, dtype in ADD_COLUMN_RE.findall(MIGRATION.read_text(encoding='utf-8'))
    }


@pytest.mark.parametrize('path', [MIGRATION, VERIFY_SQL, STORE_JS, PARSER_JS])
def test_expected_files_exist(path: Path):
    assert path.exists(), f'{path} is missing'


def test_migration_declares_exactly_the_eight_columns():
    assert list(_migration_columns()) == EXPECTED_COLUMNS


def test_migration_columns_are_nullable_numeric():
    # Nullable: pre-007 rows and CSVs without weather data must still ingest.
    # numeric: matches the neighbouring severity_score / confidence columns.
    text = MIGRATION.read_text(encoding='utf-8')
    assert 'not null' not in text.lower()
    for column, dtype in _migration_columns().items():
        assert dtype == 'numeric', f'{column} is {dtype}, expected numeric'


def test_migration_is_idempotent():
    columns = _migration_columns()
    assert len(columns) == len(EXPECTED_COLUMNS)
    # Every statement must be re-runnable.
    adds = re.findall(r'add\s+column\s+(?:if\s+not\s+exists)?', MIGRATION.read_text(encoding='utf-8'), re.IGNORECASE)
    assert adds, 'no add column statements found'
    assert len(adds) == len(re.findall(r'add\s+column\s+if\s+not\s+exists', MIGRATION.read_text(encoding='utf-8'), re.IGNORECASE))


def test_verifier_expects_the_same_columns_and_types():
    """The operator's verifier must not disagree with the migration."""
    text = VERIFY_SQL.read_text(encoding='utf-8')
    pairs = re.findall(r"\(\d+,\s*'(\w+)',\s*'([a-z ]+)'\)", text)
    assert pairs, 'could not parse the verifier expected() list'
    assert [name for name, _ in pairs] == EXPECTED_COLUMNS
    assert {dtype.strip() for _, dtype in pairs} == {'numeric'}


def test_verifier_does_not_select_missing_columns_directly():
    """A pre-007 database must FAIL, not error out.

    The data half of the verifier runs before the migration on a vulnerable
    database, so it must reach rows through to_jsonb() — a bare
    `select temperature_mean` would abort the whole script with
    `column "temperature_mean" does not exist` instead of reporting FAIL.
    """
    text = VERIFY_SQL.read_text(encoding='utf-8')
    data_half = text.split('PART 2', 1)[-1]
    assert 'to_jsonb(' in data_half
    assert not re.search(r'\bcount\(\s*temperature_mean', data_half)
    assert not re.search(r'\bmin\(\s*temperature_mean', data_half)


def test_store_binds_all_eight_columns_in_insert_and_upsert():
    text = STORE_JS.read_text(encoding='utf-8')
    for column in EXPECTED_COLUMNS:
        assert column in text, f'{column} is not written by the store'
        # The upsert must refresh weather values, not just the first insert.
        assert re.search(rf'{column}\s*=\s*excluded\.{column}', text), (
            f'ON CONFLICT does not refresh {column}'
        )


def test_store_column_count_matches_its_own_column_list():
    """SUPABASE_COLUMNS drives the placeholder count; keep it honest."""
    text = STORE_JS.read_text(encoding='utf-8')
    declared = int(re.search(r'const SUPABASE_COLUMNS = (\d+)', text).group(1))
    insert = text.split('insert into public.forecasts', 1)[1]
    insert = insert[: insert.index('values')]
    columns = [c.strip() for c in re.search(r'\(([^)]*)\)', insert).group(1).split(',')]
    assert declared == len(columns), (
        f'SUPABASE_COLUMNS is {declared} but the INSERT names {len(columns)} columns'
    )


def test_store_meteorological_list_matches_the_migration():
    text = STORE_JS.read_text(encoding='utf-8')
    block = text.split('const METEOROLOGICAL_COLUMNS = [', 1)[1].split(']', 1)[0]
    names = re.findall(r"'(\w+)'", block)
    assert names == EXPECTED_COLUMNS


def test_parser_accepts_the_same_eight_fields():
    text = PARSER_JS.read_text(encoding='utf-8')
    block = text.split('const METEOROLOGICAL_FIELDS = [', 1)[1].split(']', 1)[0]
    names = re.findall(r"'(\w+)'", block)
    assert sorted(names) == sorted(EXPECTED_COLUMNS)


def test_store_test_pins_the_column_count():
    """__tests__/forecastStore.test.js is the regression guard for the drop."""
    text = JEST_STORE_TEST.read_text(encoding='utf-8')
    assert re.search(r'toHaveLength\(23\)', text), (
        'the store test must pin the 15 core + 8 meteorological column count'
    )
    for column in EXPECTED_COLUMNS:
        assert column in text, f'{column} is not asserted in the store test'
