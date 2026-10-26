---
target: Forecast lookup (/upload)
total_score: 32
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:frontend/src/pages/UploadPage.tsx"
target_fingerprint: "sha256:d8c63a21a59f0d61926f8ad05cd8eaff8283905783cfc53fd1a1cb31f524a821"
target_path: frontend/src/pages/UploadPage.tsx
timestamp: 2026-10-26T03-56-29Z
slug: frontend-src-pages-uploadpage-tsx
---
# Critique — forecast lookup (`/upload`)

**Target:** `frontend/src/pages/UploadPage.tsx`
**Surface brief:** `.impeccable/surfaces/upload.md` · mode chosen by the brief
**Method:** A from source; B from the bundled detector (0 findings on every file in scope), the craft-floor gate (0 violations / 259 files) and the contrast gate (162 components clean in both themes). No render inspection, no sub-agent isolation.

> ⚠️ DEGRADED: single-context (no sub-agent tool exposed; no browser automation available)

## Heuristic score — 32 / 40

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 4 |
| 2 | Match between system and real world | 3 |
| 3 | User control and freedom | 4 |
| 4 | Consistency and standards | 2 |
| 5 | Error prevention | 4 |
| 6 | Recognition rather than recall | 3 |
| 7 | Flexibility and efficiency | 4 |
| 8 | Aesthetic and minimalist design | 3 |
| 9 | Error recovery | 4 |
| 10 | Help and documentation | 3 |

## Design specificity — pass, with a naming defect



## Priority issues

**P1 · The action is called Lookup and drawn as an upload** — The route is `/upload`, the tab bar's item id is `lookup` with the Material icon `cloud_upload`, and the page itself says in its own standfirst that "raster uploads and on-demand inference are not supported". A cloud-upload glyph on a form that reads a stored forecast promises the one thing the page exists to deny. The route is legacy and can stay; the icon cannot.

**P2 · Two control shapes in one form** — Both selects are `rounded-control` (a 8–10px control radius); the submit button is a bare `bg-primary` with no radius at all. Side by side in one row they read as two component libraries.

**P2 · The disabled submit has no visible reason** — The button is disabled while `state.kind === 'loading'`, which is honest, but the form also clears `submitted` on every select change — so choosing a district silently empties the panel below with no statement that a new lookup is required.

## Positive findings

- The district and horizon selection is written to the URL, so a lookup is linkable and shareable.
- `aria-live="polite"` wraps the panel, so the result is announced.
- The standfirst states what the page does *not* do, in the product's own words.
- 44px targets on the selects and the submit.

## Not tested

The form on a 360px screen with a 64-option select, and the lookup's offline path.
