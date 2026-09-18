# `data/hindcast/` — the Phase 9 hindcast inputs and results

| Path | Writer | Contents | Committed? |
|---|---|---|---|
| `episodes/*.json` | a human (reviewed) | One named historical event with a **sourced** truth set: the districts the cited assessments report as affected, each entry carrying the id of the source it came from | **Yes** — it is knowledge, and the harness refuses a file whose districts or sources do not check out |
| `drivers/<id>.json` | `python -m hindcast.cli run --refresh-drivers` on a GitHub runner (`.github/workflows/hindcast.yml`) | Daily reanalysis values per district centroid (temperature max/min, precipitation, wind max, ET0) over the episode's longest window, from Open-Meteo's historical archive | **Yes** — so the report can be recomputed offline; this is the input, not a cache |
| `reports/<id>.json` | the same command | The deliverable: episode provenance + hash, what was and was not hindcast, the Phase 3 evaluation of the physics track, threshold sensitivity, a per-district table, detection counts under three definitions, caveats | **Yes** — generated, and `python -m hindcast.cli check` fails if it stops matching its inputs |
| `cache/` | the fetcher | Raw HTTP responses, keyed by date range + station list | No (`cache/` is gitignored) |

**Why the driver series is committed rather than cached:** `check` rebuilds every number in
the report from the episode and the drivers, so anyone can audit a score without network
access or credentials. A cache would make the report reproducible only on the machine that
fetched it.

**What the numbers are not:** the drivers are reanalysis (the weather that occurred), and the
score is the **physics cross-check**, not the CNN. Every report states both. See
`scripts/hindcast/README.md`.

Regenerate everything with the dispatch-only workflow:

```bash
gh workflow run hindcast.yml -f episode=all
```
