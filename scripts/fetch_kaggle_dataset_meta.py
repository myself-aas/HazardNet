#!/usr/bin/env python3
"""Pull the dataset builder's metadata off Kaggle, and say what it means for the shipped model.

WHY THIS EXISTS
---------------
Notebooks 1, 3 and 4 (`ml/1-hazardnet-bgd-climatic-hazards.ipynb`,
`ml/3-hazardnet-with-severity.ipynb`, `ml/4-hazardnet-dataset-builder.ipynb`) run on a
Kaggle schedule and rebuild the training data daily. What the repository needs from
them is small and auditable — which bands, which normalization, which folds, how many
classes — and what it does *not* need is `master_tensors.h5`, which is hundreds of
megabytes a day and would grow the clone forever. Colab reads the tensors straight
from the Kaggle dataset when a monthly retrain needs them.

So this pulls the two JSON documents the builder writes beside the tensors:

    normalization_stats.json    per-band mean/std the tensors were normalized with
    dataset_config.json         classes, hazard order, tensor shape, the six split
                                strategies the builder generated

WHAT IT DELIBERATELY DOES NOT DO
--------------------------------
It never writes into `Models/`. `Models/normalization_stats.json` is part of the
*shipped model bundle*: it is the normalization the deployed `.tflite` was trained
with, it is hashed into `Models/VERSION.json`, and overwriting it from today's
dataset build would desynchronize the model from its own preprocessing without
changing a single prediction — the quietest way to corrupt an inference pipeline
there is. The dataset's stats and the model's stats are two different facts, and
this script's job is to report the distance between them, not to close it. Only a
training PR — the monthly Colab run, which produces a new model *and* its stats —
may change the shipped copy.

That report is the point of the daily run: drift here means the next retrain will
train on differently normalized tensors than the model in production was, which is
worth knowing on the day it happens rather than at the end of the month.

USAGE
-----
    python scripts/fetch_kaggle_dataset_meta.py                    # daily sync
    python scripts/fetch_kaggle_dataset_meta.py --required         # fail if Kaggle has nothing
    python scripts/fetch_kaggle_dataset_meta.py --fail-on-drift    # gate on divergence

Exit codes: 0 pulled (or nothing to pull and `--required` was not set), 1 the pull
or a document failed validation, 2 drift exceeded tolerance with `--fail-on-drift`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

#: The builder kernel that writes the two documents, and the dataset it publishes them
#: to. Both are overridable: a renamed notebook is a repository *variable*, not a code
#: change (docs/ops/kaggle-pipeline-triage.md §3).
DEFAULT_BUILDER_KERNEL = 'ashifahmedshuvo/4-hazardnet-dataset-builder'
DEFAULT_DATASET = 'ashifahmedshuvo/hazardnet-datasets'

#: What each document must carry to be worth committing. These are the keys notebook 4
#: writes; a document missing one is a schema change upstream, and guessing at a
#: renamed key is how a drift report starts comparing nothing to nothing.
REQUIRED_STATS_KEYS = ('mean', 'std')
REQUIRED_CONFIG_KEYS = ('n_classes', 'hazard_types', 'target_tensor_shape', 'strategies')

#: The bands the whole pipeline agrees on — `BAND_NAMES` in the forecast notebook, the
#: input spec in Models/README.md, and the keys of the shipped stats. A pull that does
#: not carry all of them is reported, because a partial normalization is worse than
#: none: it normalizes the bands it has and leaves the rest to whatever the reader
#: assumes.
EXPECTED_BANDS = (
    'SAR_VV', 'SAR_VH', 'Blue', 'Red', 'NIR', 'SWIR', 'Temp_2m', 'Precip',
    'Max_Temp', 'Min_Temp', 'Soil_W1', 'Soil_W3', 'Soil_T1', 'Dewpoint', 'Solar_Rad',
)

#: Relative tolerance for "the same number". These are float32 aggregates written by
#: different runs of the same code, so exact equality is the wrong test and a
#: reordering of summation is not drift worth waking anyone for.
DRIFT_TOLERANCE = 1e-6


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        while chunk := handle.read(65536):
            digest.update(chunk)
    return digest.hexdigest()


def github_output(key: str, value: Any) -> None:
    """Set a step output when running inside Actions, and always print the pair."""
    print(f'{key}={value}')
    sink = os.environ.get('GITHUB_OUTPUT')
    if sink:
        with open(sink, 'a', encoding='utf-8') as handle:
            handle.write(f'{key}={value}\n')


def run_kaggle(argv: list[str], attempts: int, retry_delay: int) -> tuple[bool, str]:
    """Run a Kaggle CLI command, retrying, and return (ok, last output).

    The CLI's own stderr is kept and returned verbatim: it is the only evidence of
    *which* failure this is — 401 (token rejected), 403 (token is not the kernel's
    owner), 404 (slug moved) and "Kernel has never been run" all need different owner
    actions, and the decision table for them is docs/ops/kaggle-pipeline-triage.md.
    """
    last = ''
    for attempt in range(1, attempts + 1):
        try:
            proc = subprocess.run(['kaggle', *argv], capture_output=True, text=True, timeout=600)
        except FileNotFoundError:
            return False, 'the `kaggle` CLI is not installed (pip install -r scripts/requirements-pipeline.txt)'
        except subprocess.TimeoutExpired:
            last = f'attempt {attempt}: timed out after 600 s'
        else:
            last = (proc.stderr or proc.stdout or '').strip()
            if proc.returncode == 0:
                return True, last
            last = f'attempt {attempt}: exit {proc.returncode}: {last}'
        print(f'  kaggle {" ".join(argv)} → {last}', file=sys.stderr)
        if attempt < attempts:
            time.sleep(retry_delay)
    return False, last


def collect_json_files(directory: Path) -> dict[str, Path]:
    """Every JSON document under `directory`, unzipping whatever Kaggle zipped.

    `kaggle datasets download -f <name>` hands back `<name>.zip` for a single file and
    a whole-archive zip otherwise, while `kaggle kernels output` writes loose files.
    Both shapes have to work or the daily job fails on a packaging detail.
    """
    for archive in sorted(directory.rglob('*.zip')):
        try:
            with zipfile.ZipFile(archive) as bundle:
                bundle.extractall(archive.parent)
        except zipfile.BadZipFile:
            print(f'  ::warning::{archive.name} is not a zip archive; left as downloaded', file=sys.stderr)
            continue
        archive.unlink()
    found: dict[str, Path] = {}
    for path in sorted(directory.rglob('*.json')):
        found.setdefault(path.name, path)
    return found


def pull(
    *,
    builder_kernel: str,
    dataset: str,
    attempts: int,
    retry_delay: int,
    workdir: Path,
) -> tuple[str, dict[str, Path], str]:
    """Try the builder kernel's output, then the dataset. Returns (source, files, error)."""
    pattern = r'(normalization_stats|dataset_config)\.json'

    kernel_dir = workdir / 'kernel'
    kernel_dir.mkdir(parents=True, exist_ok=True)
    ok, out = run_kaggle(
        ['kernels', 'output', builder_kernel, '--file-pattern', pattern, '-p', str(kernel_dir)],
        attempts, retry_delay,
    )
    files = collect_json_files(kernel_dir) if ok else {}
    if ok and files:
        return f'kaggle kernels output {builder_kernel}', files, ''
    kernel_error = out

    dataset_dir = workdir / 'dataset'
    dataset_dir.mkdir(parents=True, exist_ok=True)
    pulled: dict[str, Path] = {}
    dataset_errors: list[str] = []
    for name in ('normalization_stats.json', 'dataset_config.json'):
        ok, out = run_kaggle(
            ['datasets', 'download', '-d', dataset, '-f', name, '-p', str(dataset_dir), '--force'],
            attempts, retry_delay,
        )
        if not ok:
            dataset_errors.append(f'{name}: {out}')
            continue
        pulled.update(collect_json_files(dataset_dir))
    if pulled:
        return f'kaggle datasets download -d {dataset}', pulled, '; '.join(dataset_errors)
    return 'none', {}, f'kernel output: {kernel_error} | dataset: {"; ".join(dataset_errors) or "no files"}'


