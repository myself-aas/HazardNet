# HazardNet frontend UI/UX improvement plan

**Status:** Proposed implementation plan; no UI changes authorized or made by this document.  
**Prepared:** 2026-09-20  
**Mode:** Redesign — preserve, with incremental replacement of unsafe or incoherent patterns.  
**Scope:** Public editorial site, operational console, forecast lookup, district detail, alerts, archive, account surfaces, shared components, accessibility, performance and QA.  
**Baseline:** Current working tree, including the ADR 0009/0014 stored-forecast implementation—not only the original Git commit.  
**Design read:** A Bangladesh agricultural decision-support service for farmers, extension officers, field coordinators and analysts, using a calm, trust-first NASA Horizon Design System language.

## Executive recommendation

Improve the frontend by making it **easier to understand what the data says, where it came from, how old it is, and what the user can do next**. Visual refinement supports that goal; it must not make uncertain data appear more authoritative.

Preserve React 18, TypeScript, Vite, Tailwind v4, React Router, TanStack Query, Leaflet, the existing NASA HDS token pipeline, the public-front-door/console split, and current routes. Do not introduce Next.js, a new design system, a new animation library, or a decorative dashboard aesthetic.

Deliver in this order:

1. Establish reproducible visual, behavioral and performance baselines.
2. Fix forecast-state semantics, provenance and accessibility defects in the new lookup flow.
3. Establish a small, tested set of HDS components and layout rules.
4. Unify navigation and responsive behavior without silently changing URLs or labels.
5. Improve the console/map and district/alert workflows one vertical slice at a time.
6. Refine the front door, archive and account surfaces using the same component contracts.
7. Validate Bengali, offline/slow-network behavior, assistive technology and real device performance.
8. Roll out through preview reviews and explicit release gates, retaining the research embargo.

**Definition of success:** A user can locate their district, distinguish a stored outlook from an official warning, identify its publication/target dates and data limitations, and reach a relevant next action on a small phone without depending on animation, map interaction or sign-in.

---

## 1. How Taste Skill is applied

### 1.1 Pinned upstream material

