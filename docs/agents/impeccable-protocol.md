# The Impeccable operation protocol

**For:** any agent — human-directed or autonomous — that edits this repository's interface.
**Derived from:** the Impeccable skill, `SKILL.md` v4.7.1 (`pbakaus/impeccable`, path
`.agents/skills/impeccable/SKILL.md`) and its `reference/` playbooks. The CLI in this repo is
`impeccable@4.7.0`; where 4.7.1 adds prose the CLI does not carry, this document says so.
**Scope:** every surface of `frontend/`, the shared primitives in
`packages/design-system/`, and — where their briefs say so — the parked native apps.

This is a procedure, not a manifesto. It exists because the skill's own instructions are
scattered across twenty-two reference files and three setup steps, and because a design
task on this codebase touches four kinds of file (route, primitive, content, context) that
need different amounts of each command. The protocol binds the skill's vocabulary to a
sequence you can execute per file and verify with commands that already run in CI.

---

## 1. The source skill, analysed

### 1.1 Setup — three steps, once per session

1. Run the launcher's `context` verb once, from the project (not the skill directory):
   `npx impeccable context --target <path>`.
   In this monorepo the bare form answers `TARGET_SELECTION_REQUIRED` and lists four UI
   workspaces, because seven workspaces inherit one root `PRODUCT.md`. Selecting
   `frontend` (or passing `--target frontend/src/App.tsx`) loads `PRODUCT.md`, `DESIGN.md`,
   the matching `.impeccable/surfaces/*.md` brief and the platform guidance. **Follow what it
   prints; do not rerun it.**
2. Load the playbook for the request — the command's reference, or `new-work.md` for a new
   surface or a replacement visual world. Inspect the target *and* the incumbent visual
   truth before editing. When the app cannot run, start from committed goldens or
   screenshot fixtures and verify them against current tokens.
3. Read the craft floor **immediately before any UI edit** — including small refinements —
   and not at all for planning-only work. §3 below is the local copy; the authoritative
   text is `reference/craft-floor.md`.

If the launcher refuses or fails: say *"Context loading did not run; I'll read the existing
project context directly"* **before the next tool call**, then read `PRODUCT.md`,
`DESIGN.md` and the brief without inventing anything, read the craft floor, and continue.
A failed launcher blocks nothing. A silent failure is the only failure mode.

### 1.2 How the skill decides

- **The brief wins.** A pinned era, material, font or palette is honoured even where it
  trips a saturated-pattern warning. Redirecting a stated brief toward the model's taste is
  the failure, not the correction.
- **Refinement preserves; redesign replaces.** Refinement keeps identity, behaviour, copy
  and everything out of scope, and asks before replacing factual copy. Redesign keeps
  product truth and function, treats the old look as anti-reference, and replaces
  `DESIGN.md`. The one thing neither may do is split the difference — polish on a world
  that has been discarded.
- **Visual authority is evidence, not a filename.** A missing `DESIGN.md` does not make a
  project greenfield; the code is the incumbent. This repo has both, so "no spec, I'll
  design fresh" is never available here.
- **Loaded symbols stay out of the decoration.** Hazard and disaster imagery is exactly the
  kind of subject that tempts emblematic borrowing. Do not.

### 1.3 Modes — chosen per surface, persisted only in the brief

| Mode | The visitor's success | This repo |
|---|---|---|
| **Persuade** | decides and acts | `/` (front door), `/about`, `/contact`, `/terms`, `/privacy`, `/use-cases`, `/download`, `/documentation` |
| **Operate** | completes a task | `/live` and the forecast console, alerts/advisories, upload, auth, account, 404 |
| **Read** | understands something | hazards, districts/divisions, archive, docs/methodology, last-run/status, blog |
| **Experience** | is inside the work | not used |

The mode comes from the **surface**, not the product: the hazard *detail* page is Read while
the hazard *console* is Operate. Ambition scales inversely with frequency: Persuade gets the
committed gesture; Operate and Read earn their keep through precision, and patterns the
visitor already knows keep their place.

