# HazardNet frontend UI/UX improvement plan

**Status:** Awaiting implementation approval. This revision adds per-file mobile/desktop pixel contracts. No UI changes are authorized until the owner says go-ahead.  
**Prepared:** 2026-09-20  
**Revised:** 2026-09-20 (pixel-contract revision)  
**Mode:** Redesign — preserve HDS identity; replace unsafe or incoherent patterns.  
**Scope:** Public editorial site, operational console, forecast lookup, district detail, alerts, archive, account surfaces, shared components, accessibility, performance and QA.  
**Baseline:** Current working tree, including ADR 0009/0014 stored-forecast implementation.  
**Design read:** A Bangladesh agricultural decision-support service for farmers, extension officers, field coordinators and analysts, using a calm, trust-first NASA Horizon Design System language.  
**Visitor modes (Impeccable):** `/` and long-form knowledge = **Read**; `/live`, district, alerts, analytics = **Operate**; auth = **Operate**; blog marketing chrome = **Read**. Never treat the console as Persuade.

---

## How to use this document

1. Sections 0–12 are the product, semantic and delivery plan (unchanged in intent from the 2026-09-20 draft).
2. **Section 13 is the global pixel system.** Every later contract must cite it; no one-off `13.5px`, `rounded-2xl`, `shadow-xl`, or `z-[9999]`.
3. **Section 14 is the per-file mobile/desktop contract.** Implementation edits those files against those numbers.
4. **Section 15 is media policy** (Unsplash/Pexels/Remotion vs `PUBLIC_SURFACE.md`).
5. **Do not start code until the owner confirms this revision.** Superpowers architectural gate: written-spec approval precedes implementation.

---

## Executive recommendation

Improve the frontend by making it **easier to understand what the data says, where it came from, how old it is, and what the user can do next**. Visual refinement supports that goal; it must not make uncertain data appear more authoritative.

Preserve React 18, TypeScript, Vite, Tailwind v4, React Router, TanStack Query, Leaflet, the existing NASA HDS token pipeline, the public-front-door/console split, and current routes. Do not introduce Next.js, a new design system, a new animation library, or a decorative dashboard aesthetic.

**Mobile-first means the 360px layout is authored first.** Desktop is an expansion of that task order, not the source that gets squeezed. Adaptation is rethinking order and disclosure, not scaling pixels (Impeccable `adapt`).

Deliver in this order:

1. Establish reproducible visual, behavioral and performance baselines.
2. Fix forecast-state semantics, provenance and accessibility defects in the new lookup flow.
3. Establish a small, tested set of HDS components and layout rules (this document’s pixel system).
4. Unify navigation and responsive behavior without silently changing URLs or labels.
5. Improve the console/map and district/alert workflows one vertical slice at a time.
6. Refine the front door, archive and account surfaces using the same component contracts.
7. Validate Bengali, offline/slow-network behavior, assistive technology and real device performance.
8. Roll out through preview reviews and explicit release gates, retaining the research embargo.

**Definition of success:** A user can locate their district, distinguish a stored outlook from an official warning, identify its publication/target dates and data limitations, and reach a relevant next action on a small phone without depending on animation, map interaction or sign-in.

---

## 0. Skill application for this revision

Order of authority is unchanged: owner decisions and data integrity → accessibility and low-end hardware → `DESIGN.md` / HDS master / `PUBLIC_SURFACE.md` / ADRs → existing functional contracts → these skills.

