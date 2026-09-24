# Methodology

HazardNet combines official bulletins, deterministic weather models, and on-the-ground observations into a single per-district severity score.

## Severity scale
- **WATCH (Blue)** — Conditions are favourable; monitor.
- **WARNING (Amber)** — Damaging event is plausible; prepare.
- **SEVERE (Red)** — Imminent or life-threatening; act now.
- **ALL CLEAR (Green)** — No active alerts above threshold.

## Confidence
Every alert carries a confidence score (0–1). Low-confidence alerts are marked and never escalate to SEVERE without human review.

## Data sources
- BMD cyclone and severe-weather bulletins
- FFWC Ganges/Brahmaputra/Meghna water-level forecasts
- NASA GPM / IMERG rainfall estimates (verified against ground gauges)
- Crowdsourced field reports (user-submitted photos)

## Forecast horizon
Alerts cover 0–24h (imminent), 24–72h (watch), and 3–7 day (outlook).