### 1.4 The command set, bound to this repository

| # | Command | Category | What it means here | State |
|---|---|---|---|---|
| 1 | `craft` | Build | Deprecated alias for new work; adds nothing | not used |
| 2 | `shape` | Build | Discovery interview → direction → written brief before code | used for new surfaces |
| 3 | `init` | Build | Writes `PRODUCT.md` from product truth | done; `PRODUCT.md` is the authority |
| 4 | `document` | Build | Writes `DESIGN.md` + `.impeccable/design.json` from the code | done (8 body sections) |
| 5 | `extract` | Build | Pulls reusable tokens/components into the design system | `packages/design-system/src/apple.ts` |
| 6 | `critique` | Evaluate | Design review (A) + detector evidence (B), persisted, trending | **not yet run** — see §2.1 |
| 7 | `audit` | Evaluate | 5-dimension technical scoring, report only, no fixes | `docs/audits/2026-10-26-*` |
| 8 | `polish` | Refine | Reads the latest critique as backlog, closes it before shipping | per release |
| 9 | `bolder` | Refine | Amplify a Persuade surface that reads safe | front door, when it does |
| 10 | `quieter` | Refine | Tone down an overstimulated surface | dashboards |
| 11 | `distill` | Refine | Remove complexity; document what was removed | long forms, settings |
| 12 | `harden` | Refine | Overflow, i18n, errors, boundaries, validation, resilience | every Operate surface |
| 13 | `onboard` | Refine | First run, empty states, activation | upload, account, empty filters |
| 14 | `animate` | Enhance | One authored motion moment per surface | `frontend/src/components/apple/motion` |
| 15 | `colorize` | Enhance | Strategic colour on a monochrome surface | hazard severity semantics |
| 16 | `typeset` | Enhance | Hierarchy, measure, scale | `.prose-blog`, article surfaces |
| 17 | `layout` | Enhance | Spacing, rhythm, alignment | section-level work |
| 18 | `delight` | Enhance | One memorable touch, earned | front door only |
| 19 | `overdrive` | Enhance | Push past convention, propose before building | rarely; needs consent |
| 20 | `clarify` | Fix | Labels, actions, errors, empty copy | all chrome copy in `lib/i18n.ts` |
| 21 | `adapt` | Fix | Breakpoints, touch, print, email | 360px → desktop; print sheet |
| 22 | `optimize` | Fix | Core Web Vitals, render cost | Leaflet, charts, prerender |
| 23 | `live` | Iterate | Browser variant picker | web only; needs a dev server |
| 24 | `generate` | Iterate | One-shot variants of a named element | web only |
| — | `context` | Setup | Loads product + design + brief | once per session |
| — | `signals` | Setup | JSON of repo state for routing | when choosing what to do |
| — | `doctor` | Maintain | Schema drift between artifacts and CLI | weekly, and before an update |
| — | `hooks` | Maintain | The per-edit detector hook | on; wired in `.codex/` and `.github/hooks/` |

Routing, per the skill: a bare invocation shows a context-aware menu (never auto-runs a
command); an explicit or clearly implied command loads its reference; a workflow question
gets advice and no execution; anything else is general design work, and a missing
`PRODUCT.md` routes a *new surface* through `init` while a narrow refinement proceeds.

**Pin / hooks / doctor.** `pin` creates a `$command` shortcut — irrelevant here, we invoke
`npx impeccable <verb>`. `hooks` manages the automatic detector; this repo wires it for Codex
(`.codex/hooks.json`) and Copilot (`.github/hooks/impeccable.json`), both of which degrade to
a no-op when the binary is absent. `doctor` reports drift in three severities — `auto`
(repair without asking), `mention` (say it, no decision), `route` (name the command that
would close it, run only if asked) — and **never repairs truth drift**: a commit count is not
a contradiction, and inheritance is a designed behaviour, not a defect.

### 1.5 The detector, and what it cannot see

