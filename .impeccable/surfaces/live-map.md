---
surface: live-map
routes:
  - /live
  - /home
  - /home/overview
  - /forecast/overview
mode: Operate
---

# Live Map

## What the visitor is doing

Answer "is my district at risk right now" in one glance, then let me inspect a district.

## Direction

Console track. Full-bleed map, one floating control stack, one bottom sheet. The map is the surface; chrome floats and never frames.

## Decisions to preserve

- Severity is colour + glyph + word on every marker and in the legend.
- Layer controls are segmented, one line each, 44px targets.
- Export/snapshot renders the same legend into the image.

## Mode

`Operate` — the visitor completes a task; precision and consistency outrank expression.