| Source | What this revision takes | What it refuses |
|---|---|---|
| [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Priority ladder: a11y → 44×44 touch → CLS/performance → one style → mobile-first breakpoints → 16px body → reduced-motion → labelled forms → predictable nav → charts that are not colour-only. | Mixing a second visual style; emoji-as-icon; hover-only actions; body &lt; 12px. |
| [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) | Treat `DESIGN.md` as the agent-readable visual world. Pixel contracts below are an operational annex to that file, not a competing system. | Copying another brand’s DESIGN.md (Linear, Nintendo, etc.) over NASA HDS. |
| [obra/superpowers](https://github.com/obra/superpowers) | Architectural path: written spec, then wait for go-ahead. TDD on state contracts. No “too simple to need a design.” | Starting implementation in the same breath as this rewrite. |
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | Shape/adapt/layout/typeset/harden: Read vs Operate modes; mobile is not scaled desktop; HDS tokens are the brief; craft floor (no fake data, no unearned glass). | Bolder/overdrive on operational screens; cinematic motion; rounded-full pills on HDS surfaces. |
| Vercel Web Interface Guidelines | Semantic buttons vs links, visible `:focus-visible`, `aria-live` for async, `tabular-nums`, `min-w-0`, `env(safe-area-inset-*)`, no `user-scalable=no`. | Title Case on HDS sentence-case controls; `transition: all`; `outline-none` without replacement. |

**Conflict rule:** When a skill wants glass, bounce, a second accent, a hero photograph of a flood, or Title Case buttons, HDS + `PUBLIC_SURFACE.md` win.

---

## 1. How Taste Skill is applied

### 1.1 Pinned upstream material

Reviewed the repository requested by the owner at commit [`e79ca9ec7e071eb3a3b623c4fb752e853fc3ed58`](https://github.com/Leonxlnx/taste-skill/tree/e79ca9ec7e071eb3a3b623c4fb752e853fc3ed58):

- [Core Taste Skill](https://github.com/Leonxlnx/taste-skill/blob/e79ca9ec7e071eb3a3b623c4fb752e853fc3ed58/skills/taste-skill/SKILL.md)
- [Redesign Skill](https://github.com/Leonxlnx/taste-skill/blob/e79ca9ec7e071eb3a3b623c4fb752e853fc3ed58/skills/redesign-skill/SKILL.md)
- [Output Skill](https://github.com/Leonxlnx/taste-skill/blob/e79ca9ec7e071eb3a3b623c4fb752e853fc3ed58/skills/output-skill/SKILL.md)

Apply Taste directly to editorial/landing surfaces. For operational surfaces, use the redesign audit and transferable principles, constrained by HazardNet's accessibility, data semantics and existing design rules.

### 1.2 Precedence and conflict resolution

1. User decisions, data integrity, privacy/security boundaries and research embargo.
2. Accessibility requirements and task completion on low-end hardware.
3. `DESIGN.md`, `docs/design-system/MASTER.md`, `docs/PUBLIC_SURFACE.md`, ADRs 0009/0012/0014.
4. Existing functional/SEO contracts and verified behavior.
5. Contextually applicable Taste / ui-ux-pro-max / Impeccable guidance.

| Upstream suggestion | HazardNet adaptation |
|---|---|
| Read the brief; audit before changing | Adopt fully. |
| Preserve brand, routes and working interactions | Adopt fully. No route renames without approval. |
| Replace generic Inter typography | Retain Inter headings, Public Sans body and DM Mono numerals. Improve role assignment, scale and spacing. |
| One coherent design system | Retain HDS. Do not add Carbon, Fluent, Radix Themes. |
| One accent color | Preserve HDS red/blue/orange/green roles and dataviz palette. |
| Add texture, imagery, glass or cinematic motion | Do not apply to operational screens. No stock flood imagery suggesting a current event. |
| Introduce organic statistics or randomized dates | Reject. |
| Font swap before other changes | Trust and state correctness precede polish. |
| Hero creativity and asymmetry | Restrained editorial hierarchy on `/` only. |

### 1.3 Contextual dials

| Surface | DESIGN_VARIANCE | MOTION_INTENSITY | VISUAL_DENSITY | Intent |
|---|---:|---:|---:|---|
| Public front door and methodology | 3 | 2 | 4 | Editorial hierarchy; verified evidence; calm navigation. |
| Console and district detail | 2 | 1 | 6 desktop / 4 mobile | Predictable controls; detail through disclosure. |
| Alerts and evidence cards | 2 | 1 | 5 | Status, date, district and official guidance first. |
| Forms, authentication, lookup | 2 | 1 | 3 | One clear task and unambiguous validation. |
| Offline / reduced-motion / low-bandwidth | Same task structure | 0 decorative | Same essential information | Remove optional effects, not provenance. |

### 1.4 Non-goals

- No new trained-model inference in the browser or request path.
- No restoration of raster-upload simulation, fake probabilities, synthetic latency or hidden research scores.
- No automatic alert publication or changes to review authorization.
- No changes to conversion endpoint authentication.
- No wholesale framework rewrite, route-slug replacement or monolithic visual refactor.
- No claim that a screenshot audit proves WCAG conformance.
- No 5-tab mobile bottom nav unless the owner separately approves an IA change (`App.tsx` currently renders an empty placeholder).

---

## 2. Evidence-backed current-state assessment

This planning turn performed a **source/document/configuration review**, not a fresh browser audit. Rendered severity must be checked in Phase 0.

### 2.1 Existing strengths to preserve

| Asset | Evidence | Preserve because |
|---|---|---|
| Vendored HDS tokens and semantic mapping | `data/design/nasa-hds/tokens.json`, `frontend/src/styles/nasa-hds.css`, `frontend/src/index.css` | Replacement would create avoidable churn. |
| Editorial `/` separate from `/live` | `FrontDoor.tsx`, `App.tsx`, `docs/PUBLIC_SURFACE.md` | Different first questions. |
| Stored-forecast HTTP contract | `storedPrediction.ts`, `StoredForecastPanel.tsx` | Visual work must not undo ADR 0009/0014. |
| Language and low-bandwidth foundations | `useI18n.ts`, `lib/i18n.ts`, `useBandwidthMode.ts` | Reuse. |
| Alert components and evidence workflows | `components/alerts/` | Expand, do not replace. |
| Layered quality checks | `scripts/check-design-quality.mjs`, Playwright, Jest | Extend. |
| Static content/prerender contract | `frontend/src/content/`, `frontend/scripts/prerender.mjs` | No-JS readers must stay consistent. |

### 2.2 Prioritized findings

| ID | Priority | Source observation | User risk | Planned resolution |
|---|---|---|---|---|
| UX-01 | P0 | `StoredForecastPanel` maps `null` to “unavailable”; `UploadPage` starts with `null` | Idle, loading, uncovered and failed look alike | Discriminated state model. |
| UX-02 | P0 | `fetchStoredPrediction` collapses non-OK HTTP into one message | 404, 429, offline, 500 indistinguishable | Typed errors + retry policy. |
| UX-03 | P0 | `App.tsx` owns `<main>`; `UploadPage.tsx` also renders `<main>` | Nested landmarks | One app-level main. |
| UX-04 | P1 | Lookup copy is literal English; raw dates/`.toFixed()` | Bengali core flow incomplete | `useI18n` + locale formatters. |
| UX-05 | P1 | `LiveMapView.tsx`: 10–11px labels, large radii, shadows, ad hoc colours, high z-index | Unreadable controls; off-HDS | Section 14 map contract. |
| UX-06 | P1 | `Dashboard.tsx`, `LiveMapView.tsx`, `DistrictDetailPage.tsx` are god-files | Risky interaction changes | Feature extractions with tests. |
| UX-07 | P1 | Route `AnimatePresence` plus local Motion | Reduced-motion and delayed content | Central motion policy; no wait-for-exit on essential content. |
| UX-08 | P1 | Dark-mode docs vs CSS disagree | Contrast may fail by route | Support matrix; no new theme switch. |
| UX-09 | P1 | Default Playwright `testMatch` is only `full-app-qa.spec.ts` | New specs never run | Explicit `testMatch`. |
| UX-10 | P1 | Accessibility coverage limited; raster PDFs | Overstated a11y | AT review + print HTML. |
| UX-11 | P1 | “Compound Vulnerability” / “Vulnerability Index” still present | Provenance risk | Value-source register. |
| UX-12 | P1 | Nav split across Navbar / MenuDrawer / CommandPalette | Label drift | Shared `lib/navigation.ts`. |
| UX-13 | P1 | Navbar: `rounded-xl`, `backdrop-blur`, `text-[10px]`, purple/rose/indigo icon wells | Off-HDS chrome on every page | Square HDS masthead; carbon wells only. |
| UX-14 | P1 | Auth: `rounded-2xl`/`rounded-3xl`, `text-carbon-black` on nasa-red (fails small-text contrast), `autoFocus` on mobile | Touch/contrast/iOS zoom | Section 14 auth contract. |
| UX-15 | P1 | `App.tsx` `<main>` uses `p-3` (12px) and `pb-28`; empty bottom-nav node | Tight gutters; dead DOM | 16px gutters; delete empty node. |
| UX-16 | P1 | Toasts use `boxShadow: 0 10px 15px` and sit at `zIndex: 10050` | Off-system elevation | Hairline card; z-index scale. |
| UX-17 | P2 | Front-door eyebrows at `text-[10px]`; body sections at `text-sm` (14px) | Metadata below 12px floor | 12px metadata, 16px body. |
| UX-18 | P2 | `--hn-teal-*`, `--hn-sky-*`, `--hn-emerald-*` still in `:root` | Second accent families | Stop using in components; carbon/HDS only. |
| UX-19 | P2 | Leaflet container `border-radius: 1.25rem`; looping radar/cluster pulses | Off-HDS; reduced-motion already kills them, but they cost GPU before that | Radius 0; no looping map FX. |
| UX-20 | P2 | Global `button { font-size: 14px }` vs 16px mobile inputs | Inconsistent controls | Buttons 16px mobile / 14px desktop labels with 44px min height. |

### 2.3 Known verification baseline

Preceding implementation recorded 98 Jest suites / 1,074 passing tests, passing build/typecheck, ESLint 0 errors / 311 warnings. This is a regression reference, not proof that UX is good. Current CWV field values are **not measured here**.

---

## 3. User journeys and information hierarchy

Treat personas as task hypotheses to validate.

| Journey | Entry | Essential questions | Completion condition |
|---|---|---|---|
| Farmer or field officer checks a district | Shared district link, lookup, map | Which district/horizon? Published when? Outlook? Official warning? | Dated outlook or clear no-coverage; can open official guidance. |
| Coordinator reviews published alerts | `/alerts` → detail | Published? Evidence? Area/time? | Published evidence and printable guidance. |
| Analyst compares locations | Console/compare | Periods, source types, coverage comparable? | Like-for-like with missing data visible. |
| Journalist/reviewer checks credibility | `/` → methodology/status/archive | Who? How fresh? Limits? | Dated sources without learning console controls. |
| Returning user checks saved districts | User dashboard | Current? Which saved area changed? | Opens a district; privacy intact. |
| Offline user returns to cached data | Installed app / visited route | What is cached? How old? | Dated cache; never false “live” or “all clear.” |

### Proposed hierarchy for a district result

1. District and horizon.
2. Stored outlook + publication/target dates + coverage/source status.
3. Dominant hazard and severity, with correct score semantics.
4. Relevant published alert, if one exists, clearly distinguished from the forecast.
5. Official guidance and existing advisory actions.
6. Optional evidence: model version, independent physics track, missing fields, export.

Keep separate: hazard category ≠ alert level; stored row ≠ fresh cloud data; prediction date ≠ page load time; top-class score ≠ calibrated probability; no published alert ≠ no risk; missing forecast ≠ zero severity.

### Layout sketches

```text
Desktop console (≥1024px)
┌ Brand 64px ── Language · Data saver · Account ─────────────────────────┐
│ District search  Horizon  Source/date status                            │
├──────────────────────────────────────┬─────────────────────────────────┤
│ Map or equivalent table              │ Selected district               │
│ Legend; 44px controls                │ Stored outlook + dates          │
│                                      │ Published alert if any          │
│                                      │ Guidance / evidence disclosure  │
├──────────────────────────────────────┴─────────────────────────────────┤
│ Coverage notes / limitations / official guidance links                  │
└────────────────────────────────────────────────────────────────────────┘

Mobile console (360–639px) — task order, not shrunk desktop
56px nav → district + horizon → source/date → summary → guidance
→ map/table toggle → evidence disclosure → export
Chat FAB: 56×56, 16px + safe-area from right/bottom. Never covers submit.

Lookup (/upload)
h1 + one-sentence task
District [labelled select 44px]  Horizon [7 / 15]
[Load stored forecast]  min-height 44px, nasa-blue (on-page action)
Result region: idle | pending | result | no coverage | error
```

Do not pin critical controls over content until safe-area, keyboard and focus-obscuration tests pass. Do not make the map the only route to district data.

---

## 4. Technical architecture for the improvements

### 4.1 Keep the current stack; consolidate before adding

- Continue Vite/Tailwind v4; do not apply Next.js/RSC snippets to this SPA.
- Keep `framer-motion` imports working; a package-name migration is not a UI requirement.
- Inventory MUI, Base UI and custom UI imports. Choose an existing accessible primitive.
- CSS modules or existing semantic CSS/Tailwind within a component; no second global reset.

### 4.2 Proposed module boundaries

Names below are files to create during implementation, not claims they already exist.

```text
frontend/src/
  components/ui/              HDS-styled primitives with semantic HTML
  components/layout/          page header, content width, section spacing, shell
  features/forecast/          query adapter, state model, result/evidence UI
  features/map/               extracted toolbar, legend, viewport panel, table bridge
  features/district/          district summary and evidence sections
  lib/navigation.ts           route metadata consumed by existing navigation surfaces
```

Do not move existing modules merely to satisfy this tree. Start with the forecast vertical slice.

### 4.3 Forecast state contract

```ts
type ForecastViewState =
  | { kind: 'idle' }
  | { kind: 'loading'; selection: Selection }
  | { kind: 'ready'; selection: Selection; data: ForecastViewModel; refreshing: boolean }
  | { kind: 'uncovered'; selection: Selection }
  | { kind: 'error'; selection: Selection; reason: 'offline' | 'rate-limited' | 'server' | 'invalid-data' };

type Selection = { districtId: string; horizon: '7_days' | '15_days' };
```

`ForecastViewModel` must include producer dates, hazard, score semantics and explicit nullable evidence. Treat **source** and **freshness** as separate axes. Until the API returns reliable source metadata, display “Stored forecast” and the row's dates, not “Live Firestore.”

Implementation rules:

1. Extend the fetch helper to accept `AbortSignal` and preserve HTTP error categories.
2. TanStack Query keyed by district/horizon, not translated label.
3. Locale out of the data key; format at the presentation boundary.
4. Abort obsolete requests.
5. Never show the previous district's result under a new heading.
6. Do not retry invalid input or 404; bound transient retries; respect 429.
7. One polite status region; avoid repeated announcements.
8. Parse/validate URLs and payloads at boundaries.

### 4.4 Shared component contracts

| Component | Required behavior | Non-negotiable tests |
|---|---|---|
| `ActionButton` / `NavigationLink` | In-page action vs navigation; HDS colours; busy/disabled | Keyboard, focus, contrast, no nested interactive. |
| `Field`, `SelectField`, `ErrorSummary` | Persistent label, hint/error IDs | Label relationship, error announcement. |
| `SourceStatus` / `FreshnessLabel` | Source and timestamp separate | Snapshot/offline/unknown; no time-of-render substitution. |
| `ForecastSummary` | Hazard, severity, dates; no invented probability bars | Nullable fields; no fake zero. |
| `EvidenceDisclosure` | Native details or tested primitive | Keyboard; no hidden safety disclaimer. |
| `DataState` family | Idle, skeleton, uncovered, error, loaded | Stable layout; no indefinite skeleton. |
| `MapToolbar` / `MapLegend` | Labels, pressed states, non-map equivalent | 44px targets; meaning without colour. |
| `ResponsiveDataTable` | Semantic headers/caption; contained overflow | SR association; page does not overflow. |

---

## 5. Phased implementation playbook

Each phase finishes with evidence and an independently reviewable patch. **Do not begin until this document is approved.**

### Phase 0 — Baseline, inventory and task validation

**Owner:** Frontend lead + designer/QA. **Estimate:** 3–4 person-days.

1. Record branch/commit, dependency versions, route list.
2. Inventory routes from `App.tsx` and content manifests.
3. Capture rendered baselines at **360, 390, 768, 1280, 1440** widths. Light/system-dark, English/Bengali, 200% zoom.
4. Review computed styles for font, radius, contrast, overflow, z-index.
5. Record all data-bearing widgets in a value-source register.
6. Scenario matrix: success, delay, 404, 429, 500, malformed, missing evidence, cached/offline, expired auth.
7. Walk six key tasks internally.
8. Prioritized issue register.

**Exit gate:** Every P0/P1 issue has evidence, owner, journey and test strategy.

### Phase 1 — Correct the forecast lookup experience

**Estimate:** 4–6 person-days. Dependency: Phase 0 core routes.

Apply Section 14 contracts for `UploadPage.tsx`, `StoredForecastPanel.tsx`, `storedPrediction.ts`, `usePrediction.ts`. Remove nested `<main>`. Discriminated states. i18n. Deep-link `?district=&horizon=` without changing `/upload`.

**Acceptance:** Idle is not “unavailable”; 404 is no coverage; rapid district changes cannot flash another district’s forecast.

### Phase 2 — HDS foundation and reference components

**Estimate:** 5–7 person-days.

Implement Section 13 tokens in primitives. Lookup flow is the reference composition. Approve mobile, desktop, EN/BN, emitted colour modes before spreading.

### Phase 3 — Navigation, shell and route transitions

**Estimate:** 4–5 person-days.

Shared navigation data. `aria-current`. Keyboard-complete drawer and command palette. One page-width policy per family. Central reduced-motion. Safe-area.

### Phase 4 — Console and map interaction redesign

**Estimate:** 7–10 person-days.

Extract toolbar/legend/summary. Summary-first mobile. Map/table parity. Low-bandwidth skips optional tiles.

### Phase 5 — District, alerts and evidence hierarchy

**Estimate:** 5–7 person-days.

Recompose `DistrictDetailPage.tsx` around Section 3. Align alert presentation. Print HTML primary path.

### Phase 6 — Front door, archive, editorial and account polish

**Estimate:** 6–8 person-days.

Typography/spacing on `/` without a photograph-led hero. Auth forms per Section 14. No invented testimonials.

### Phase 7 — Localization, accessibility and performance hardening

**Estimate:** 5–7 person-days.

Dictionaries, Intl dates, AT, 200%/400% zoom, production profiling, SW cache.

### Phase 8 — Controlled rollout

**Estimate:** 2–3 person-days. Reference slice first. Never roll back stored-only inference or embargo to recover an old visual.

---

## 6. State, accessibility and responsive specifications

### 6.1 Minimum state matrix

| State | Required presentation | Forbidden |
|---|---|---|
| Idle | Instruction and next action | “Unavailable” before a request. |
| Initial loading | Stable skeleton, brief status | Fake progress %, repeated SR announcements. |
| Ready / fresh | District/horizon, producer date, source if known | “Live” from HTTP 200. |
| Ready / stale | Dates + stale explanation | Resetting date to now. |
| Background refresh | Prior same-selection result | Focus move or cross-district swap. |
| No coverage | Explicit missing unit/horizon | Filling with a static risk value. |
| Error / offline | Distinguish type; dated cache only if available | Silent substitution. |
| Partial evidence | Available summary; fields “not recorded” | Zero-filled probability bars. |
| Unauthenticated | Sign-in explanation | Disguising auth failure as “no records.” |

### 6.2 Accessibility standards

- Target WCAG 2.2 AA for essential journeys (goal, not a certification claim).
- Target size: 24×24 CSS px minimum (WCAG 2.2); **prefer 44×44** for primary mobile controls.
- Normal text 4.5:1; large text 3:1; non-text 3:1.
- Never rely on colour, animation, spatial position, hover or drag alone.
- Exactly one active `main` landmark.
- Focus visible and not obscured by sticky chrome.
- Tables: caption + associations. Charts: summary + data alternative.
- Preserve user zoom. Use `dvh`/safe-area. Do not viewport-lock long forms.

### 6.3 Responsive behavior by capability

- Narrow: task order over symmetry. Collapse side-by-side evidence below summary.
- 768px-class: both orientations and split-screen.
- Wide: constrained prose measure; extra space for data only when it helps comparison.
- On-screen keyboard: selected input, submit and errors remain reachable.
- Pointer/hover media queries for optional hover; every action discoverable on touch.
- Use HDS breakpoints (Section 13); do not invent a second scale.

---

## 7. Performance and instrumentation plan

Proposed targets, not current measurements. Never weaken data integrity to meet a speed target.

| Metric | Proposed target | Measurement |
|---|---|---|
| Field CWV | p75 LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 | Privacy-reviewed field; lab separate. |
| Loading feedback | Visible state within 100ms of action | Performance trace; excludes network. |
| Layout stability | Skeleton-to-result does not move focused controls | Delayed responses + long Bengali labels. |
| Route transfer | No &gt;10% regression without approval | Production asset report. |
| Bundle gates | Keep `check-bundle.mjs`: 800 KiB max gzip chunk / 1,600 KiB total gzip JS | Existing gate. |
| Low-bandwidth | Zero optional raster tiles before opt-in | Request assertions. |
| Task success | ≥90% district lookup in moderated eval | Directional, not population stats. |

Instrument only if consent/privacy policy permits. Proposed events: `forecast_lookup_started`, `forecast_lookup_result_state`, `map_table_mode_changed`. No coordinates, names, email, free text, tokens, full payloads.

---

## 8. Verification implementation and commands

### 8.1 Fixtures

Valid stored row, missing fields, uncovered district, stale snapshot, unknown source, held/unpublished counts, 429, offline. Label as fixtures. Freeze clock/locale. Stub tiles. Disable optional animation for screenshots.

### 8.2 New test work

| Layer | Add/extend | Assertions |
|---|---|---|
| Unit | Forecast state/view-model | No synthetic data; source ≠ freshness. |
| Component | Lookup + panel | Idle/loading/error/uncovered; one main; locale. |
| Integration | Query hook | Abort; no cross-district flash. |
| A11y | jest-axe + browser | Focus, names/roles, contrast. |
| Browser | `e2e/forecast-ux.spec.ts`, `e2e/navigation-a11y.spec.ts` | Must be in `testMatch`. |
| Visual | Route/state screenshots | 360 and 1280 on fixtures. |
| Contract | Claims, embargo, paths, SW, SEO | No unsupported metrics. |

### 8.3 Commands (from repo root)

```bash
npm ci
npm run lint
npm run lint:eslint
npm run build
npm test -- --runInBand
npm run check:bundle
npm run check:design
npm run check:paths
npm run check:embargo
node scripts/check-claims.mjs
npx playwright test --list
```

Static preview:

```bash
npm --prefix frontend run preview -- --host 0.0.0.0 --port 4173
```

Vite preview does not provide Express APIs. Browser-facing code must use relative API URLs. Dev proxy port mismatch (3001 vs 3000) must be configured explicitly. Do not weaken production CSP for embedded previews.

### 8.4 Human review gates (each PR)

Before/after of relevant states; keyboard walkthrough; source/date check; Bengali for critical copy; bundle diff; design-quality baseline explanation; no private/embargoed values in artifacts.

---

## 9. Delivery backlog, dependencies and sizing

| Work package | Priority | Phase | Depends on | Effort, person-days | Done when |
|---|---|---:|---|---:|---|
| UX-BASE: inventory and baseline | P0 | 0 | — | 3–4 | Evidence and route matrix approved. |
| UX-STATE: forecast result-state | P0 | 1 | UX-BASE | 4–6 | No idle/loading/coverage/error conflation. |
| UX-HDS: primitives and reference | P1 | 2 | UX-BASE | 5–7 | Reference slice accepted. |
| UX-SHELL: navigation and shell | P1 | 3 | UX-HDS | 4–5 | Keyboard/route/SEO preserved. |
| UX-MAP: console + map/table | P1 | 4 | UX-STATE, UX-SHELL | 7–10 | Core task without raster tiles. |
| UX-EVIDENCE: district/alerts/print | P1 | 5 | UX-STATE, UX-HDS | 5–7 | Evidence understandable and printable. |
| UX-PUBLIC: editorial/archive/account | P2 | 6 | UX-HDS, UX-SHELL | 6–8 | Shared patterns, no content/auth regression. |
| UX-HARDEN: BN, AT, perf, offline | P1 | 7 | Incremental | 5–7 | Release checks pass. |
| UX-RELEASE | P1 | 8 | Gates | 2–3 | Preview sign-off. |
| **Total** | | | | **41–57** | Overlaps; not all coding. |

Tentative calendar: **6–9 weeks** with two frontend engineers. Solo implementer uses the effort range.

### First implementation batch (after go-ahead)

1. Baseline route/state matrix and two lookup fixtures.
2. Nested main + idle/loading/uncovered/error.
3. Locale-aware lookup copy.
4. Date/source/evidence hierarchy in the reference panel.
5. HTTP failure, keyboard, mobile, Bengali tests.
6. Review that slice before the console.

---

## 10. Risk register and decision gates

| Risk | Prevention | Stop/rollback |
|---|---|---|
| Polished UI overstates model authority | Provenance components; domain review | Invented forecast, “live” claim, official-warning implication. |
| Research leakage | ADR 0014; pattern gate | Embargoed formula in public assets. |
| CSS cleanup breaks map layers | Small migrations; computed-style snapshots | Obscured controls, overflow. |
| Large refactor changes behavior | Stable interfaces; one route slice | Selection mismatch; request fan-out. |
| Route/SEO regression | Preserve slugs; prerender diff | Broken inbound URL. |
| Imagery implies an event | Section 15 | Any undated disaster photo on a public surface. |
| Accessibility false confidence | axe + CSS + keyboard + AT | Task needs pointer, colour or map. |

### Decisions to confirm (defaults until confirmed)

1. **Brand:** Preserve NASA HDS.
2. **Dark mode:** Audit only; no new theme switch.
3. **Navigation/URL:** No new primary labels or slugs.
4. **Bengali:** Native-speaking domain review before public safety-relevant new strings.
5. **Imagery:** Default refuse photographs on `/` (PUBLIC_SURFACE rule 5). Section 15.
6. **PDF:** Print HTML now; tagged PDF separately.
7. **Mobile bottom nav:** Do not add. Delete empty node in `App.tsx`.

---

## 11. Final definition of done

### Product integrity

- [ ] Stored forecasts remain stored reads in both HTTP runtimes.
- [ ] District/horizon/producer dates correct after selection, navigation, refresh.
- [ ] Missing, stale, uncovered and error states distinct; no synthesized risk data.
- [ ] Research formula, derived division score and ranking remain absent.
- [ ] Alert publication/review rules and conversion-auth unchanged.

### Experience and design

- [ ] Core district task completable without the map.
- [ ] HDS typography, colours, spacing, 0px/2px radii consistent on migrated surfaces.
- [ ] English and Bengali critical journeys complete.
- [ ] Mobile/keyboard/zoom/reduced-motion/low-bandwidth pass.
- [ ] Every visible action has feedback and recovery.
- [ ] No visual treatment implies an unverified observation, live measurement or official warning.
- [ ] Pixel contracts in Section 14 hold at 360 and 1280 on migrated files.

### Engineering and verification

- [ ] Build, TypeScript, tests and selected browser suites pass.
- [ ] New browser specs discovered by CI.
- [ ] Claims, embargo, public-path, design, bundle, security/cache, SEO gates pass.
- [ ] Contrast and AT checks documented.
- [ ] Implementation report lists remaining gaps.

---

## 12. Repository evidence and handoff index

- `DESIGN.md`, `docs/design-system/MASTER.md`, `docs/PUBLIC_SURFACE.md`, ADRs 0009/0012/0014
- `frontend/src/App.tsx`, `index.css`, pages and components listed in Section 14
- `scripts/check-design-quality.mjs`, `playwright.config.ts`, `docs/frontend/ACCESSIBILITY.md`

**Handoff:** This document is a plan. Implementation starts only after owner go-ahead, beginning with Phase 0 and the first implementation batch.

---

## 13. Global pixel system

All values are CSS pixels at 1×. Use tokens (`var(--hds-spacing-2)`), not magic numbers. If a value is not on this scale, the scale is wrong or the value is wrong — decide in the open.

### 13.1 Breakpoints (NASA HDS — the only scale)

| Token | Width | Role in this app |
|---|---:|---|
| `mobile` | 320 | Smallest supported. Must not overflow. |
| `mobile-lg` | 480 | Large phone. Gutter still 16px (override HDS 4px gutter — 4px is too tight for 44px controls). |
| `tablet` | 640 | Compact tablet / large phone landscape. |
| `tablet-lg` | 880 | Two-column editorial; console still stacked summary-first. |
| `desktop` | 1024 | Console split (map + panel). Auth split screen. |
| `desktop-lg` | 1200 | Editorial max-width. |
| `widescreen` | 1400 | Extra comparison space only. |
| `tv` | 1920 | Do not stretch editorial past 1200. |

**Review widths:** 360, 390, 768, 1280, 1440. **Author mobile-first** with `min-width` queries.

**Do not use Tailwind `sm/md/lg` as a second mental model.** Map them only as: `sm`≈640, `md`≈768 (avoid new `md` unless it matches a content break), `lg`≈1024, `xl`≈1280, `2xl`≈1536.

### 13.2 Spacing scale (HDS)

| Token | px | Use |
|---|---:|---|
| `0-5` | 4 | Compact table cell padding; icon-to-label gap inside a control. |
| `1` | 8 | Tightest related items inside one component. |
| `1-5` | 12 | Button block padding; list marker gap. |
| `2` | 16 | Default sibling spacing; **page gutter below desktop**. |
| `2-5` | 20 | List item separation; inline button padding. |
| `3` | 24 | Section separation inside a component; **card padding**. |
| `4` | 32 | Component separation mobile/tablet; **desktop page gutter**. |
| `6` | 48 | Component separation desktop. |
| `8` | 64 | Major section padding. |
| `9` | 72 | Widescreen only. |

**Forbidden:** 10, 14, 18, 28, 36 as layout gaps. Optical 1px hairlines are allowed.

### 13.3 Type roles

| Role | Family | Size | Weight | Line-height | Tracking | Where |
|---|---|---:|---:|---:|---:|---|
| Display | Inter | clamp(32px, 8vw, 48px) on `/` only | 700 | 1.06 | −0.03em | Front-door h1. Not console. |
| H1 page | Inter | 28px → 32px ≥640 | 700 | 1.2 | −0.03em | Page titles. |
| H2 section | Inter | 22px → 24px ≥1024 | 700 | 1.3 | −0.02em | Section titles. |
| H3 card | Inter | 18px | 700 | 1.15 | −0.02em | Card titles. |
| H4 | Inter | 18px | 600 | 1.35 | −0.02em | Subheads. |
| Intro | Public Sans | 18px | 400 | 1.5 | −0.01em | Standfirst. |
| Body | Public Sans | **16px** | 400 | 1.62 | 0 | Paragraphs, list items. |
| Control label | Public Sans | 16px &lt;768 / 14px ≥768 | 600 | 1.35 | 0 | Buttons, nav items in drawers. |
| Form label | Public Sans | 13px ≥640 / 16px associated control | 500 | 1.75 | 0.025em | Persistent labels. |
| Metadata / eyebrow | Public Sans or Inter | **12px** | 700 | 1.75 | 0.025em | Dates, sources, overlines. |
| Caption | Public Sans | 12px | 400 | 1.4 | 0 | Figcaptions. |
| Data | DM Mono | 13px → 16px ≥640 | 400–600 | 1.5 | 0 | Scores, IDs. `tabular-nums`. |
| Badge | DM Mono | 12px | 600 | 1 | 0.08em | State chips. Never 10px. |

**Floors:** Body 16px. Metadata 12px. No `text-[10px]`, `text-[11px]`, `text-[11.5px]`, `text-[13.5px]`. Bengali must not be shrunk to fit English layouts. `text-wrap: balance` on h1–h3.

**Contrast:** Body text `carbon-90` or `carbon-70` (secondary). Captions `carbon-60` minimum. Never `carbon-50` for words. White-on-`nasa-red` only for **large/bold** labels; small CTAs use `nasa-red-shade` + white (7.0:1) — see `index.css` `--primary-strong`.

### 13.4 Shape, elevation, focus, motion

| Token | Value |
|---|---|
| Surface radius | **0px** (cards, buttons, modals, tables, header, footer, map chrome) |
| Control radius | **2px** (checkbox, radio, select, text input, chip) |
| Avatar / status dot | `rounded-full` allowed only for circular glyphs |
| Structure border | 1px `carbon-20` |
| Emphasis border | 2px (outline button, chip, caution left edge) |
| Shadow | **None** on editorial and forms. Map popups/panels: one short shadow `0 1px 2px rgb(23 23 27 / 0.06)` |
| Glass / blur | **None** except already-fetched map tiles under a solid panel. `backdrop-filter: none` in low-bandwidth (already) |
| Focus | 1px dashed `carbon-black`/`carbon-60`, 1px offset. Never removed |
| Motion | 150ms / 300ms, `--ease-emphasized` / `--ease-standard`. Opacity/transform only. No spring, bounce, pulse, loop. `prefers-reduced-motion` already collapses durations |

### 13.5 Touch, safe area, hit targets

| Rule | Value |
|---|---|
| Primary control min | **44×44** (`--control-min-size`). Class `.tap-target` |
| WCAG 2.2 absolute min | 24×24 with equivalent spacing |
| Control gap | ≥8px between adjacent tap targets |
| Input font on coarse pointer / &lt;768 | **16px** (already forced in `index.css` — keep) |
| Page gutter | 16px &lt;1024; 32px ≥1024 |
| Editorial measure | `max-width: 1200px` centered |
| Console / auth / map | Full bleed; do not apply 1200px to the map shell |
| Navbar height | 56px &lt;640; 64px ≥640 (`--navbar-height`) |
| Skip link | 12px from top/left; above all chrome (`z-skip`) |
| Safe area | `env(safe-area-inset-*)` on sticky nav, chat FAB, drawers, full-bleed map |
| Sticky offset | Focusable content `scroll-margin-top: calc(var(--navbar-height) + 8px)` |
| Keyboard | Virtual keyboard must not trap submit/errors. Avoid `100vh` locks; use `dvh` |
| `touch-action` | `manipulation` on buttons/links |
| Hover | Optional enhancement under `@media (hover: hover)`. Never the only affordance |

### 13.6 Colour roles (do not flatten)

| Colour | Meaning | Typical use |
|---|---|---|
| NASA red `#f64137` | Go somewhere | Nav CTAs, errors. **Not** on-page actions, charts, map fills |
| NASA red shade `#b60109` | Small-label nav CTA / error text | 14–16px filled buttons |
| NASA blue `#1c67e3` | Do something here | Load forecast, filters, map tools |
| NASA blue shade `#0b3d91` | Links/info text on light | 9.9:1 |
| International orange `#ea6f24` | Status emphasis | Caution edge. Never primary action |
| Active green `#47da84` | Fresh/active | Status only. Never backgrounds or dataviz |
| Carbon 05 / white | Page / card | |
| Dataviz series A–E | Charts/map categories | Never brand red/blue |

**Banned in components:** `purple-*`, `indigo-*`, `rose-*`, `sky-*`, `emerald-*` (except existing severity tokens already mapped), `teal-*`, second grey ramps. `index.css` still defines `--hn-teal-*`; do not consume them in new or migrated UI.

**Small filled red button:** use `--primary-strong` (`#b60109`) + white, not white on `#f64137` (3.1:1 fails AA at 14px).

### 13.7 Stacking scale (replace ad hoc 9999 / 10050)

| Layer | Token | z-index | Surfaces |
|---|---|---:|---|
| Base | `--z-base` | 0 | Page, map panes default |
| Sticky content | `--z-sticky` | 10 | In-page sticky subheads |
| Map overlay | `--z-map` | 400 | Leaflet overlay pane (do not fight Leaflet’s pane z) |
| Masthead | `--z-nav` | 40 | Sticky/absolute navbar (`App.tsx` already z-40; Navbar inner `z-[2000]` must drop) |
| Drawer / palette | `--z-overlay` | 50 | MenuDrawer, CommandPalette backdrop |
| Modal | `--z-modal` | 60 | Dialogs, print preview |
| Toast | `--z-toast` | 70 | Toaster |
| Skip / a11y | `--z-a11y` | 80 | Skip link |

No `z-[10001]`, `z-[10050]`, `z-[9999]`, `z-[2000]`.

### 13.8 Shell families

| Family | Routes | `<main>` | Width | Padding | Footer | Chat |
|---|---|---|---|---|---|---|
| Editorial | `/`, `/about`, `/docs`, `/methodology`, `/alerts`, `/upload`, archive, hazards, divisions, blogs, legal | One, in `App.tsx` | max 1200px | 16 / 32 | Yes | Yes, 16+safe from edges |
| Console | `/live`, `/home*`, `/forecast/overview` | One, full-bleed | 100% × `100dvh` | 0 | No | No |
| Auth | `/login`, `/signup`, `/forgot-password`, `/update-password`, `/set-password`, `/auth/*` | Page-level main in `AuthLayout` — **App.tsx must not also wrap these in `<main>`** | split ≥1024 | 16 | No | No |
| User | `/dashboard`, `/profile` | App main | 1200 | 16 / 32 | Yes | Yes |

**Landmark rule:** Exactly one `<main>` per view. Auth pages: either App main *or* AuthLayout main, not both. Lookup: section, not main.

### 13.9 Form control geometry

| Part | Mobile (&lt;768) | Desktop |
|---|---|---|
| Text input / select | height 48px, padding 12×16, radius 2px, font 16px, border 1px carbon-20 | height 44px, font 16px still OK |
| Textarea | min-height 96px, same padding | same |
| Primary nav button | min-height 44px, padding 12×24, radius 0, bg `nasa-red-shade`, white label 16px/600 | same padding, label 14–16px |
| On-page action button | min-height 44px, bg `nasa-blue`, white | same |
| Outline action | 2px `nasa-blue`, label `nasa-blue-shade` | same |
| Icon-only | 44×44 `.tap-target`, `aria-label` | 44×44 |
| Checkbox/radio | 20×20 control in 44×44 hit box, radius 2px | same |
| Error text | 14px, `nasa-red-shade`, associated via `aria-describedby` | same |
| Error summary | 16px padding, focusable heading | same |

---

## 14. Per-file mobile / desktop pixel contracts

**How to read a row:** *Now* is source evidence, not a screenshot. *360* is the authored mobile layout. *1280* is desktop. All sizes in CSS px.

Shared anti-patterns to strip wherever they appear: `rounded-xl|2xl|3xl` on surfaces, `backdrop-blur`, `shadow-xl|2xl`, `text-[9px|10px|11px|11.5px|13.5px]`, `bg-purple|indigo|rose|sky|emerald-*` wells, `scale` hover on nav, looping pulses.

---

### 14.1 Shell, tokens, routing

#### `frontend/src/index.css`

| | 360 | 1280 |
|---|---|---|
| Body | 16px / 1.62 Public Sans, carbon-05, carbon-90 | same |
| `--navbar-height` | 56 | 64 (≥640 already 64; keep) |
| `--control-min-size` | 44 | 44 |
| `--panel-radius` | 0 | 0 |
| `--panel-shadow` | none on editorial; map only 0 1px 2px / 6% | same |
| Leaflet container radius | **0** (now 1.25rem — change) | 0 |
| Popup radius | 0; 1px carbon-20; no 24px blur | 0 |
| Popup close | 44×44 | 44×44 |
| Scrollbar | 8×8, square carbon-30 thumb (now 6px pill — change) | same |
| `.hn-nav-link` | N/A (hamburger) | 12px metadata, 2px red current rule. 11px only if 1280 still overflows; never 10px |
| `.hn-h1` | 28 | 32 |
| `.hn-body / p` | 16 / 1.62 (now 1.55 — align to HDS 1.62) | same |
| `.hn-label` | do not shrink labels to 12px on mobile if the control is 16px — label 13–16 | 13 |
| `.hn-badge` | 12 (now 11 — bump) | 12 |
| `.m3-transition` | delete `transition: all` | — |
| `.nasa-glass-panel:hover` | no 25px shadow | none |
| Radar / cluster / cyberPulse loops | remove or gate behind a documented debug flag; reduced-motion already kills them | same |
| z-index tokens | add Section 13.7 custom properties | same |
| `pb-safe-bottom` | only if a real bottom bar exists; otherwise do not pad every page 5rem | n/a |

#### `frontend/src/styles/nasa-hds.css`

Do not edit vendored tokens to fit a component. Consume them.

#### `frontend/src/App.tsx`

| | 360 | 1280 |
|---|---|---|
| Skip link | 12 from top/left, z-a11y, dashed focus, carbon-90 fill, 16px type, 12×16 pad. Drop `rounded-xl` and `shadow-lg` | same |
| Navbar wrap | sticky; z-nav; not a second stacking context at 2000 | console: absolute overlay, **solid** white 95%+ or opaque — no blur |
| `<main>` editorial | flex-1, max-width 1200, gutter 16, pb 16+safe (not 28 unless chat actually overlaps — measure). Delete `pb-28` if chat is 56+16 from edge and content already clears | gutter 32, pb 32 |
| `<main>` console | absolute inset 0, p 0, `h-dvh`, overflow hidden | same |
| Auth | **no App `<main>`** — AuthLayout owns main. App is a passthrough wrapper `div` | same |
| Route motion | opacity 150ms only; **no y: 8**. `mode="wait"` must not delay first paint under reduced-motion (skip AnimatePresence) | same |
| Toaster | top 8px + safe, right 8px + safe, z-toast, white, 1px carbon-20, **no 10px shadow**, radius 0, 16px type | same |
| Empty bottom-nav `<div>` | **delete** | — |
| Footer wrap | `mt-auto`; drop `pb-20` unless measured overlap | `pb-0` |
| RouteFallback spinner | 32×32, 2px carbon-30, **no rounded-full animation** under reduced-motion; use static “Loading page…” text | same |
| `pointer-events-none` on root | keep if children re-enable; verify chat/nav still receive events | same |

#### `frontend/src/main.tsx`

No layout pixels. Ensure viewport meta includes `viewport-fit=cover` and **does not** disable zoom.

---

### 14.2 Navigation chrome

#### `frontend/src/components/Navbar.tsx`

| | 360 | 1280 |
|---|---|---|
| Bar | 56h, 16px side pad, 1px carbon-20 bottom, **opaque white**, radius 0, no blur, no shadow | 64h, 32px side pad |
| Inner z | inherit z-nav; remove `z-[2000]` | same |
| Logo | HazardNetBrand; 20px wordmark | 22px |
| Hamburger | 44×44, 2px radius, 1px carbon-20, carbon-90 icon 24px. **Not** amber well, not rounded-xl | hidden; desktop nav |
| Locate-me | 44×44, nasa-blue fill, white icon. Disabled opacity 0.5 | 44×44 |
| Desktop links | hidden | `.hn-nav-link`, min-height 44, pad 8×12, gap 8. `aria-current="page"` |
| Mega-menu | n/a | 1px carbon-20, radius 0, no blur, no shadow-xl, width 288–320, item 44h, title 16/600, desc 12 carbon-60. Icon wells: carbon-05 + nasa-blue icon — **no purple/rose/indigo/emerald/blue-50** |
| Language / data-saver | 44×44 or labelled 44h | 44h |
| Account | 44×44 | 44h labelled |
| Hover scale | **remove** `whileHover={{ scale: 1.03 }}` | none |

#### `frontend/src/components/MenuDrawer.tsx`

| | 360 | 1280 |
|---|---|---|
| Backdrop | 100dvh, carbon-90/40, z-overlay | unused (desktop uses nav) |
| Panel | 100% width up to 320, left or full-screen documented choice; pad 16; pt 16+safe; pb 16+safe | n/a |
| Close | 44×44, top-right 8+safe | — |
| Items | 44h, 16px type, 12px left icon, 8px gap | — |
| Inert background | `inert` + scroll lock + Escape + focus return | — |
| Radius / blur | 0 / none | — |

#### `frontend/src/components/CommandPalette.tsx`

| | 360 | 1280 |
|---|---|---|
| Dialog | 16px inset, max-height 80dvh, radius 0, 1px carbon-20, no blur | 560 wide, centered, 16 from top of viewport below nav |
| Search input | 48h, 16px font | 44h |
| Result row | 44h, 16 title / 12 meta | same |
| `overscroll-behavior` | contain | contain |

#### `frontend/src/components/HazardNetLogo.tsx`

Wordmark 20/22 as `.hn-topbar-wordmark`. Mark square, no extra radius. Focusable only if it is a link (home).

#### `frontend/src/components/Breadcrumbs.tsx`

12px → 13px ≥640, 500, carbon-60. Hit targets ≥24 with 8px gap. `nav` + `ol`.

#### `frontend/src/components/OfflineBadge.tsx` / `PWAInstallButton.tsx` / `NotificationToggle*.tsx`

Chip: 2px radius, 1px state-hue border, pad 4×8, 12px type, min-height 24, prefer 44 if tappable. No pills.

#### `frontend/src/components/Footer.tsx`

| | 360 | 1280 |
|---|---|---|
| Pad | 32 top, 16 side, 16+safe bottom | 48 top, 32 side |
| Columns | 1 | 4 at 1024, gap 24 |
| Type | 16 body, 12 caption | same |
| Links | underline-offset 4, nasa-blue-shade, 44h if standalone | same |

#### `frontend/src/components/ChatBot.tsx`

| | 360 | 1280 |
|---|---|---|
| FAB | 56×56, radius 0 **or** 2px (not full circle unless icon-only circular is already a11y-labelled), nasa-blue, 16+safe from right/bottom | 56×56, 24 from edges |
| Panel | 100vw − 32, height min(480, 100dvh − nav − safe), radius 0 | 360×480, radius 0 |
| Composer | 48h, 16px font | 44h |
| Do not cover | lookup submit, alert filters, district export | same |

#### `frontend/src/components/ErrorBoundary.tsx`

Full-width editorial card, 24 pad, h1 28, body 16, recovery button 44h nasa-blue.

---

### 14.3 Front door (Read mode)

**Imagery:** none. `RunVisual` remains the hero visual (`PUBLIC_SURFACE` rule 5).

#### `frontend/src/pages/FrontDoor.tsx`

| | 360 | 1280 |
|---|---|---|
| Page | max 1200, vertical rhythm 32 between sections (now `space-y-10` = 40 — step to 32 or 48, not 40) | 48 between major blocks |
| Hero card | 1px carbon-20, white, pad 24, radius 0 | pad 32–48 (`p-10` is 40 — use 32 or 48) |
| Eyebrow | **12px** (now 10), tracking 0.025em, carbon-60 | 12 |
| H1 | 28 / 1.1 / −0.03em, max 72ch | clamp to 48 (`md:text-5xl` is 48 — OK if line-height 1.06) |
| Standfirst | 16 / 1.62, max 65ch (now 16/18) | 18 intro |
| CTA row | wrap, gap 8 | gap 12 |
| Primary CTA `/live` | 44h, pad 12×24, **nasa-red-shade + white**, 16/600, radius 0 | same |
| Secondary `/methodology` | 44h, 2px nasa-blue, nasa-blue-shade text | same |
| Tertiary scorecard | 44h, 1px carbon-20, carbon-80 | same |
| Authority note | 12 / 1.62 carbon-60, 16pt border-t, not 12px grey-on-grey | 12 |
| Grid | 1 col; RunVisual below copy | 2 col `1fr 22rem`, gap 32 |
| LanguageToggle | 44h, top-right of hero | same |
| Trust figures | 1 col, 2px nasa-red top, pad 16, number 32 DM Mono light, label 12/700 | 4 col, gap 1px carbon-20 (keep hairline grid) |
| FAQ summary | 44h min, 16/700 | same |
| Attribution | pad 24, citation 12 mono in carbon-05 well, 2px left carbon-20 | pad 32 |
| Section body | **16px** (now `text-sm` 14 — bump) | 16 |
| Table cells | 12–14, pad 8×12 | 12–14, pad 12×16 |
| List markers | 4×4 nasa-blue, not 5×5 | 4×4 |

#### `frontend/src/components/frontdoor/LiveStatusStrip.tsx`

| | 360 | 1280 |
|---|---|---|
| Pad | 16 | 20 (token 2-5) — or 16/24, not 20 mixed with 16; pick **16 mobile / 24 desktop** |
| Eyebrows | 12 | 12 |
| Counts | 16 mono 700 | 16 |
| Links | 16/700 underline-offset 4, 44h | 16 |
| Zero-case copy | 16 / 1.62 (now 12 — bump; this is safety-critical prose) | 16 |

#### `frontend/src/components/frontdoor/RunVisual.tsx`

| | 360 | 1280 |
|---|---|---|
| Pad | 16 | 24 |
| Coverage bar | 8h (now 8 / `h-2`), carbon-10 track; fill nasa-green or nasa-orange **plus** text value | 8h |
| Artifact rows | 16 type, 8×8 state dot, 8 gap | 16 |
| Honesty | 12 / 1.62 (now 11) | 12 |
| Provenance line | 12 mono | 12 |

#### `frontend/src/components/alerts/LanguageToggle.tsx`

Min 44h. `hds` tone: 2px radius, 1px carbon-20, nasa-blue selected, not amber. 16px labels.

---

### 14.4 Forecast lookup (Operate — reference slice)

#### `frontend/src/pages/UploadPage.tsx`

| | 360 | 1280 |
|---|---|---|
| Landmark | `<section>` or `<header>+<form>+<div>` — **not `<main>`** | same |
| Width | 100% of App main | max 768 inside 1200 |
| H1 | 28 | 32 |
| Task sentence | 16 / 1.62 | 16 |
| Form | column, gap 16 | row wrap, gap 16 |
| Labels | visible, 13–16, `htmlFor` | same |
| Selects | 48h, 16px, radius 2, full width | 44h, min-width 200 |
| Submit | 44h full width, nasa-blue, white, radius 0 | auto width, pad 12×24 |
| Result region | `aria-live="polite"` one region; min-height reserved ~120 to limit CLS | same |
| Deep link | `?district=&horizon=` replace-state, not per keystroke | same |

#### `frontend/src/components/StoredForecastPanel.tsx`

| State | Presentation | Type / space |
|---|---|---|
| Idle | Instruction: choose district and load. **Not** “unavailable” | h2 22, body 16, pad 24, 1px carbon-20 |
| Loading | Skeleton matching ready layout + “Loading stored forecast…” once | skeleton 8h bars, no spinner % |
| Ready | District · as-of date · target · horizon · hazard · scores in DM Mono | dt 12/700 carbon-60; dd 16 mono; gap 8 |
| Uncovered | Named district/horizon has no stored row; nearby actions | same card |
| Error | Offline / 429 / server copy + Retry 44h | alert colour nasa-red-shade text |
| Partial | “Not recorded” per field; no 0.000 fake | same |

No probability bars. Disclaimer 16px, not visually de-emphasized below carbon-60.

#### `frontend/src/lib/storedPrediction.ts` / `frontend/src/hooks/usePrediction.ts`

No pixels. Typed errors, AbortSignal, query keys. Format dates with `Intl` at the view boundary.

#### `frontend/src/components/UploadData.tsx`

If still referenced, align to lookup contract or delete dead UI. Do not restore raster upload.

---

### 14.5 Console and map (Operate)

#### `frontend/src/pages/Dashboard.tsx`

| | 360 | 1280 |
|---|---|---|
| Shell | column; summary first; map in disclosure or toggle | row: map flex-1, panel 360–400 |
| Tabs | 44h, 16 type, nasa-blue selected underline 2px | 44h |
| Overflow | no document x-scroll | same |
| Do not remount Leaflet on selection | — | — |

#### `frontend/src/components/LiveMapView.tsx`

Replace the current 10px / rounded-2xl / blur HUD with HDS chrome.

| | 360 | 1280 |
|---|---|---|
| Frame | 0 radius, 1px carbon-20, min-height 360 (now 500/700 + 28 radius — drop radius; keep min-height ≥360) | min-height 560; fill remaining dvh under 64 nav |
| Toolbar | full width, solid white, pad 8, gap 8, wrap. No `bg-white/90` blur | single row, pad 8 16 |
| Toolbar labels | **12px minimum**, prefer 14 | 12–14 |
| Horizon / layer chips | 44h, pad 8 12, radius 2, 1px border, not rounded-full | 44h |
| Search | 48h, 16px font, radius 2 | 44h, width 240–320 |
| Selected panel | **in flow below map**, not `absolute top-20` covering the map. Open/close buttons 44×44 | right column 320–360, or overlay **max 320** with 16 gutter, never covering attribution |
| Close buttons | 44×44 (now 24×24 / 20×20 — fail) | 44 |
| Legend | labelled, not colour-only; 12 type | 12 |
| Measure / locate / layer | labelled or 44 icon + aria-label | same |
| z | map overlay layer only; no z-20 toasts inside the map — use status region | same |
| Status toasts inside map | replace with `role="status"` bar 16 pad, 16 type, 0 radius | same |
| Attribution | always visible, 12px, contrast 4.5:1 | same |
| Low-bandwidth | do not request optional raster tiles | same |

#### `frontend/src/components/Map.tsx` / `frontend/src/components/map/DistrictForecastCard.tsx` / `MapLegendUI.tsx` / `BangladeshSvgMap.tsx` / `RegionSelector.tsx`

Cards: 0 radius, 16–24 pad, 16 body, 12 meta, 44 links. SVG map: 44px district hit areas or a list equivalent. Legend swatch 12×12 + text. Region selector 48h mobile.

#### `frontend/src/components/NationalOverview.tsx` / `ForecastDashboard.tsx` / `RiskAnalytics.tsx`

Tables: caption, thead carbon-05, cell pad 8×12, DM Mono numbers, contained `overflow-x-auto` **inside** the card (page does not scroll-x). Charts: 12 caption, data table alternative, HDS dataviz colours.

#### `frontend/src/components/WeatherPanel.tsx` / `WeatherBadge.tsx` / `FirebaseRealtimeStatus.tsx`

Badge 12 type, 2px radius. Panel 16 pad. Never “live” without a producer timestamp.

#### `frontend/src/components/ui/expand-map.tsx` / `floating-action-button.tsx`

FAB 56×56, 16+safe, nasa-blue, radius 0/2. Expand control 44×44.

#### `frontend/src/leaflet-transparent.css`

If it forces transparency/blur, replace with opaque HDS popups (0 radius, 1px line).

---

### 14.6 District, alerts, evidence

#### `frontend/src/pages/DistrictDetailPage.tsx`

| | 360 | 1280 |
|---|---|---|
| Order | h1 district → horizon → source/date → outlook → alert → guidance → evidence → charts → export | two-column: summary 1fr, evidence 1fr below fold |
| H1 | 28 | 32 |
| Sticky subnav | 44h items, not covering focus (`scroll-margin-top`) | same |
| Metric tiles | 16 pad, 32–40 DM Mono number, 12 label; **no fake sparkline** | 24 pad |
| Charts | full width, height 220; caption 12; table alternative | height 280 |
| Export / print | 44h nasa-blue | 44h |
| “Compound Vulnerability” | withhold or source-register; do not restyle into credibility | same |

#### `frontend/src/pages/AlertDetailPage.tsx` / `AlertsPage.tsx`

| | 360 | 1280 |
|---|---|---|
| Filters | stack, 48h controls | row, 44h |
| Map+list | list first; map optional 240h | map 320h then list |
| Degraded banner | 16 pad, 16 type, 2px orange edge, **not** 11px in amber-50 rounded-xl | 16 |
| Refresh | 44h | 44h |

#### `frontend/src/components/alerts/*`

| File | Contract |
|---|---|
| `AlertCard.tsx` | 16 pad, 0 radius, 1px carbon-20. Level badge + words. Title 16/700. Meta 12. Link 44h. |
| `AlertLevelBadge.tsx` | min 24h, 12 type, 2px radius, 1px hue border. Colour **and** word. `sm` must not go below 12px. |
| `AlertFilters.tsx` | 44 controls, visible labels. |
| `DataSourceBanner.tsx` | 16 pad, 16 type (safety). 2px orange edge. |
| `Disclaimer.tsx` | 16 / 1.62, carbon-70, never collapsed by default. |
| `DistrictAlertStrip.tsx` | 16 pad, 44 links. |
| `DistrictAlertTable.tsx` | mobile: stacked definition list or cards; desktop: table. Caption. |
| `EvidenceCard.tsx` | 16–24 pad, native `<details>` 44 summary. |
| `PolicyPanel.tsx` | 16 body. |

#### `frontend/src/pages/AdvisoriesPage.tsx` / `StructuredAdvisoryRenderer.tsx` / `AdvisoryPanel.tsx`

16 body, 44 disclosure summaries, print: 12pt Times as existing print CSS. No nested cards.

#### `frontend/src/components/ThirtyDayTrendChart.tsx`

Caption + table alt. Omit missing series. Height 220/280. Do not interpolate a trend.

#### `frontend/src/pages/DivisionsPage.tsx` / `DivisionDetailPage.tsx` / `HazardsPage.tsx` / `HazardDetailPage.tsx`

Editorial grid: 1 col / 2 col ≥880 / 3 col ≥1200, gap 16. Cards 24 pad, 0 radius. Do not restore embargoed composite index.

#### `frontend/src/pages/AnalyticsPage.tsx`

Operate density 5. Filters 44. Charts as above.

---

### 14.7 Auth and account

#### `frontend/src/components/auth/AuthLayout.tsx`

| | 360 | 1280 |
|---|---|---|
| Landmark | this file’s `<main>` is the only one | same |
| Mobile header | 56h, 16 pad, 1px bottom | hidden |
| Accent strip | **remove gradient shimmer** (off-HDS, loops). Optional 2px nasa-red static rule | n/a |
| Card | 0 radius (now rounded-3xl), 1px carbon-20, pad 24, **no shadow-xl**, no 4px red top bar — if an accent edge is needed, 2px left nasa-red on error only | pad 32, max-width 448 (`max-w-md`) |
| H1 | 28 (now 20–24 — bump to page-title role) | 32 |
| Subtitle | 16 (now 12–13) | 16 |
| Back link | 44h | 44h |
| Split | single column | BrandPanel 50% / form 50% |

#### `frontend/src/components/auth/BrandPanel.tsx`

Desktop only. No invented metrics. 32 pad. 16 body. If a still image is used, Section 15 caption rules. Prefer typographic panel (HDS) over photography.

#### `frontend/src/pages/LoginPage.tsx` / `SignUpPage.tsx` / `ForgotPasswordPage.tsx` / `UpdatePasswordPage.tsx` / `SetPasswordPage.tsx`

| | 360 | 1280 |
|---|---|---|
| Inputs | 48h, 16px, radius **2**, pad 12×16. Drop `rounded-2xl` | 44–48h |
| Labels | 13–16, persistent | 13 |
| Password toggle | 44×44 hit (now `p-1.5` ~32) | 44 |
| Submit | 44h, **nasa-red-shade + white** (not `text-carbon-black` on nasa-red), radius 0, 16/600. Drop shadow-md | same |
| Errors | 14 nasa-red-shade, 16 pad, 0 radius, 2px left nasa-red. Drop rose-50 / rounded-2xl | same |
| `autoFocus` | **desktop only** (`pointer: fine`); skip on mobile | allowed on email |
| Social buttons | 44h, 1px carbon-20, 16 type | 44h |
| Links | nasa-blue-shade, not amber-800 | same |

#### `frontend/src/components/auth/AuthSocialButtons.tsx` / `AuthCard.tsx` / `ProviderGlyph.tsx`

44h, 8 gap, 16 type. Glyph 20px. `aria-label` per provider.

#### `frontend/src/pages/AuthCallbackPage.tsx`

Status 16, spinner 32 static under reduced-motion.

#### `frontend/src/pages/UserDashboardPage.tsx` / `UserProfilePage.tsx` / `PublicProfilePage.tsx`

| | 360 | 1280 |
|---|---|---|
| Sections | stack, gap 24 | 2 col ≥1024 |
| Save | 44h nasa-blue; never optimistic “Saved” | same |
| Avatar | 64–96 circle (allowed), 44 replace control | 96 |

#### `frontend/src/components/user/**`

Fields: 48h inputs, 16 errors, 0-radius cards 24 pad. `UsernameField` / `UserAvatarField`: 16 helper text.

#### `frontend/src/pages/dashboard/BlogStudioPage.tsx` / `BlogEditorPage.tsx` / `components/blog/*`

Operate. Editor min font 16. Toolbar 44. Ads (`BlogAdUnit`) reserved height to prevent CLS.

---

### 14.8 Editorial, archive, status, legal, 404

#### `frontend/src/components/ArticlePage.tsx`

Prose: 16 / 1.62, measure 65ch. H2 22. Pad via App main. Tables overflow contained.

#### `frontend/src/pages/About.tsx` / `Documentation.tsx` / `UseCases.tsx` / `Contact.tsx` / `DownloadCenter.tsx`

Same editorial shell. Contact inputs 48/16. Download list 44h rows.

#### `frontend/src/pages/Blogs.tsx` / `BlogArticlePage.tsx`

Card grid 1 / 2 / 3. `.prose-blog` h1 28, body 16 / 1.75. Images: width/height attributes, `loading=lazy` below fold. Radius 0 (now 0.75rem on images — square). Links nasa-blue-shade not `#b45309`.

#### `frontend/src/pages/HazardArchivePage.tsx`

Filters 44. Charts captioned. Distinguish historical observation vs current outlook in 12 metadata.

#### `frontend/src/pages/StatusPage.tsx` / `components/status/FreshnessPanel.tsx`

16 body. Code/paths wrap (`overflow-wrap: anywhere` already). State dots 8×8 + words.

#### `frontend/src/pages/Privacy.tsx` / `Terms.tsx`

App currently **hides navbar** on these routes. Keep or restore nav — do not leave users without a back path; add 44h “Back to HazardNet” if nav stays hidden. Prose 16, measure 65ch.

#### `frontend/src/pages/NotFoundPage.tsx`

H1 28, body 16, two 44h links (home, live).

---

### 14.9 Overlays, print, misc components

| File | Contract |
|---|---|
| `DisasterDetailModal.tsx` / `DisasterDetailModalUI.tsx` | Dialog 16 inset mobile / 640 max desktop, radius 0, pad 24, z-modal, inert backdrop, Escape, focus trap, 44 close. |
| `SavedAssessmentsModal*.tsx` | same |
| `PdfExportConfigModal.tsx` / `PrintPreviewModal.tsx` | same; preview paper A4 210mm; controls 44 |
| `PdfExportButton.tsx` | 44h; print HTML primary |
| `PrintQrCode.tsx` | explicit width/height; 48–96 display |
| `DataProcessingSkeleton.tsx` | Match ready layout; no fake pipeline stages; 150ms opacity |
| `IdentityConnections.tsx` | 44 connect/disconnect |
| `MaterialIcon.tsx` | default 24; decorative `aria-hidden`; interactive parent labelled |
| `ui/animated-state-icons.tsx` | 20–24 icon in 44 hit; no animation under reduced-motion |
| `ui/motion-navigation-menu.tsx` | If unused, do not restyle; if used, 44 items, 0 radius |
| `unlumen-ui/primitives/effects/highlight.tsx` | Do not use on operational data. If used, static colour, no loop |

---

### 14.10 CSS / content / i18n files (no independent layout, but binding)

| File | Pixel / presentation duty |
|---|---|
| `frontend/src/lib/i18n.ts` | Strings long enough for 360 without truncation of safety copy. No unique numbers in BN. |
| `frontend/src/content/site-routes.json` | Same. |
| `frontend/src/hooks/useI18n.ts` | `Intl` dates/numbers. Date-only values as dates, not timezone-shifted timestamps. |
| `frontend/src/hooks/useBandwidthMode.ts` | Turns off blur/tiles; layout must remain readable. |
| `frontend/src/serviceWorker.ts` | No visual; do not cache HTML that would show withdrawn research UI. |

---

## 15. Media policy (Unsplash / Pexels / Remotion)

`PUBLIC_SURFACE.md` §3 rule 5 remains the higher authority.

### Allowed

- **No photograph on `/`.** Keep `RunVisual` as the hero.
- **Optional, non-hero, non-event stills** on `/about` or `/use-cases` only if all of these hold:
  - Licence: Unsplash or Pexels licence, file stored in-repo under `frontend/public/media/` with `ATTRIBUTION.md` (photographer, source URL, licence, date retrieved).
  - Subject: agricultural landscape, extension office, or abstract earth-observation **that cannot be read as a current Bangladesh disaster**.
  - Caption in the UI: “Illustrative photograph, not an observation or a forecast.”
  - `width`/`height` set; `alt` describes the illustration role, not a fake event.
  - Below-fold `loading="lazy"`; above-fold only if it is not LCP-critical (RunVisual/text should remain LCP).
- **Remotion:** only to generate a **silent, data-true** diagram (coverage bar, labelled counts) from committed artifacts, exported as static SVG/PNG for `RunVisual` if CSS is insufficient. Not a cinematic video on the front door. Always `prefers-reduced-motion` still fallback. Do not add Remotion to the production bundle; generate offline and commit the still.

### Forbidden

- Stock floods, cyclones, distressed people, “breaking news” crops.
- AI-generated imagery next to provenance claims.
- Autoplaying video on any Operate surface.
- Undated satellite frames presented as the current outlook.
- Partner logos or testimonials that are not in `attribution.json`.

**Default for implementation:** ship **zero new photographs** unless the owner explicitly opts into an About-page still. Pixel work does not depend on imagery.

---

## 16. Approval gate

This revision is the written spec for the architectural path.

**I am not implementing until you say go-ahead.**

Please confirm or correct:

1. Global pixel system (Section 13) — especially 16px body, 12px metadata floor, 0px surface radius, 44×44 targets, no glass.
2. Per-file contracts (Section 14) — especially lookup as the first slice, map HUD replacement, auth contrast, deletion of empty mobile bottom nav.
3. Media default — no new photos unless you opt in.
4. Then: implement Phase 0 + first batch, or a different starting file list.
)