`npx impeccable detect` reads HTML/CSS/JSX and returns deterministic findings; it exits 2 on
findings, 1 on error, 0 clean. It runs in two tiers: the **per-edit hook** surfaces only the
unambiguous mechanical tier (broken images, overflow, contrast, gradient text, glow shadows,
system drift); the **deep pass** on session stop runs the full rule set over every touched UI
file, deduplicated. The mechanical tier is what gates CI here:

- `npm run check:design:source` — source only, works before a build.
- `npm run check:design` — build + source, against `docs/design/impeccable-baseline.json`
  (0 outstanding, 718 waived, four named waivers).
- `npx impeccable detect frontend/src frontend/dist --no-advisory` — the raw run.

Everything the detector cannot see is §3. A hook, or a clean detector, is never evidence that
the floor is met.

### 1.6 Two things the skill insists on that this repo has not done

- **No critique has ever run.** `impeccable signals` reports `critique.latest: null`. What
  exists is a technical audit, which is a different instrument: audit scores what is
  measurable, critique judges specificity and hierarchy before it sees a single finding.
  §2.1 makes this the entry artifact of Review rather than a nice-to-have.
- **The native workspaces inherited a web record.** Fixed by the per-workspace
  `PRODUCT.md` files added with this protocol; see `apps/mobile/PRODUCT.md` and
  `apps/windows/PRODUCT.md`.

---

## 2. The twelve phases

Each phase has one question, one artifact, and one exit test. A phase that produces no work
for a given file is recorded `n/a` **with the reason** — an empty cell is an unfinished
phase, a stated `n/a` is a decision.

| Phase | Question it answers | Command(s) | Artifact | Exit test |
|---|---|---|---|---|
| 1 Review | Is this specific, readable and honest before I measure anything? | `critique` | snapshot + trend | score /40, p0/p1 counted, snapshot written |
| 2 Audit | What is measurably wrong? | `audit`, `check:*` | dated audit | 5 dimensions scored 0–4, findings listed, **no edits made** |
| 3 Spec | What does the system already say about this? | `document`, `init`, `extract` | `DESIGN.md`, brief, `design.json` | brief exists, mode set, tokens documented, `doctor` schema-clean |
| 4 Plan | What exactly will change, and what will not? | `shape` (new) / the map in 2.4 | plan in the change description | files, commands, gates, blast radius, scope decisions named |
| 5 Fix | What is broken? | `clarify`, `adapt`, audit defects | code | named defects closed, gates green, no new findings |
| 6 Improve | Does it earn the surface's mode? | `typeset`, `layout`, `colorize`, `quieter`/`bolder`, `distill`, `animate`, `delight` | code | floor clean, one motion moment, states covered |
| 7 Update | Do the context files still describe the code? | `document`, `extract`, `init` | context files | `doctor --json` has no schema findings; values match shipped tokens |
| 8 Polish | What would a careful reviewer catch last? | `polish` | code + closed snapshot | snapshot closed, gates re-run, no stragglers |
| 9 Reaudit | Did it actually get better? | `audit` again | second dated audit or a diff | scores compared, no regression, prior findings closed |
| 10 Deploy | Does the shipped artifact hold? | build + prerender + CI | `frontend/dist`, CI run | `audit:pages` 0, headers verified at the edge |
| 11 Production | Does it survive real use? | `harden`, `optimize`, `onboard` | code + budgets | overflow/i18n/error/empty pass; LCP/INP/CLS budgets |
| 12 Maintain | Has anything drifted since? | `doctor`, `hooks`, `signals` | drift report | no unrepaired schema drift; truth drift routed to 3 |

### 2.1 Review — `critique`

Two assessments, kept apart: **A** is a design-director read of the source and the render;
**B** is detector and browser evidence. A must finish before B's findings reach the
synthesis, or the findings anchor the judgment. Where a sub-agent tool exists they run as two
isolated agents; where it does not, the run is **degraded** and the report's first line must
say so:

> ⚠️ DEGRADED: single-context (<reason>)

