# Working in this repository

HazardNet is a public hazard-outlook service. The interface is a safety surface: a visitor
may act on what it says. That makes most of the rules below non-negotiable rather than
stylistic.

**Design work follows [`docs/agents/impeccable-protocol.md`](docs/agents/impeccable-protocol.md).**
It is the twelve-phase, file-by-file protocol (review → audit → spec → plan → fix →
improve → update → polish → reaudit → deploy → production → maintain) derived from the
Impeccable skill. Read the phase you are in before you edit; do not invent a thirteenth.

## Context, in the order it is read

| File | What it is | Authority |
|---|---|---|
| `PRODUCT.md` | Who this is for, what it may claim, what is explicitly undecided | The product truth. Never overwrite it to make a design decision easier. |
| `DESIGN.md` | The visual system: tokens, type, layout, elevation, shapes, components, prohibitions | Machine-read frontmatter (`colors`) is binding; the body is the prose contract. |
| `.impeccable/design.json` | Sidecar: colour metadata, typographic roles, elevation, motion, component previews | Extensions only. Do not restate `DESIGN.md` in it. |
| `.impeccable/surfaces/<surface>.md` | One brief per surface: routes, mode, what the visitor is doing, decisions to preserve | Scopes every change. A route with no brief is a gap, not a licence. |
| `docs/audits/` | Dated technical audits, with the health score | The record of what was measured and when. |

`apps/mobile` and `apps/windows` carry their own `PRODUCT.md`; they inherit `DESIGN.md`
from the root. Their release pipelines are parked in `.github/workflow-templates/`.

## Gates

Run these before you claim a change is done. They are the same commands CI runs.

```bash
npm run check:device          # tokens, prose, icons, contrast, residue, svg paint, craft floor
npm run check:design:source   # detector rules over frontend/src (works without a build)
npm run check:design          # detector rules over the build + source, against the baseline
npm run audit:pages           # document audit: landmarks, headings, alt text, safety framing
```

After `npm run build:frontend`: `npm run check:design`, `npm run audit:pages`,
`npm run protocol:check`. Full suite: `npx tsc -p frontend/tsconfig.json --noEmit && npx jest`.

## Hard rules

- **Read the craft floor before any UI edit** — `docs/agents/impeccable-protocol.md` §3
  restates it, and `scripts/check-craft-floor.mjs` enforces the nine mechanical rules.
  No eyebrow above a heading, no gradient text, no >1px coloured side borders, no
  zero-offset halos, no decorative blur or glass, no emoji as an icon, 44×44 targets,
  themed browser surfaces.
- **The brief wins.** A pinned aesthetic, palette or font is not a preference to be
  improved on. If the brief and the floor genuinely conflict, say so and stop.
- **Refinement preserves; redesign replaces.** Do not quietly repaint an incumbent
  world, and do not polish a world you have decided to discard.
- **Audit does not fix.** `audit` measures and records; the fix phases change code.
  Never edit while producing an audit.
- **Doctor does not redesign.** `npx impeccable doctor` repairs schema drift only. Truth
  drift goes to `init` (PRODUCT.md) or `document` (DESIGN.md) as a conversation.
- **Never silence a gate.** `--update` / `--write-baseline` are for a reviewed change,
  and the diff of the baseline belongs in the same commit. A waiver names the check that
  covers the same risk.
- **Copy is product truth.** Do not invent a number, a date, a place or a capability to
  fill a layout. A missing value renders as an em dash or as the sentence that says it is
  missing. Official warnings come from BMD and FFWC; emergencies go to 999.
- **The no-JS document is a surface.** Every prerendered page closes with the safety
  framing, carries one `h1`, one `<main>`, and the shell's own styles.
- **No new palette hexes** outside the Apple/HDS set — `__tests__/staticShellContrast.test.js`
  rejects them, and `data/design/hex-baseline.json` counts what is left.
- **CI is not a scratchpad.** No `secrets.` context in any `if:`; never write a literal
  Actions expression opener in YAML, a comment, or a markdown file the secret audit scans.

## When the tooling will not run

Say so in one line, before the next tool call: *"Context loading did not run; I'll read the
existing project context directly."* Then read `PRODUCT.md`, `DESIGN.md` and the surface
brief without inventing what is missing, and carry on. A failed launcher blocks nothing.
