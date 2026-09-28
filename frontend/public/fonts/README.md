# Edge font budget

This directory is intentionally empty until the font release job produces valid,
subsetted WOFF2 assets. The release gate must contain only the requested Unicode
ranges (Latin basic/extended, Bengali U+0980-09FF, punctuation/operators) and
must fail when the aggregate payload is greater than 50 KiB.

The application therefore uses the metric-matched system stacks in `src/index.css`
until that gate passes. This is the safe deployment state: no broken font files,
no FOIT, and no third-party font/CDN request.