def validate(name: str, doc: Any) -> list[str]:
    """The reasons a pulled document may not be committed. An empty list is the only pass."""
    problems: list[str] = []
    if not isinstance(doc, dict):
        return [f'{name} is a {type(doc).__name__}, not an object']

    if name == 'normalization_stats.json':
        missing_bands = [band for band in EXPECTED_BANDS if band not in doc]
        if missing_bands:
            problems.append(f'{name} has no entry for {", ".join(missing_bands)}')
        extra = sorted(set(doc) - set(EXPECTED_BANDS))
        if extra:
            problems.append(f'{name} carries bands the pipeline does not read: {", ".join(extra)}')
        for band, stats in doc.items():
            if not isinstance(stats, dict):
                problems.append(f'{name}.{band} is not an object')
                continue
            for key in REQUIRED_STATS_KEYS:
                value = stats.get(key)
                if not isinstance(value, (int, float)) or isinstance(value, bool):
                    problems.append(f'{name}.{band}.{key} is {value!r}, not a number')
            std = stats.get('std')
            if isinstance(std, (int, float)) and std <= 0:
                problems.append(f'{name}.{band}.std is {std} — normalizing by it would not be finite')

    if name == 'dataset_config.json':
        for key in REQUIRED_CONFIG_KEYS:
            if key not in doc:
                problems.append(f'{name} has no {key!r} (notebook 4 writes it — the builder changed shape)')
        classes, hazards = doc.get('n_classes'), doc.get('hazard_types')
        if isinstance(classes, int) and isinstance(hazards, list) and classes != len(hazards):
            problems.append(f'{name} says n_classes={classes} but lists {len(hazards)} hazard_types')
        strategies = doc.get('strategies')
        if isinstance(strategies, list) and not strategies:
            problems.append(f'{name} lists no split strategies')
    return problems