A silent degraded critique is a failed critique. Then: deliver the report in chat **first**,
persist the snapshot second (`impeccable critique-storage write`), read the trend, and close
with the targeted questions — or the literal line `Questions skipped: <count> fewer than 3
priority issues`. A run that ends on the report has not finished.

Scoring is out of 40 across the heuristic table; the snapshot carries `total_score`,
`max_score`, `p0_count`, `p1_count` and a content fingerprint so `polish` can tell the
assessed bytes from later edits. First run for a target has no trend — say so.

**In this repo:** one snapshot per surface, at `.impeccable/critique/`. Eight of fifteen are
reviewed — the front door and all seven Operate surfaces — and the remaining seven are
tracked as debt with `npx impeccable critique --target frontend/src/pages/<Page>.tsx` as the
closing command. Every one of the eight is a degraded run and says so in its first line: the
harness this repository is developed in exposes no sub-agent tool and no browser, so
Assessment A and Assessment B ran sequentially in one context. That is a weaker critique
than the skill specifies and it is labelled, not hidden. Review is the phase that most
resists automation, so it is scheduled, not skipped.

### 2.2 Audit — `audit`

Five dimensions, each scored 0–4, with the bands written down so two runs are comparable:
**Accessibility** (contrast, motion, ARIA, keyboard, semantics, alt, forms), **Performance**
(thrash, expensive effects, lazy loading, `will-change`, bundle, re-render), **Theming**
(literals, dark mode, token misuse, live switching), **Responsive** (fixed widths, 44px
targets, touch gestures, overflow, text scaling, breakpoints), **Implementation Integrity**
(detector findings verified in context, drift, decorative content, interchangeability).

The rules that make it useful: **audit does not fix**, findings are separated by severity,
deterministic findings are kept apart from judgment, false positives are named as such, and
gesture evidence says how it was produced (emulated viewport, synthesised touch, engine,
physical device) and what stayed untested. Health score = the five dimensions, out of 20.

### 2.3 Spec — `document`, `init`, `extract`

`DESIGN.md` frontmatter carries the machine-read token schema (`colors` is asserted by
`__tests__/appleParity.test.js`, 65 assertions — **do not hand-edit it casually**). The body
carries exactly eight sections in canonical order: Overview, Colors, Typography, Layout,
Elevation & Depth, Shapes, Components, Do's and Don'ts. Named rules ("one action colour",
"depth is a hairline") belong in the section they govern.

`.impeccable/design.json` is a sidecar of **extensions only** — colour metadata and tonal
ramps, typographic roles, elevation, motion, breakpoints, component previews. Never restate
the frontmatter; never let the two disagree.

`PRODUCT.md` is `init`'s artifact and the product's authority: platform, stack, users,
purpose, positioning, operating context, capabilities and constraints, brand commitments,
evidence on hand, principles, accessibility. This repository's copy predates the skill and is
richer than the template; it is maintained, not regenerated.

### 2.4 Plan — `shape` for new work, a written change map for the rest

For a new surface: two interview rounds (purpose/people/outcome; material/behaviour/
boundaries), then a direction, then the brief. For refinement, the plan is the ordered map
from findings to commands:

| Finding from Review/Audit | Command | Never |
|---|---|---|
| Copy that does not name its action or its recovery | `clarify` | rewriting product claims |
| Hierarchy, measure, scale | `typeset` | adding an eyebrow to create hierarchy |
| Spacing, rhythm, alignment | `layout` | adding a card to create grouping |
| Flat or accidental palette | `colorize` | inventing a hue outside HDS |
| Too loud, too many effects | `quieter` | deleting information to calm it |
| Too safe on a Persuade surface | `bolder` | adding decoration to a Read surface |
| Too much on the page | `distill` | hiding what a decision depends on |
| Breakpoints, touch, print | `adapt` | shrinking targets below 44px |
| Overflow, i18n, errors, empty | `harden` | inventing a value for the empty case |
| Load, render, animation cost | `optimize` | preloading everything |
| First run, empty state, activation | `onboard` | a modal that interrupts a task |