Reviewed the repository requested by the owner at commit [`e79ca9ec7e071eb3a3b623c4fb752e853fc3ed58`](https://github.com/Leonxlnx/taste-skill/tree/e79ca9ec7e071eb3a3b623c4fb752e853fc3ed58):

- [Core Taste Skill](https://github.com/Leonxlnx/taste-skill/blob/e79ca9ec7e071eb3a3b623c4fb752e853fc3ed58/skills/taste-skill/SKILL.md): brief inference, contextual dials, anti-template discipline, design-system selection and section 11's preservation protocol.
- [Redesign Skill](https://github.com/Leonxlnx/taste-skill/blob/e79ca9ec7e071eb3a3b623c4fb752e853fc3ed58/skills/redesign-skill/SKILL.md): scan → diagnose → targeted changes, typography/layout/state audit and reviewable delivery.
- [Output Skill](https://github.com/Leonxlnx/taste-skill/blob/e79ca9ec7e071eb3a3b623c4fb752e853fc3ed58/skills/output-skill/SKILL.md): complete, explicit deliverables and verification rather than hand-waving.

The core skill explicitly excludes dashboards, data tables and multi-step product UI from its principal scope. Apply it directly to editorial/landing surfaces. For operational surfaces, use the redesign audit and transferable principles, constrained by HazardNet's accessibility, data semantics and existing design rules. Do not portray dashboard recommendations below as literal upstream prescriptions.

### 1.2 Precedence and conflict resolution

Order of authority for this plan:

1. User decisions, data integrity, privacy/security boundaries and research embargo.
2. Accessibility requirements and task completion on low-end hardware.
3. `DESIGN.md`, `docs/design-system/MASTER.md`, `docs/PUBLIC_SURFACE.md`, ADRs 0009/0012/0014.
4. Existing functional/SEO contracts and verified behavior.
5. Contextually applicable Taste Skill guidance.

| Upstream suggestion | HazardNet adaptation |
|---|---|
| Read the brief; audit before changing | Adopt fully; capture source and rendered evidence before choosing treatments. |
| Preserve brand, routes and working interactions | Adopt fully. No route renames or navigation-label overhaul without approval and migration mapping. |
| Replace generic Inter typography | Retain Inter headings, Public Sans body and DM Mono numerals because the project explicitly chose HDS. Improve role assignment, scale and spacing instead. |
| One coherent design system | Retain HDS semantic styling; inventory MUI/Base UI/custom components before consolidation. Do not add Carbon, Fluent, Radix Themes or another competing visual language. |
| One accent color | Preserve HDS's semantic red/blue/orange/green roles and distinct data-visualization palette. Do not flatten safety/status meanings into one fashionable accent. |
| Add texture, imagery, glass or cinematic motion | Do not apply to operational screens. No stock flood imagery suggesting a current event; no glass-dependent contrast or decorative GPU effects. |
| Introduce organic statistics or randomized dates | Reject. All production figures, dates and outcomes must come from identified records; unknown is a valid state. |
| Font swap before other changes | Override priority: trust, state correctness and task accessibility precede visual polish. |
| Replace icons for differentiation | Standardize existing MaterialIcon/Lucide usage by role and size first. A new icon package needs a concrete accessibility/performance case. |
| Hero creativity and asymmetry | Use restrained editorial hierarchy on `/`, not irregular console controls or unpredictable evidence-card ordering. |

### 1.3 Contextual dials

These are proposed design constraints, not measurements of the existing rendered UI.

| Surface | DESIGN_VARIANCE | MOTION_INTENSITY | VISUAL_DENSITY | Intent |
|---|---:|---:|---:|---|
| Public front door and methodology | 3 | 2 | 4 | Editorial hierarchy; verified evidence; calm navigation. |
| Console and district detail | 2 | 1 | 6 desktop / 4 mobile | Predictable controls; detail through disclosure, not tiny type. |
| Alerts and evidence cards | 2 | 1 | 5 | Status, date, district and official guidance first. |
| Forms, authentication, lookup | 2 | 1 | 3 | One clear task and unambiguous validation. |
| Offline / reduced-motion / low-bandwidth | Same task structure | 0 decorative | Same essential information | Remove optional effects/resources, not provenance or safety context. |

### 1.4 Non-goals

- No new trained-model inference in the browser or request path.
- No restoration of raster-upload simulation, fake probabilities, synthetic latency or hidden research scores.
- No automatic alert publication or changes to review authorization.
- No changes to conversion endpoint authentication; the owner explicitly declined that proposal.
- No wholesale framework rewrite, route-slug replacement or monolithic visual refactor.
- No claim that a screenshot audit proves WCAG conformance or field usability.

---

## 2. Evidence-backed current-state assessment

This planning turn performed a **source/document/configuration review**, not a fresh browser or user-study audit. The findings below identify concrete implementation patterns; their rendered severity must be checked in Phase 0. Historical reports and the prior test run are context, not new measurements.

### 2.1 Existing strengths to preserve

| Asset | Evidence | Preserve because |
|---|---|---|
| Vendored HDS tokens and semantic mapping | `data/design/nasa-hds/tokens.json`, `frontend/src/styles/nasa-hds.css`, `frontend/src/index.css` | A coherent foundation already exists; replacement would create avoidable churn. |
| Editorial `/` separate from `/live` console | `FrontDoor.tsx`, `App.tsx`, `docs/frontend/front-door-and-console-split.md` | Different audiences have different first questions; one giant map landing would obscure them. |
| Stored-forecast HTTP contract and honest missing values | `frontend/src/lib/storedPrediction.ts`, `StoredForecastPanel.tsx`, `backend/utils/predictFromStore.js` | New visual work must not undo ADR 0009/0014. |
| Language and low-bandwidth foundations | `hooks/useI18n.ts`, `lib/i18n.ts`, `hooks/useBandwidthMode.ts`, `lib/bandwidth.ts` | Reuse instead of introducing competing global state systems. |
| Alert components, source labels and evidence workflows | `components/alerts/`, `hooks/useAlertsData.ts`, `docs/frontend/ALERT_UI.md` | Expand existing wins rather than replacing them with generic notification cards. |
| Layered quality checks | `scripts/check-design-quality.mjs`, `scripts/qa/`, Jest tests, Playwright configs | Extend existing verification; do not equate a new tool with improved quality. |
| Static content/prerender contract | `frontend/src/content/`, `frontend/scripts/prerender.mjs` | No-JS readers, crawlers and React users should receive consistent copy. |

### 2.2 Prioritized findings

| ID | Priority | Source observation | User risk / investigation | Planned resolution |
|---|---|---|---|---|
| UX-01 | P0 | `StoredForecastPanel` maps `null` directly to “unavailable”; `UploadPage` starts with `null` and renders the panel while loading | Initial, loading, uncovered and failed requests look alike | Explicit discriminated state model and separate presentations. |
| UX-02 | P0 | `fetchStoredPrediction` collapses non-OK HTTP responses into one message | 404 coverage gap, throttling, offline failure and server error have no distinct recovery | Typed errors, retry policy, honest source/freshness model. |
| UX-03 | P0 | `App.tsx` owns `<main>`; `UploadPage.tsx` also renders `<main>` | Nested main landmarks can confuse landmark navigation | One app-level main; page renders section/header/form. Add semantic regression test. |
| UX-04 | P1 | New lookup/panel copy uses literal English strings and raw date/number formatting | Bengali users have an incomplete core flow | Reuse `useI18n`; extend dictionaries and locale tests. |
| UX-05 | P1 | `LiveMapView.tsx` contains 10–11px labels, large radii, shadows, ad hoc colors and high z-index values | Hard-to-read controls and inconsistent hierarchy are plausible; check computed styles, hitboxes and overlays | HDS primitives, responsive control layout and documented stacking scale. |
| UX-06 | P1 | `Dashboard.tsx`, `LiveMapView.tsx`, `DistrictDetailPage.tsx` combine extensive rendering, data and control logic | Repeated panels and broad state dependencies make interaction changes risky | Feature-sized extractions with behavior tests, not arbitrary file splitting. |
| UX-07 | P1 | `App.tsx` animates route transitions; components also use local Motion effects | Reduced-motion behavior and stacked delays need cross-route verification | Central motion policy; no waiting for animation before essential content/focus. |
| UX-08 | P1 | HDS master describes dark mode as future work; `DESIGN.md` and CSS/static-shell work discuss dark treatments | Support status and actual contrast may differ by route | Create a support matrix; test emitted modes; do not add a new theme switch yet. |
| UX-09 | P1 | Default Playwright `testMatch` selects only `full-app-qa.spec.ts` | Newly added specs may never run under the default command | Explicit config/project changes with a `--list` coverage check. |
| UX-10 | P1 | Accessiblity document limits prior audit coverage and notes rasterized PDF exports | “Accessible” could be overstated outside the alert subset; PDFs may not expose selectable/readable text | Browser/AT review and print-HTML alternative; separately scope tagged-PDF work. |
| UX-11 | P1 | District/map code still contains “Compound Vulnerability” / “Vulnerability Index” presentations separate from the removed division formula | Other numeric displays require provenance inspection; not enough evidence to classify all as embargoed | Create a value-source register; withhold unsupported/embargoed outputs, not cosmetic relabelling. |
| UX-12 | P2 | Navigation is implemented across `Navbar`, `MenuDrawer`, `CommandPalette` and route config | Labels, availability and destinations can drift | Shared navigation data and parity tests; retain approved labels/routes. |

**Important:** A class name alone does not prove a rendered defect. HDS overrides can change computed radius/color. Every visual ticket needs a browser screenshot plus computed-style or interaction evidence before its priority is finalized.

### 2.3 Known verification baseline

The preceding implementation recorded 98 Jest suites / 1,074 passing tests, a passing build/typecheck, and ESLint with 0 errors / 311 warnings. This is a regression reference, not proof that UX is good or that the planning turn reran those checks. Current CWV field values, task-completion rates and assistive-technology results are **not measured here**.

---

## 3. User journeys and information hierarchy

Treat the following personas as task hypotheses to validate—not completed user research.

| Journey | Entry | Essential questions | Completion condition |
|---|---|---|---|
| Farmer or field officer checks a district | Shared district link, lookup, map | Which district/horizon? Published when? What is the outlook? Is this an official warning? | Reads a dated outlook or clear no-coverage state; can open official guidance. |
| Coordinator reviews published alerts | `/alerts` → detail | Is it published? What evidence supports it? What area/time applies? | Finds relevant published evidence and printable guidance without crossing into review/admin UI. |
| Analyst compares locations | Console/compare | Are the periods, source types and coverage comparable? | Compares like-for-like values with missing data visible. |
| Journalist/reviewer checks credibility | `/` → methodology/status/archive | Who produced this? How fresh is it? Where are the limits? | Reaches dated sources and limitations without learning console controls. |
| Returning user checks saved districts | User dashboard / saved district view | Is data current? Which saved area changed? | Opens a district while preserving identity/session and privacy. |
| Offline user returns to cached data | Installed app / visited route | What is cached? How old? What is unavailable? | Reads clearly dated cached content, never a false “live” or “all clear” message. |

### Proposed hierarchy for a district result

1. District and horizon.
2. Stored outlook + publication/target dates + coverage/source status.
3. Dominant hazard and severity, with correct score semantics.
4. Relevant published alert, if one exists, clearly distinguished from the forecast.
5. Official guidance and existing advisory actions.
6. Optional evidence: model version, independent physics track, missing fields, export.

The UI must keep these concepts separate:

- **Hazard category** is not **alert level**.
- **Stored row** is not necessarily **fresh cloud data**.
- **Prediction date** is not **page load time**.
- **Top-class score** is not automatically a calibrated event probability.
- **No published alert** is not **no risk**.
- **Missing forecast** is not **zero severity**.

### Layout sketches (proposed, not a finished mockup)

```text
Desktop console
┌ Existing brand/navigation ───────── Language · Data saver · Account ┐
│ District search   Horizon controls    Source/date status             │
├──────────────────────────────────────┬──────────────────────────────┤
│                                      │ Selected district            │
│ Map or equivalent table              │ Stored outlook and dates     │
│ Clear legend; accessible controls    │ Published alert, if any       │
│                                      │ Guidance / evidence disclosure│
├──────────────────────────────────────┴──────────────────────────────┤
│ Coverage notes / source limitations / official guidance links        │
└────────────────────────────────────────────────────────────────────┘

Mobile console — ordered for task completion, not a shrunken desktop
Navigation → district + horizon → source/date → summary → guidance
→ optional map/table toggle → evidence disclosure → export

Lookup
Page title + one-sentence task explanation
District [labelled selection]  Horizon [7 / 15 days]
[Load stored forecast]
State-specific result region: idle | pending | result | no coverage | error
```

Do not pin critical controls over content until safe-area, keyboard and focus-obscuration tests pass. Do not make the map the only route to district data.

---

## 4. Technical architecture for the improvements

### 4.1 Keep the current stack; consolidate before adding

- Continue Vite/Tailwind v4; do not apply Next.js/RSC-specific skill snippets to this SPA.
- Keep `framer-motion` imports working; a package-name migration is not a UI requirement.
- Inventory actual imports from MUI, Base UI and custom UI modules. Choose an existing accessible primitive where possible; do not assume declared dependencies are heavily used.
- For each primitive, record keyboard behavior, focus management, form semantics, portal behavior and style ownership. Replace one instance family at a time.
- Use CSS modules or existing semantic CSS/Tailwind conventions consistently within a component; introduce no second global reset.

### 4.2 Proposed module boundaries

Names below are new files/directories to create during implementation, not claims they already exist.

```text
frontend/src/
  components/ui/              HDS-styled primitives with semantic HTML
  components/layout/          page header, content width, section spacing, shell
  features/forecast/          query adapter, state model, result/evidence UI
  features/map/               extracted toolbar, legend, viewport panel, table bridge
  features/district/          district summary and evidence sections
  lib/navigation.ts          route metadata consumed by existing navigation surfaces
```

Do not move existing modules merely to satisfy this tree. Start with the forecast vertical slice; preserve compatibility exports until consumers are migrated. Avoid a generic “universal dashboard” component with dozens of boolean props.

### 4.3 Forecast state contract

Proposed presentation contract:

```ts
type ForecastViewState =
  | { kind: 'idle' }
  | { kind: 'loading'; selection: Selection }
  | { kind: 'ready'; selection: Selection; data: ForecastViewModel; refreshing: boolean }
  | { kind: 'uncovered'; selection: Selection }
  | { kind: 'error'; selection: Selection; reason: 'offline' | 'rate-limited' | 'server' | 'invalid-data' };

type Selection = { districtId: string; horizon: '7_days' | '15_days' };
```

`ForecastViewModel` must include producer dates, hazard, score semantics and explicit nullable evidence. Treat **source** and **freshness** as separate axes, not a single “live” boolean. Proposed values include `firestore | committed-snapshot | offline-cache | unknown`; never infer them from HTTP 200.

**Backend dependency:** `/api/predict` currently says `served_from: stored-forecast`; this does not distinguish cloud from server snapshot. Until the API/store returns reliable source metadata, display “Stored forecast” and the row's dates, not “Live Firestore.” A narrow additive API change may be proposed separately; it must not silently fabricate source identity or change durable-write semantics.

Implementation rules:

1. Extend the fetch helper to accept `AbortSignal` and preserve HTTP error categories.
2. Use TanStack Query for cache/retry/deduplication; key by district/horizon, not by translated label.
3. Keep locale out of the data key unless the server actually returns localized data; format at the presentation boundary.
4. Abort obsolete requests and prevent out-of-order responses from changing the current district.
5. For a different selection, never show the previous district's result under the new heading. Same-selection background refresh may retain the prior result with its original timestamp.
6. Do not retry invalid input or 404; bound transient retries, respect 429 backoff, and provide a user-visible retry action.
7. Distinguish idle instructions from no coverage and failed retrieval. Use one polite status region; avoid repeated announcements on every render.
8. Parse/validate URLs and payloads at boundaries. Keep route identifiers stable; put display labels through localization.

### 4.4 Shared component contracts

| Component proposed | Required behavior | Non-negotiable tests |
|---|---|---|
| `ActionButton` / `NavigationLink` | Distinguish in-page action from navigation; HDS colors; busy and disabled semantics | Keyboard activation, focus indicator, contrast, no nested interactive elements. |
| `Field`, `SelectField`, `ErrorSummary` | Persistent label, hint/error IDs, form association, focusable error summary | Label relationship, error announcement, autofill and form behavior retained. |
| `SourceStatus` / `FreshnessLabel` | Source and timestamp separately; missing data explicit | Snapshot/offline/unknown states; date boundaries; no time-of-render substitution. |
| `ForecastSummary` | Hazard, severity, dates; no invented probability bars | Nullable fields, unknown confidence-kind handling, no fake zero. |
| `EvidenceDisclosure` | Native details or tested disclosure primitive; concise default view | Keyboard operation; open-state persistence only where useful; no hidden safety disclaimer. |
| `DataState` family | Idle, skeleton, uncovered, error and loaded states | Stable layout; no indefinite skeleton; retry and fallback semantics. |
| `MapToolbar` / `MapLegend` | Labels, pressed states and non-map equivalent controls | Touch targets, focus, zoom independence, legend meaning without color. |
| `ResponsiveDataTable` | Semantic headers/caption; contained overflow | Screen-reader association; keyboard scrolling; page itself does not overflow. |

---

## 5. Phased implementation playbook

Each phase finishes with evidence and an independently reviewable patch. Do not begin broad migration before the first reference slice is approved.

### Phase 0 — Baseline, inventory and task validation

**Owner:** Frontend lead + designer/QA. **Dependency:** None. **Estimate:** 3–4 person-days.

1. Record current branch/commit and working-tree patch identity, dependency versions, build mode, route list and environment assumptions.
2. Inventory routes from `App.tsx` and content route manifests; group by editorial, console, evidence, auth and user-only surfaces.
3. Capture rendered baseline screens at 360, 390, 768, 1280 and 1440px widths. Include light/system-dark output, English/Bengali and at least one 200% zoom pass.
4. Review computed styles for font, radius, contrast, overflow and z-index; distinguish source drift from rendered drift.
5. Record all data-bearing widgets: source file, input fields, transformation, unit, date, uncertainty, fallback and whether the value is actually measured.
6. Build a scenario matrix: success, delayed response, 404 coverage gap, 429, 500, malformed data, missing evidence, cached/offline and expired auth.
7. Walk six key tasks with internal reviewers before recruiting representative users; capture confusion and wrong interpretations, not just clicks.
8. Create a prioritized issue register with one reproducible finding per ticket; separate defects, design debt and unverified hypotheses.

**Files/tools:** `App.tsx`, `site-routes.json`, existing QA scripts, `docs/reviews/`, Playwright configs. Store images/traces outside Git by default; commit compact summaries and artifact links.

**Deliverables:** Route matrix, source-to-value register, baseline screenshot manifest, task scripts, issue register, design exception register.

**Exit gate:** Every P0/P1 issue has evidence, an owner, an affected journey and a test strategy. No redesign mockup implies a nonexistent forecast or alert.

### Phase 1 — Correct the forecast lookup experience

**Owner:** Frontend engineer; backend consultation only for provenance gaps. **Dependency:** Phase 0 core routes. **Estimate:** 4–6 person-days.

1. Introduce typed result/error/state models in the forecast feature boundary.
2. Refactor `storedPrediction.ts` and `usePrediction.ts` around cancellation, query keys, bounded retries and payload validation.
3. Refactor `StoredForecastPanel.tsx` into state-aware summary/evidence components; avoid raw `null` as the whole UI state API.
4. Remove nested `<main>` from `UploadPage.tsx`; maintain a page `<h1>`, labelled form and a stable result region.
5. Add district/horizon selection deep-link parameters without changing `/upload`. Preserve unknown parameters only where safe; avoid pushing browser history on every keystroke.
6. Replace raw dates and `.toFixed()`-only displays with localized formatting and accessible full-date text.
7. Treat missing model version and uncalibrated confidence as compact evidence notes, not high-severity error banners.
8. Integrate the same summary contract into dashboard panels; eliminate redundant fetch/state pathways only after behavior parity tests.
9. Audit any advisory action so it uses the selected stored row and does not claim official authority.

**Acceptance:** Initial page says how to begin, not “unavailable”; pending state announces loading once; 404 says no stored coverage; server/offline errors offer appropriate recovery; changing district rapidly cannot display another district's forecast; dates and unknowns remain visible in both languages.

### Phase 2 — HDS foundation and reference components

**Owner:** Designer + frontend engineer. **Dependency:** Phase 0; can overlap Phase 1. **Estimate:** 5–7 person-days.

1. Audit and reconcile `DESIGN.md`, HDS master, generated token file and actual semantic CSS. Do not edit vendored tokens to accommodate a single component.
2. Define component-level contracts for backgrounds, text, borders, action colors, status colors and dataviz colors. Keep alert/hazard/source meanings distinct.
3. Standardize typography roles: HDS heading/body/mono families, readable paragraph measure, tabular numbers, sensible line height and sentence-case controls.
4. Keep at least 16px form input text where needed to prevent mobile zoom; set a proposed default 14px minimum for routine operational labels and 12px only for secondary metadata after review. Do not shrink Bengali to fit English layouts.
5. Define semantic stacking layers for base content, sticky controls, map overlays, popovers, dialogs and notifications; map Leaflet panes to the policy rather than overriding everything with `9999`.
6. Build the minimum primitives listed in section 4.4, including loading/empty/error states and reduced-motion variants.
7. Use the lookup flow as a reference composition. Approve mobile, desktop, English/Bengali and emitted color modes before applying it across the app.
8. Extend token/contrast tests and the design-quality gate incrementally; do not regenerate the baseline merely to hide findings.

**Acceptance:** Reference slice uses named semantic roles; no unexplained bespoke hex/radius/shadow values; visible keyboard focus; normal text contrast at least 4.5:1 and large text/non-text controls at least 3:1 where required; metadata is readable at zoom.

### Phase 3 — Navigation, shell and route transitions

**Owner:** Frontend engineer + designer. **Dependency:** Phase 2 primitives. **Estimate:** 4–5 person-days.

1. Inventory destinations and existing analytics identifiers across `Navbar.tsx`, `MenuDrawer.tsx`, `CommandPalette.tsx` and route metadata.
2. Extract shared navigation data without changing the approved primary labels or URLs. Mark external destinations and role-gated entries explicitly.
3. Implement a consistent active-route treatment using `aria-current`; ensure related aliases do not mark multiple top-level choices as active.
4. Make mobile menus and command search keyboard-complete: trigger relationship, escape, focus return, inert background when modal, correct scroll locking.
5. Establish one page-width and padding policy per page family. Do not apply an editorial `max-width` to the full console map shell.
6. Add predictable route-change focus/announcement handling. Preserve focus during filter changes; move focus deliberately after actual navigation.
7. Respect reduced motion centrally. Remove route-exit waiting that delays essential content; use no spring/bounce on the operations surface.
8. Confirm safe-area and virtual-keyboard behavior at small heights and landscape orientation.

**Acceptance:** Same destinations across navigation surfaces; complete keyboard journey; no nested main landmarks; no hidden focus; no route/SEO/analytics contract drift.

### Phase 4 — Console and map interaction redesign

**Owner:** Frontend/map engineer + designer. **Dependency:** Phases 1–3. **Estimate:** 7–10 person-days.

1. Map state ownership in `Dashboard.tsx`, `LiveMapView.tsx`, `Map.tsx`, `useLeafletMap.ts` and selection hooks before extraction.
2. Extract toolbar, legend, layer controls and selected-district summary while preserving the Leaflet instance lifecycle. Avoid remounting the map on ordinary selection changes.
3. Establish one source of truth for district/horizon/filter selection. URL represents shareable view state; transient hover/drag state stays local to the map.
4. Put district search and horizon selection before secondary overlays. Group advanced layers into a named disclosure/panel rather than many equally weighted floating buttons.
5. Replace tiny map text and densely packed icon actions with labelled controls. Use hit areas, not just larger icons; retain access to the map attribution.
6. On mobile, use an ordered summary-first layout or a tested non-obscuring panel; do not build a drag-only bottom sheet. Supply open/close buttons and a keyboard path.
7. Connect map selection to a semantic table/list with the same filtered dataset, selected state, keyboard navigation and district links.
8. Make low-bandwidth mode avoid initiating optional tile requests, not simply hide already-fetched tiles. Keep SVG/text alternatives and data-source labels.
9. Verify map panning/zooming, layers, measurement tools and existing exports after each extraction. Profile actual event handlers before memoizing broadly.
10. Classify remaining derived map metrics through the value-source register. Do not replace a suspicious label with a more credible one while leaving unsupported arithmetic underneath.

**Acceptance:** Core district task works without a map; no document-level horizontal overflow; no controls hidden behind panels/keyboards; text and color both identify hazard/selection; no research-derived ranking is restored; optional tiles are absent from low-bandwidth network traces.

### Phase 5 — District, alerts and evidence hierarchy

**Owner:** Frontend engineer + domain reviewer. **Dependency:** Shared forecast components and map selection contract. **Estimate:** 5–7 person-days.

1. Recompose `DistrictDetailPage.tsx` around the hierarchy in section 3; move methodology detail below the decision summary without hiding uncertainty.
2. Extract route data access, summary, published-alert section, evidence, charts and export controls into bounded modules.
3. Align district alert presentation with `AlertsPage.tsx`, `AlertDetailPage.tsx` and existing alert components. Preserve human-review rules and public/private distinctions.
4. Distinguish alert publication status, alert level, forecast hazard and freshness in separate labelled fields.
5. Standardize no-alert, no-coverage, unpublished/held-count summary and failed-fetch messages. Public UI must never expose private review notes to make an empty page look fuller.
6. Require a source/date/unit caption and accessible data alternative for every chart. Use categorical HDS colors for categories and sequential ramps only for ordered quantities.
7. Omit unavailable series rather than interpolating a “trend.” Audit existing trend/compound metrics before retaining them.
8. Improve print CSS with source dates, repeating table headers, readable URLs and official disclaimer. Offer print HTML as the accessible primary path when raster PDF cannot meet reading-order/selectable-text requirements.

**Acceptance:** Reviewer can explain each number's source; missing series are explicit; keyboard and screen-reader users reach the same evidence; printed output retains district/horizon/date/disclaimer; no promise of PDF/UA until separately verified.

### Phase 6 — Front door, archive, editorial and account polish

**Owner:** Designer + frontend engineer. **Dependency:** Phases 2–3; domain components reusable. **Estimate:** 6–8 person-days.

1. Refine `/` through typography, editorial measure, spacing and asymmetric-but-calm composition; retain the front-door/console split and verified run/status visual.
2. Keep static and React copy sourced from the same content records. Review heading levels and title/description/canonical/structured-data parity after layout changes.
3. Present two clear public tasks using existing destinations: understand current coverage/status and inspect a district. Do not duplicate the full map on `/`.
4. Reuse summary/evidence styles on archive, hazard, division and documentation pages. Distinguish historical observations from current outlooks.
5. Audit archive filters and chart legends for keyboard/touch use, empty results, reset state, data period and source attribution.
6. Refine auth and account forms with persistent labels, field hints, inline errors, password visibility and correct autocomplete. Keep provider redirects, field names and auth behavior intact.
7. Ensure saved district/profile settings clearly separate save success, pending save and failure. Never use optimistic “saved” copy when durable persistence is unknown.
8. Keep institutional/legal copy and consent behavior unchanged unless explicitly reviewed. No invented testimonials, partner logos, dates or usage counters.

**Acceptance:** No-JS public content remains meaningful; established route slugs/canonical links preserved; no metric or image implies an unverified event; authentication and profile privacy regressions absent.

### Phase 7 — Localization, accessibility and performance hardening

**Owner:** Frontend/QA + Bengali/domain reviewer. **Dependency:** Every migrated surface. **Estimate:** 5–7 person-days, partially parallel.

1. Extend existing dictionaries; audit visible text, ARIA labels, errors, captions, print text and empty states—not just headings.
2. Test Bengali glyph coverage and shaping in the deployed font stack. If a new Bengali font is necessary, self-host a licensed subset after confirming script coverage; do not replace the HDS Latin families arbitrarily.
3. Use `Intl` formatting with explicit locale and time-zone policy. Treat date-only producer values as dates, not timestamps that may shift a day across zones.
4. Manually verify keyboard, NVDA or VoiceOver desktop flow, and TalkBack on Android; include map alternatives, dialogs, forms, route transitions and evidence disclosures.
5. Test 200%/400% zoom, text expansion, forced colors where feasible, reduced motion and both supported color schemes.
6. Profile production builds. Lazy-load maps, chart-heavy screens and PDF tooling; avoid page-level imports that force all consumers to download them.
7. Measure network requests and long tasks on constrained profiles and a representative low-end Android device. Eliminate unnecessary work before adding memoization or virtualization.
8. Virtualize only measured large collections; 64 district rows do not automatically justify the accessibility and focus complexity of virtualization.
9. Inspect service-worker upgrades, cache separation and no-store/private responses. Test cold offline, warm offline and reconnect paths independently.

**Acceptance:** All essential journeys work in English/Bengali, keyboard and text-only alternatives; no critical data hidden in low-bandwidth mode; performance budgets and accessibility gates below are satisfied or explicitly release-blocked.

### Phase 8 — Controlled rollout and post-release review

**Owner:** Frontend lead + QA/domain reviewer. **Dependency:** Release gates passed. **Estimate:** 2–3 person-days plus observation.

1. Ship reference slice first, then route families in separate PRs. Never roll back the stored-only inference or research-withholding decisions to recover an old visual layout.
2. Review preview screenshots, keyboard videos, network evidence and fixture scenarios per PR.
3. If temporary route-level flags are needed, define their owner, default, expiration and removal PR. Do not create competing long-lived design systems.
4. Exercise production-like static/Vercel and Express paths; confirm relative API URLs and preview-origin behavior.
5. Verify redirects, canonical links, analytics identifiers and service-worker asset replacement.
6. Review errors and support feedback after launch. Schedule 24-hour and 7-day checks as proposed operational checkpoints, not assumed monitoring infrastructure.
7. Archive before/after evidence and publish a concise implementation report distinguishing measured improvements from subjective review.

**Acceptance:** Clear rollback boundary; no data/auth/embargo regression; outstanding nonblocking issues have owners and deadlines; no open P0/P1 trust or accessibility defect on released core journeys.

---

## 6. State, accessibility and responsive specifications

### 6.1 Minimum state matrix for each data surface

| State | Required presentation | Forbidden behavior |
|---|---|---|
| Idle | Instruction and next action; no result claim | “Unavailable” before a request has occurred. |
| Initial loading | Stable skeleton matching layout, brief status text | Fake progress %, simulated model stages, repeated screen-reader announcements. |
| Ready / fresh | District/horizon, producer date, source classification if known | “Live” inferred from a successful HTTP response. |
| Ready / stale | Retain dates and show stale explanation + recovery action | Resetting the date to now; declaring all-clear from old data. |
| Background refresh | Prior same-selection result, original timestamp, quiet progress | Moving focus or swapping to a different district without explanation. |
| No coverage | Explicit missing unit/horizon and nearby valid actions | Filling with a static risk value as though it were a forecast. |
| Error / offline | Distinguish error type; dated cache only if available | Silent static substitution; retry loop that consumes a data bundle. |
| Partial evidence | Available summary; specific fields marked “not recorded” | Zero-filled probability bars or invented drivers. |
| Unauthenticated / denied | Appropriate sign-in/access explanation | Disguising authorization failure as “no records.” |

### 6.2 Accessibility standards and checks

- Target WCAG 2.2 AA for essential journeys. This is a goal requiring manual verification, not a certification claim.
- Minimum target-size requirement: 24×24 CSS px or qualifying spacing/exceptions under WCAG 2.2; prefer 44×44 for primary mobile controls. Document exceptions rather than treating every inline text link as a failed button.
- Normal text 4.5:1; large text 3:1; focus/control boundaries 3:1 where applicable. Test computed colors, not utility names alone.
- Never rely on color, animation, spatial position, hover or drag alone.
- Maintain exactly one active main landmark in the app shell; page sections need meaningful headings, not redundant landmarks.
- Ensure focus is visible and not obscured by sticky controls, dialogs or mobile panels.
- Tables need captions, column/row associations and an accessible contained-scroll region where necessary.
- Charts need summary text and an equivalent data view; tooltips alone are insufficient.
- Preserve user zoom; use `dvh`/safe-area variables where appropriate, but do not apply viewport-height locks to long forms or evidence pages.

### 6.3 Responsive behavior by capability

- At narrow widths, task order precedes visual symmetry. Collapse side-by-side evidence below the summary, not into unreadable mini-columns.
- At 768px-class tablets, verify both orientations and split-screen—not only a single breakpoint screenshot.
- At wide desktop widths, use constrained reading measure for prose and more space for data only when it improves comparison.
- With on-screen keyboard, selected input, submit and error text must remain reachable without trapped scrolling.
- Use pointer/hover media queries for optional hover affordances; every action must remain discoverable on touch.
- Test the existing HDS breakpoint values alongside common device widths; avoid introducing a second arbitrary breakpoint scale.

---

## 7. Performance and instrumentation plan

All values below are **proposed acceptance targets**, not current measurements. Confirm or adjust them after Phase 0 with a documented rationale; never weaken data-integrity or access-control requirements to meet a speed target.

| Metric | Proposed target / rule | Measurement |
|---|---|---|
| Field Core Web Vitals | p75 LCP ≤2.5s, INP ≤200ms, CLS ≤0.1, segmented by page family/device where traffic allows | Privacy-reviewed field measurement; lab proxies reported separately. |
| Loading feedback | Visible state response within 100ms of an explicit action on the target device | Browser performance trace; excludes network completion. |
| Layout stability | Skeleton-to-result does not move focused controls; CLS target above | Repeat scripted scenarios with delayed responses and long Bengali labels. |
| Route transfer | No baseline regression >10% without approval; establish route-specific budgets after measuring | Production asset/network report; initial route separate from total bundle and map tiles. |
| Existing total bundle gates | Preserve current `scripts/check-bundle.mjs` limits: 800 KiB max gzip chunk / 1,600 KiB total gzip JS | Existing gate plus per-route attribution; a total pass does not prove acceptable mobile load. |
| Low-bandwidth mode | Zero optional raster-tile requests before explicit opt-in; no decorative infinite animation | Request assertions and trace. |
| Task success | Proposed ≥90% completion for district lookup in moderated evaluation | Report participant count and task definition; small studies are directional, not population statistics. |
| Data comprehension | Every evaluated core screen lets reviewers distinguish stored forecast, date and official warning status | Structured questions and failure notes; zero unresolved safety-critical ambiguity in release review. |

Instrument only if existing consent/privacy policy permits. Prefer coarse events such as `forecast_lookup_started`, `forecast_lookup_result_state` and `map_table_mode_changed`, using fixed enumerations. These are **proposed event names**, not replacements for existing analytics contracts. Do not send coordinates, names, email, free-text prompts, auth tokens, complete forecast payloads or error bodies. Do not repurpose the unchanged public conversion-debug endpoint for UX telemetry.

---

## 8. Verification implementation and commands

### 8.1 Build deterministic UI fixtures

- Add fixtures for a valid stored row, missing fields, uncovered district, stale snapshot, explicit unknown source, held/unpublished alert counts, 429 and offline response.
- Label test data as fixtures; never publish it as observed operational data.
- Freeze the test clock and locale, stub external APIs/tiles as appropriate, wait for local fonts and disable optional animation for screenshots.
- Keep separate “real integration” probes; a route-intercepted screenshot is not proof of cloud integration.
- Cover both languages, reduced motion, narrow/desktop viewports and representative long labels. Test pairwise combinations broadly and the full failure-state matrix on core journeys.

### 8.2 New test work (proposed)

| Layer | Add/extend | Assertions |
|---|---|---|
| Unit | Forecast state reducer/view-model tests | No synthetic data; source and freshness independent; invalid input rejected. |
| Component | `StoredForecastPanel` and lookup tests | Idle/loading/error/uncovered states, one main landmark, locale formatting and field announcements. |
| Integration | Query hook and selection tests | Query-key correctness, abort/obsolete response handling, no cross-district data flash. |
| Accessibility | Existing jest-axe and browser checks | Focus order, names/roles, table/disclosure semantics, computed contrast. |
| Browser | Proposed `e2e/forecast-ux.spec.ts`, `e2e/navigation-a11y.spec.ts` | Lookup task, map/table parity, back/forward, keyboard menus and failure recovery. |
| Visual | Proposed route/state screenshot suite | Layout/typography drift on deterministic fixtures; human approval of meaningful diffs. |
| Contract | Existing claims, embargo, source/public-path, SW and SEO tests | No unsupported metrics, research leaks, credential caching or route/prerender divergence. |

**Test-discovery prerequisite:** The current default Playwright config only matches `full-app-qa.spec.ts`. Explicitly add new specs to `testMatch` or use a dedicated documented config and CI command. Assert discovery with `npx playwright test --list`; merely creating test files is insufficient.

### 8.3 Existing commands to reuse

Run from repository root. Commands below describe the execution plan; they were not all rerun during this planning turn.

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
npm run check:rag-freshness
npx playwright test --list
```

Build **before** tests that compare committed/public files with `frontend/dist` copies. Keep generated content and built artifacts synchronized during verification; do not restore only one side and then misreport timestamp-drift failures as application regressions.

For static-preview visual review, run the frontend preview in a separate long-lived process:

```bash
npm --prefix frontend run preview -- --host 0.0.0.0 --port 4173
```

Then, in another terminal:

```bash
node scripts/qa/design-review.mjs \
  --base=http://127.0.0.1:4173 \
  --shots=/home/user/.cache/hazardnet-ui-review/screenshots \
  --out=/home/user/.cache/hazardnet-ui-review/design-review.json
node scripts/qa/layout-audit.mjs \
  --base=http://127.0.0.1:4173 \
  --out=/home/user/.cache/hazardnet-ui-review/layout-review.json
E2E_BASE_URL=http://127.0.0.1:4173 npx playwright test
```

Create output directories first. Install the supported browser in normal CI; when browser downloads are unavailable, use the existing `QA_CHROMIUM_PATH` and `playwright.qa.config.ts` override instead of silently skipping browser tests.

**Topology caveat:** Vite preview alone does not provide Express APIs. Use fixtures for static visual review, a real backend-serving build for HTTP integration, or the Vercel preview for deployment parity. Browser-facing code must use relative API URLs; the loopback addresses above are runner-side only. The repository's split dev setup currently has a port mismatch (Vite proxy 3001 versus Express 3000); do not assume both work without explicit configuration. Existing production framing/CSP restrictions may also block embedded previews—review through a permitted top-level route or a narrowly scoped development configuration, never by weakening production headers.

### 8.4 Human review gates

Each PR includes:

1. Before/after screenshots of relevant states, not only the ideal desktop screen.
2. A short keyboard walkthrough and mobile interaction recording for new controls.
3. Source/date/uncertainty check by someone familiar with the data contract.
4. Bengali review for changed critical copy.
5. Measured bundle/network diff and exact commands/results.
6. Explanation for changed design-quality baseline or accepted visual differences.
7. Confirmation that private data, embargoed formulas and unsupported values are absent from artifacts.

---

## 9. Delivery backlog, dependencies and sizing

Estimates are planning ranges, not commitments. They assume reviewable slices, reuse of the current stack, access to a representative Android device and timely domain/Bengali review. They exclude a backend rewrite, tagged-PDF implementation and new scientific capability.

| Work package | Priority | Phase | Depends on | Effort, person-days | Done when |
|---|---|---:|---|---:|---|
| UX-BASE: route/state/source inventory and baseline | P0 | 0 | — | 3–4 | Evidence and route matrix approved. |
| UX-STATE: forecast result-state/query contract | P0 | 1 | UX-BASE | 4–6 | No idle/loading/coverage/error conflation; parity tests pass. |
| UX-HDS: primitives and reference slice | P1 | 2 | UX-BASE | 5–7 | Reference slice accepted across locale/device/mode matrix. |
| UX-SHELL: navigation and shell | P1 | 3 | UX-HDS | 4–5 | Keyboard/route/SEO contracts preserved. |
| UX-MAP: console controls and map/table bridge | P1 | 4 | UX-STATE, UX-SHELL | 7–10 | Core task accessible without raster tiles or pointer input. |
| UX-EVIDENCE: district, alerts, chart/print semantics | P1 | 5 | UX-STATE, UX-HDS | 5–7 | Evidence understandable, comparable and printable. |
| UX-PUBLIC: editorial/archive/account adoption | P2 | 6 | UX-HDS, UX-SHELL | 6–8 | Shared patterns applied without content/auth regression. |
| UX-HARDEN: Bengali, AT, performance and offline | P1 | 7 | Incremental slices | 5–7 | Human + automated release checks pass. |
| UX-RELEASE: rollout and verification | P1 | 8 | All required gates | 2–3 | Preview sign-off, rollback path and observation ownership. |
| **Total cross-functional effort** | | | | **41–57** | Some work overlaps; not all is frontend coding. |

**Suggested staffing:** two frontend engineers (one comfortable with Leaflet), part-time designer, QA/accessibility support, Bengali/domain reviewer. Tentative calendar range: **6–9 weeks**, subject to Phase 0 validation and review availability. A solo implementer should use the effort range rather than the parallel-team calendar estimate.

**Critical path:** baseline → forecast-state contract + HDS reference → shell/map → district/evidence → integrated hardening → rollout.

**Safe parallel lanes:** editorial refinement after HDS approval; Bengali dictionary/copy work alongside component migration; fixture/test harness improvements during source inventory. Avoid simultaneous edits to the same large map/dashboard module without a named integrator.

### First implementation batch

1. Create the baseline route/state matrix and two concrete lookup fixtures.
2. Fix the nested main landmark and distinguish idle/loading/uncovered/error states.
3. Add locale-aware lookup/result copy using existing i18n.
4. Implement a clear date/source/evidence hierarchy in the reference panel.
5. Add HTTP failure, keyboard, mobile and Bengali tests.
6. Review that slice before touching the whole console or replacing its navigation.

This batch delivers meaningful usability improvements even if later redesign phases are deferred.

---

## 10. Risk register and decision gates

| Risk | Prevention | Stop/rollback signal |
|---|---|---|
| More polished UI overstates model authority | Provenance/score semantics are shared components; source-value register; domain review | Any invented forecast, “live” claim, uncalibrated probability claim or official-warning implication. |
| Research leakage returns under a new label | Keep ADR 0014 withholding; extend known-pattern gate; review actual computations | Any formula/derived output tied to embargoed research appears in public assets or screenshots. |
| Global CSS cleanup breaks map/UI layers | Small component migrations, computed-style snapshots, map interaction tests | Obscured controls, unreadable text, broken focus or global overflow. |
| Large refactor changes behavior | Extract behind stable interfaces, fixture tests and one route slice at a time | Selection mismatch, lost query state, lost saved settings or unexpected request fan-out. |
| Route/SEO/analytics regression | Preserve slugs and identifiers; prerender/canonical diff | Broken inbound URL, misleading no-JS content, silently renamed event/form contract. |
| Dark-mode mismatch | Audit emitted modes and document supported routes before exposing controls | Contrast/focus failure in any advertised mode. |
| Accessibility gate gives false confidence | Combine axe, computed CSS, manual keyboard and AT review | A task cannot be completed without pointer, color or map interaction. |
| Field bandwidth cost increases | Test actual requests, not just hidden components; lazy-load optional modules | Raster/chart/PDF resources load despite user low-bandwidth choice. |
| Old cached UI still exposes withdrawn content | Versioned app cache and update testing; maintain security/cache boundaries | Updated clients continue receiving old research-bearing app shell. |
| New telemetry exposes personal data | Privacy-reviewed event schema; no coordinates/free text/identifiers | Sensitive payload in analytics, logs or public debugging surfaces. |

### Decisions to confirm before expanding scope

The plan can start without these answers; use the stated defaults until confirmed:

1. **Brand:** Default is preserve NASA HDS. Any new brand/type/color system requires a separate approved brief.
2. **Dark mode:** Audit and preserve current emitted behavior; adding a complete theme switch/support guarantee is separately scoped.
3. **Navigation/URL changes:** No new primary labels or route slugs by default. Any IA change needs owner approval, redirect/canonical plan and analytics mapping.
4. **Bengali review:** Identify a native-speaking domain reviewer before public release of new safety-relevant translations.
5. **User validation/analytics:** Confirm access to representative users/devices and privacy approval for any new telemetry. Without them, report lab/proxy results as such.
6. **PDF accessibility:** Prefer print HTML now; fully tagged accessible PDF is a separate deliverable with its own verification.

---

## 11. Final definition of done

### Product integrity

- [ ] Stored forecasts remain stored reads in both HTTP runtimes.
- [ ] District/horizon/producer dates are correct after selection changes, navigation and refresh.
- [ ] Missing, stale, uncovered and error states are distinct; no synthesized risk data.
- [ ] Research formula, derived division score and ranking remain absent.
- [ ] Alert publication/review rules and conversion-auth owner decision remain unchanged.

### Experience and design

- [ ] First-time and returning users can complete the core district task without the map.
- [ ] HDS typography, semantic colors, spacing and component behavior are consistent on migrated surfaces.
- [ ] English and Bengali critical journeys are complete and reviewed.
- [ ] Mobile/keyboard/zoom/reduced-motion/low-bandwidth scenarios pass.
- [ ] Every visible action has working behavior, feedback, failure handling and recovery.
- [ ] No new visual treatment implies an unverified observation, live measurement or official warning.

### Engineering and verification

- [ ] Build, TypeScript, unit/component/integration tests and selected browser suites pass.
- [ ] New browser specs are actually discovered and executed by CI.
- [ ] Claims, embargo, public-path, design, bundle, security/cache and SEO gates pass.
- [ ] Rendered contrast and human assistive-technology checks are documented; limitations remain explicit.
- [ ] Performance targets are measured with environment/sample details; field and lab results are not conflated.
- [ ] Visual baselines, dependency changes and source-data transformations have explicit review.
- [ ] Rollback excludes reverting data-integrity, durability or embargo protections.
- [ ] Implementation report lists remaining gaps instead of claiming an unqualified “production-ready UX.”

---

## 12. Repository evidence and handoff index

### Design and product constraints

- `DESIGN.md`
- `docs/design-system/MASTER.md`
- `docs/design-system/nasa-hds-integration.md`
- `docs/PUBLIC_SURFACE.md`
- `docs/PRODUCT_SPEC.md`
- `docs/adr/0009-single-inference-path.md`
- `docs/adr/0012-composite-index-classification.md`
- `docs/adr/0014-codebase-owner-decisions.md`
- `docs/ops/2026-09-20-stored-forecasts.md`

### Main implementation surfaces

- `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/src/index.css`
- `frontend/src/pages/FrontDoor.tsx`, `Dashboard.tsx`, `UploadPage.tsx`, `DistrictDetailPage.tsx` within the same pages directory
- `frontend/src/components/StoredForecastPanel.tsx`, `LiveMapView.tsx`, `NationalOverview.tsx`, `Navbar.tsx`, `MenuDrawer.tsx`, `CommandPalette.tsx` within the same components directory
- `frontend/src/lib/storedPrediction.ts`, `forecasts.ts`, `i18n.ts`, `bandwidth.ts` within the same lib directory
- `frontend/src/hooks/usePrediction.ts`, `useForecasts.ts`, `useAlertsData.ts`, `useI18n.ts`, `useBandwidthMode.ts` within the same hooks directory
- `frontend/src/components/alerts/`, `frontend/src/components/ui/`
- `frontend/public/serviceWorker.js`, `frontend/src/serviceWorker.ts`
- `frontend/src/content/site-routes.json`, `frontend/scripts/prerender.mjs`

### Existing verification infrastructure

- `frontend/package.json`, `package.json`, `frontend/vite.config.ts`
- `jest.config.cjs`, `playwright.config.ts`, `playwright.qa.config.ts`
- `e2e/full-app-qa.spec.ts`, `scripts/qa/browser.mjs`, `scripts/qa/design-review.mjs`, `scripts/qa/layout-audit.mjs`
- `scripts/check-design-quality.mjs`, `scripts/check-bundle.mjs`, `scripts/check-severity-embargo.mjs`, `scripts/check-claims.mjs`, `scripts/check-public-paths.mjs`
- `.impeccable/config.json`, `docs/frontend/ACCESSIBILITY.md`, `docs/frontend/ALERT_UI.md`
- `docs/codebase/TESTING.md`

**Handoff:** Begin with Phase 0 and the first implementation batch. This document is a plan, not evidence that screenshots, interviews, accessibility reviews or UI changes have already been completed.