def compare_stats(pulled: dict[str, Any], shipped_path: Path) -> dict[str, Any]:
    """How far today's dataset normalization is from the one the shipped model uses."""
    report: dict[str, Any] = {'shipped_path': str(shipped_path)}
    if not shipped_path.is_file():
        report['state'] = 'shipped-missing'
        report['detail'] = f'{shipped_path} does not exist — nothing to compare against'
        return report
    try:
        shipped = json.loads(shipped_path.read_text(encoding='utf-8'))
    except ValueError as exc:
        report['state'] = 'shipped-unreadable'
        report['detail'] = f'{shipped_path} is not valid JSON: {exc}'
        return report

    moved: list[dict[str, Any]] = []
    for band in sorted(set(pulled) | set(shipped)):
        new, old = pulled.get(band), shipped.get(band)
        if not isinstance(new, dict) or not isinstance(old, dict):
            moved.append({'band': band, 'field': '—', 'state': 'present in one file only'})
            continue
        for field in REQUIRED_STATS_KEYS:
            a, b = new.get(field), old.get(field)
            if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
                continue
            scale = max(abs(a), abs(b), 1e-12)
            relative = abs(a - b) / scale
            if relative > DRIFT_TOLERANCE:
                moved.append({
                    'band': band, 'field': field, 'dataset': a, 'model': b,
                    'relative_delta': round(relative, 9),
                })
    report['state'] = 'drift' if moved else 'identical'
    report['bands_compared'] = len(set(pulled) & set(shipped))
    report['moved'] = moved
    report['max_relative_delta'] = max((m['relative_delta'] for m in moved if 'relative_delta' in m), default=0.0)
    return report