The plan names files, the craft-floor rules most at risk, the gates that must be re-run, and
what is explicitly **not** in scope. No code before that exists.

### 2.5–2.8 Fix, Improve, Update, Polish

- **Fix** closes defects an audit or a review named: contrast, target size, missing states,
  broken keyboard path, semantic HTML, dishonest empty text. Verified by re-running the gate
  that found them.
- **Improve** is mode-aware craft. Operate and Read surfaces improve by precision — a
  tighter grid, a real scale, honest density — not by adding a gesture. One authored motion
  moment per surface, exponential ease-out, from an already-visible default; reach past
  transform and opacity only where the world already uses them.
- **Update** is the phase most agents skip: after the code changes, the context files
  change. A token renamed in `apple.ts` and still named in `DESIGN.md` is drift that costs
  the next agent an hour. `npm run protocol:check` reads the briefs against the router and
  fails on an unclaimed route; `npx impeccable doctor --json` catches schema drift.
- **Polish** starts from the latest critique snapshot and treats its priority issues as the
  backlog. It works the whole path — flow, layout, type, colour, imagery, interaction,
  state, content, code — and it **closes** the snapshot when the issues are resolved. Polish
  is not a synonym for "final look"; it is the phase where the last 10% is paid for.
  *Local convention:* snapshots are kept as dated archives rather than deleted by
  `critique-storage close`, because the ledger reads them to show which surfaces have been
  reviewed. A closed P1 is recorded in the commit that closes it and in the next snapshot's
  score, not by removing the record of the run that found it.

### 2.9–2.12 Reaudit, Deploy, Production, Maintain

- **Reaudit** re-scores the same five dimensions and compares. A dimension that improved by
  a point with no finding closed is a scoring drift, not progress. Prior findings are
  re-checked one by one.
- **Deploy** is the built artifact: `npm run build:frontend` (216 prerendered documents),
  then `check:design`, `audit:pages`, `protocol:check`, `check:device`, `npx tsc -p frontend/tsconfig.json`, `npx jest`.
  The edge is Cloudflare Pages/Workers: security headers are verified **at the edge**, not
  in repo source, and `site_health_probe`'s aggregate-outcome step stays a hard failure.
- **Production** is `harden`/`optimize`/`onboard` against real conditions: 360px at 2G,
  Bangla text at 125%, a missing artifact, a failed fetch, an empty filter, a print sheet.
  Budgets: LCP < 2.5s, INP < 200ms, CLS < 0.1.
- **Maintain** is a cadence, not a mood: hook on every edit, gates on every commit, `doctor`
  weekly and before an update, `signals` when choosing work, `critique` trend per release,
  baselines only with a reviewed diff. A `CONTEXT_STALE` directive is reported, never
  repaired as a side effect of a design task.

---

## 3. The craft floor, as it applies here

Verify on the built result, in one batched look rather than a screenshot per tweak:
contrast (4.5:1 body, 3:1 large, never grey on a coloured surface); depth (an offset and a
soft blur — a zero-offset halo is decoration); spacing (tighter within groups, more above a
heading than below); type (65–75ch measure, display ≤6rem, tracking ≥−0.04em, real steps);
motion (one authored moment, exponential ease-out); states (hover, disabled, loading, error,
empty, focus); **browser surfaces** (selection, caret, `accent-color`, scrollbars, focus
ring, underline offset, tabular numerals); copy (controls name their action, errors name the
problem and the recovery); coverage (every brief requirement findable in seconds).

Refuse — the category defaults, a stated brief can earn them back, the marked ban cannot:

- *Bans:* a kicker/eyebrow above a heading (**no brief earns it**), gradient text, a coloured
  `border-left`/`border-right` above 1px, Unicode/emoji standing in for an icon.
