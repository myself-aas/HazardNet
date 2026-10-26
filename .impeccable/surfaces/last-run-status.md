---
surface: last-run-status
routes:
  - /last-run
  - /status
mode: Read
---

# Last Run Status

## What the visitor is doing

Verify what the last run produced and whether each tracked source is fresh.

## Direction

Read track, table-first. The table is the page; each row carries its own state label as well as its hue.

## Decisions to preserve

- Prerendered: the static shell states the same facts as the hydrated page.

## Mode

`Read` — the visitor understands something; structure for comprehension, then make the reading worth staying in.