def markdown_summary(
    *,
    source: str,
    files: dict[str, Path],
    drift: dict[str, Any],
    config: dict[str, Any] | None,
    problems: list[str],
) -> str:
    lines = ['#### Kaggle dataset metadata', '', f'* source: `{source}`', f'* pulled: {utcnow_iso()}']
    for name in sorted(files):
        lines.append(f'* `{name}` — {files[name].stat().st_size} bytes, sha256 `{sha256_file(files[name])[:16]}…`')
    if config:
        lines.append(
            f"* dataset: {config.get('n_classes')} classes, "
            f"{len(config.get('strategies') or [])} split strategies, "
            f"tensor shape `{config.get('target_tensor_shape')}`"
        )
    state = drift.get('state')
    if state == 'identical':
        lines.append(f"* normalization: **identical** to `{drift['shipped_path']}` "
                     f"({drift.get('bands_compared', 0)} bands compared)")
    elif state == 'drift':
        lines.append(
            f"* normalization: **{len(drift['moved'])} value(s) differ** from `{drift['shipped_path']}` "
            f"(max relative delta {drift['max_relative_delta']:.3g}). The shipped copy is left alone: "
            'it belongs to the model that was trained with it, and only a training PR changes it.'
        )
        for move in drift['moved'][:10]:
            if 'relative_delta' in move:
                lines.append(
                    f"  * `{move['band']}.{move['field']}` dataset `{move['dataset']}` vs model `{move['model']}`"
                )
        if len(drift['moved']) > 10:
            lines.append(f'  * … and {len(drift["moved"]) - 10} more')
    else:
        lines.append(f"* normalization: **not compared** ({drift.get('detail', state)})")
    for problem in problems:
        lines.append(f'* ::error:: {problem}')
    return '\n'.join(lines) + '\n'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--builder-kernel', default=os.environ.get('KAGGLE_BUILDER_KERNEL', DEFAULT_BUILDER_KERNEL))
    parser.add_argument('--dataset', default=os.environ.get('KAGGLE_DATASET', DEFAULT_DATASET))
    parser.add_argument('--dest', default='data/kaggle/dataset-meta',
                        help='committed home for the pulled documents and their provenance')
    parser.add_argument('--models-dir', default='Models',
                        help='the shipped bundle whose normalization the drift report compares against')
    parser.add_argument('--scratch', default='data/kaggle_notebook_output/dataset-meta',
                        help='gitignored download directory')
    parser.add_argument('--attempts', type=int, default=3)
    parser.add_argument('--retry-delay', type=int, default=30)
    parser.add_argument('--required', action='store_true',
                        help='fail when Kaggle has nothing to give (a dispatch run wants this; the daily sync does not)')
    parser.add_argument('--fail-on-drift', action='store_true',
                        help='exit 2 when the dataset normalization no longer matches the shipped model')
    parser.add_argument('--summary-out', default=None, help='write the job-summary markdown here')
    args = parser.parse_args()

    dest = Path(args.dest)
    dest.mkdir(parents=True, exist_ok=True)
    scratch = Path(args.scratch)
    if scratch.exists():
        shutil.rmtree(scratch)
    scratch.mkdir(parents=True, exist_ok=True)

    source, files, error = pull(
        builder_kernel=args.builder_kernel,
        dataset=args.dataset,
        attempts=args.attempts,
        retry_delay=args.retry_delay,
        workdir=scratch,
    )

    if not files:
        message = f'no dataset metadata on Kaggle ({error})'
        if args.required:
            print(f'::error::{message}. Triage: docs/ops/kaggle-pipeline-triage.md — a 401 is the token, '
                  'a 404 is the slug, and "never been run" needs one run from the Kaggle UI.')
            github_output('source', 'none')
            return 1
        # The forecast CSV is the daily payload; the metadata is the audit trail beside
        # it. A builder kernel that has not run this week must not stop today's forecast
        # from publishing — but it must not be silent either.
        print(f'::warning::{message} — continuing without it. The committed copy in {dest} is left as it was.')
        github_output('source', 'none')
        github_output('changed', 'false')
        return 0

    documents: dict[str, Any] = {}
    problems: list[str] = []
    for name, path in sorted(files.items()):
        try:
            documents[name] = json.loads(path.read_text(encoding='utf-8'))
        except ValueError as exc:
            problems.append(f'{name} is not valid JSON: {exc}')
            continue
        problems.extend(validate(name, documents[name]))

    if problems:
        for problem in problems:
            print(f'::error::{problem}')
        github_output('source', source)
        return 1

    stats = documents.get('normalization_stats.json') or {}
    config = documents.get('dataset_config.json')
    drift = compare_stats(stats, Path(args.models_dir) / 'normalization_stats.json') if stats else {
        'state': 'not-pulled', 'detail': 'normalization_stats.json was not in the pull', 'shipped_path': '—',
    }

    changed = False
    for name, doc in sorted(documents.items()):
        target = dest / name
        rendered = json.dumps(doc, indent=2, ensure_ascii=False) + '\n'
        previous = target.read_text(encoding='utf-8') if target.is_file() else None
        if previous == rendered:
            print(f'  unchanged: {target}')
            continue
        target.write_text(rendered, encoding='utf-8')
        changed = True
        print(f'  wrote {target} ({len(rendered)} bytes)')

    provenance = {
        'schema': 'hazardnet-kaggle-dataset-meta/v1',
        'source': source,
        'builder_kernel': args.builder_kernel,
        'dataset': args.dataset,
        'fetched_at': utcnow_iso(),
        'files': {
            name: {'bytes': (dest / name).stat().st_size, 'sha256': sha256_file(dest / name)}
            for name in sorted(documents)
        },
        'normalization_vs_shipped_model': drift,
    }
    provenance_path = dest / 'PROVENANCE.json'
    rendered = json.dumps(provenance, indent=2, ensure_ascii=False) + '\n'
    previous_provenance = provenance_path.read_text(encoding='utf-8') if provenance_path.is_file() else None
    if previous_provenance != rendered:
        provenance_path.write_text(rendered, encoding='utf-8')
        # `fetched_at` moves on every pull, so provenance alone is not "the data
        # changed" — only the documents themselves decide that. The record is still
        # rewritten, because "when did we last look" is a fact worth keeping.
        changed = changed or previous_provenance is None

    if args.summary_out:
        Path(args.summary_out).write_text(
            markdown_summary(source=source, files={name: dest / name for name in documents},
                             drift=drift, config=config, problems=problems),
            encoding='utf-8',
        )

    print(f'source: {source}')
    print(f'normalization vs shipped model: {drift["state"]}'
          + ('' if drift['state'] != 'drift' else f' ({len(drift["moved"])} value(s), '
             f'max relative delta {drift["max_relative_delta"]:.3g})'))
    github_output('source', source)
    github_output('changed', 'true' if changed else 'false')
    github_output('drift', drift['state'])
    github_output('drift_values', len(drift.get('moved') or []))

    if drift['state'] == 'drift' and args.fail_on_drift:
        print('::error::the dataset normalization no longer matches the shipped model and --fail-on-drift is set. '
              'The next retrain will train on different statistics than production infers with; the fix is a '
              'training PR (a new model *and* its stats), not an edit to Models/.')
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