- *Defaults to rewrite rather than soften:* same-size icon+heading+text cards as page
  structure; nested cards; the hero-metric template; section numbers that carry no
  information; a modal for a task that needs neither interruption nor protected focus;
  glass/blur as decoration; hard offset shadows outside a neobrutalist world; monospace as
  a costume for "technical"; a system display face as an own-world voice; geometric masks
  standing in for organic contours; light/dark picked by category rather than use scene.

Local enforcement: `scripts/check-craft-floor.mjs` (nine rules, 259 files, 0 violations),
`scripts/audit-pages.mjs` (216 documents, 0 findings), `scripts/check-design-residue.mjs`
(tokens, colour-mix, print), `scripts/check-contrast.mjs` (162 components, both themes).
The rest of the floor is the reviewer's job, which is why Review exists.

---

## 4. The per-file loop

A "file" here means a unit you would review as a unit: a route page, a shared primitive, a
content collection, a context document, or a pipeline file. The twelve phases do not all
apply to each class — the table below says which do, and the loop says what "done" means.

| Class | Example | Phases that apply | Phases that are `n/a`, and why |
|---|---|---|---|
| Route page | `frontend/src/pages/HazardsPage.tsx` | 1–12 | — |
| Shared primitive | `components/apple/primitives.tsx` | 1–9, 12 | 10–11: ships through every page, verified there |
| Chart/map | `components/map/*`, `useLeafletMap` | 1–6, 8–12 | 3: governed by its own brief, not a new spec |
| Prose/content | `content/site-routes.json`, `lib/i18n.ts` | 1–8, 11–12 | 10: no build artifact of its own |
| Context document | `DESIGN.md`, `.impeccable/*` | 3, 7, 12 | the rest: documents describe, they do not ship |
| Pipeline | `.github/workflows/*`, `scripts/*` | 4, 5, 9, 10, 12 | 1, 3, 6, 8, 11: no visual surface |

**The loop, per file:**

1. **Review** — resolve the target to a path or route. Read the surface brief
   (`.impeccable/surfaces/<surface>.md`): the mode, what the visitor is doing, the decisions
   to preserve. Look at the incumbent render at the sizes it ships at. If a critique snapshot
   exists for this target, read its priority issues; if not, write down the three judgments
   you would make and flag the missing snapshot.
2. **Audit** — run the deterministic instruments on this file only:
   `npx impeccable detect <file> --json`, `node scripts/check-craft-floor.mjs --json`,
   plus the token/contrast/residue checks whose scope includes it. Record findings; **change
   nothing yet**.
3. **Spec** — name the `DESIGN.md` section that governs this file and the brief decision it
   must not violate. If neither speaks to what you are about to do, the *spec* is what is
   missing: fix that first (`document`/`extract`), not the code.
4. **Plan** — the ordered change list, the craft-floor rules most at risk, the gates you
   will re-run, and what you are not touching.
5. **Fix** — the defects, smallest diff, each one traceable to a finding.
6. **Improve** — mode-appropriate craft, batched with the fix in one pass so the render is
   looked at once.
7. **Update** — if a token, prop, class or copy key changed, update `DESIGN.md`,
   `design.json`, the brief or `i18n.ts` in the same commit.
8. **Polish** — the last pass: alignment, orphan words, focus rings, hover and disabled,
   the empty case, the error string, the caret.
9. **Reaudit** — re-run the exact commands from step 2 and compare. A new finding is a
   regression, whatever the intent was.
10. **Deploy** — `npm run build:frontend` when the file ships pages; `npm run audit:pages`
    if it renders documents; `npm run protocol:check` if it added or moved a route.
11. **Production** — for anything interactive: overflow at 360px, 125% text, reduced motion,
    keyboard-only, a failed fetch, an empty list. For anything fetched or generated: the
    missing-artifact path.
12. **Maintain** — one line in the change description: phase state, commands run, result,
    waivers added (with the covering check named). That line is the ledger entry; without it
    the file has no memory and the next agent starts from zero.

**Batching.** One look at the render per pass, after a batch of changes — not one per tweak.
The measurements are cheap; the looking is expensive; both are pointless if the change has
not been finished.

**Compression.** On a one-line copy fix, phases 3, 7 and 11 collapse into "brief checked, no
token change, no interactive path" — but 1, 2, 5 and 9 do not collapse, because they are the
ones that catch the regression. On a design-led build, every phase is real work.

---

## 5. Order of work

Work surfaces in this order, and finish a wave before starting the next:

1. **Shared primitives and tokens** (`packages/design-system/src/apple.ts`,
   `frontend/src/index.css`, `components/apple/primitives.tsx`). Every later change inherits
   them; a token defect fixed here closes hundreds of instances at once.
2. **Operate surfaces** — the ones a visitor uses under time pressure (`/alerts`, `/live`,
   upload, auth). Defects hurt most here.
3. **Read surfaces** — hazards, districts, archive, docs, status. Type and measure first.
4. **Persuade surfaces** — the front door last, because it depends on all of the above and
   because it is the one place where ambition is allowed to cost something.
5. **Context documents** — after the code, never before, so the documents describe what
   shipped rather than what was intended.

Within a wave: Review → Audit → Plan on all of it, then Fix → Improve → Update per file,
then Polish → Reaudit on the wave. Interleaving Review of the next file with Fix of the
current one is how findings get anchored by fixes.

---

## 6. Gates and their evidence

| Command | Covers | Fails when |
|---|---|---|
| `npm run check:device` | tokens, prose, icons, contrast, residue, svg paint, craft floor | any rule breaks; includes `check:craft` |
| `npm run check:design:source` | detector rules over `frontend/src`, pre-build | a rule fires outside the baseline |
| `npm run check:design` | detector over build + source | a finding outside the baseline, or a stale waiver |
| `npm run audit:pages` | 216 documents: h1, heading order, title, description, canonical, `lang`, `<main>`, alt text, accessible names, safety framing | any finding; `--strict` for CI |
| `npm run protocol:check` | route ↔ surface brief coverage, brief modes, critique debt | an unclaimed route, a brief with no route, a missing mode |
| `npx impeccable doctor --json` | artifact schema drift, platform evidence, workspace inheritance | any `auto` finding unapplied |
| `npx tsc -p frontend/tsconfig.json --noEmit`, `npx jest` | types, 185 suites / 1974 assertions | anything red |

Baselines (`data/design/hex-baseline.json`, `data/design/svg-paint-baseline.json`,
`docs/design/impeccable-baseline.json`) are *counts*, not permissions. A baseline moves in
the same commit as the change that moves it, and the diff is reviewed as a design decision.

---

## 7. Definition of done

A change is done when all of these are true, and the change description says so in one line
per item:

- [ ] The surface brief was read and nothing in it was violated; if it was, the brief was
      updated in this commit with the reason.
- [ ] The craft floor was checked on the built result, not asserted.
- [ ] Review evidence exists for the touched surface (snapshot, or the recorded reason none
      does), and the audit's findings for this scope are closed or explicitly carried.
- [ ] The detector is clean or the waiver names its covering check.
- [ ] `DESIGN.md` / `design.json` / the brief / `i18n.ts` describe the code as shipped.
- [ ] `check:device`, `check:design`, `audit:pages`, `protocol:check`, `tsc -p frontend/tsconfig.json` and `jest` pass.
- [ ] Anything interactive was exercised at 360px, at 125% text, keyboard-only, and with its
      data missing.
- [ ] Copy invented nothing: every number, date and claim traces to an artifact.
- [ ] Safety framing is present on every new document.

---

## 8. Maintain cadence

| When | What | Command |
|---|---|---|
| Every UI edit | detector hook, immediate tier | the `.codex` / `.github` hook |
| Every session | load context once | `npx impeccable context --target frontend` |
| Every commit | the gate table in §6 | as listed |
| Every release | critique trend + polish backlog | `impeccable critique-storage trend <slug> 5` |
| Weekly | artifact drift | `npx impeccable doctor --json` |
| Monthly | ledger and brief review | `npm run protocol:check` |
| Before any update | drift first, then update | `doctor`, then `npx impeccable update` |
| When choosing work | current state, not memory | `npx impeccable signals` |

Tool version drift is not this protocol's job (`impeccable context` reports it as
`UPDATE_AVAILABLE`). Schema drift is `doctor`'s. Truth drift is a conversation with the
person who owns the product, routed to `init` or `document`.

---

## 9. Refusals

The protocol is mostly about what not to do:

- Do not edit UI before reading the craft floor, and do not load it for planning-only work.
- Do not fix while auditing, and do not redesign while doctoring.
- Do not repair context drift as a side effect of a design task.
- Do not let a detector run decide a design question; it is evidence, not a verdict.
- Do not soften a ban into a preference to keep a layout. Rewrite the element.
- Do not add a phase to the loop or skip one silently; `n/a` needs its reason.
- Do not claim a render you did not look at, a gesture you did not exercise, or a contrast
  ratio you did not compute.
- Do not use `--update`, `--write-baseline` or a waiver to make a real finding disappear.
- Do not end a critique on the report without its questions, and do not end a run with
  neither questions nor the skip line.

---

## Appendix A — routes and surfaces

The table is generated, not maintained by hand:

```bash
npm run protocol:status    # print it
npm run protocol:check     # fail on a hard gap (CI)
npm run protocol:ledger    # rewrite docs/design/protocol-ledger.md
```

`scripts/protocol.mjs` reads `.impeccable/surfaces/*.md` and `frontend/src/App.tsx` and holds
four promises: every non-redirect route is claimed by exactly one brief, every brief route
still exists in the router, every brief declares a mode the skill recognises, and every
surface reports whether a review snapshot exists. Current state — 15 surfaces, 66 public
routes, 66 claimed, 3 redirects, **8 of 15 surfaces reviewed**:

| Surface | Mode | Routes | Review |
|---|---|---|---|
| `front-door` | Persuade | 1 | 32/40, 2 P1 |
| `live-map` | Operate | 4 | 28/40, 2 P1 |
| `forecast-console` | Operate | 6 | 31/40, 1 P1 |
| `alerts-advisories` | Operate | 4 | 33/40, 1 P1 |
| `upload` | Operate | 1 | 32/40, 1 P1 |
| `auth` | Operate | 6 | 34/40, 0 P1 |
| `account` | Operate | 3 | 31/40, 1 P1 |
| `not-found` | Operate | catch-all | 30/40, 2 P1 |
| `about-legal` | Persuade | 6 | — |
| `hazards` | Read | 2 | — |
| `districts-divisions` | Read | 5 | — |
| `archive-history` | Read | 7 | — |
| `docs-methodology` | Read | 13 | — |
| `last-run-status` | Read | 2 | — |
| `blog` | Read | 5 | — |

Closing one is a single command per surface, in the order of §5:

```bash
npx impeccable critique --target frontend/src/pages/AlertsPage.tsx
```

The snapshot is not a formality: `polish` reads it as its backlog, and `critique-storage
trend` is the only longitudinal record this repository has of design quality.

## Appendix B — where the skill's text lives locally

| Skill concept | Local artifact |
|---|---|
| Craft floor | `scripts/check-craft-floor.mjs`, §3 above |
| Detector rules | `docs/design/impeccable-baseline.json` (0 outstanding, 4 waivers) |
| Audit scoring | `docs/audits/2026-10-26-impeccable-adoption-audit.md` |
| Design spec | `DESIGN.md` (8-section body) + `.impeccable/design.json` |
| Surface briefs | `.impeccable/surfaces/*.md` (15) |
| Product truth | `PRODUCT.md`, plus `apps/mobile/PRODUCT.md`, `apps/windows/PRODUCT.md` |
| Hooks | `.codex/hooks.json`, `.github/hooks/impeccable.json` |
| Route coverage | `scripts/protocol.mjs`, `npm run protocol:status` |
