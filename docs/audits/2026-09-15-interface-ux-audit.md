# HazardNet UX design audit and improvement plan

**Date:** 15 September 2026 · **Mode:** audit and planning only; no interface changes made.

**Scope:** the **core hazard journey**, selected by the owner: find a district → choose a forecast horizon → understand the hazard → read guidance → save/share/report. Shared navigation, accessibility and design-system patterns were inspected, with supporting samples from authentication, profiles, incident reporting, analytics, uploads and publishing.

**Source baseline:** local checkout of `myself-aas/HazardNet`, branch `arena/01a0a0a6-hazardnet`, HEAD `9492833`, **including the uncommitted email/password + Google/GitHub refactor**. This is not an audit of an independently verified production deployment. File/line references below describe this worktree.

**Method:** [frontend-design-audit skill](https://github.com/mistyhx/frontend-design-audit/blob/main/.claude/skills/frontend-design-audit/SKILL.md) and its [15-principle reference](https://github.com/mistyhx/frontend-design-audit/blob/main/references/heuristics.md). All 15 principles were considered; severity uses frequency, impact and persistence, not implementation difficulty.

**Limitations:** source inspection, route tracing and mathematical color-pair checks—not rendered-browser testing. No desktop/mobile screenshots, computed-style inspection, screen-reader session, axe scan, live provider login, real notification delivery or user research was performed. Visual density and responsive recommendations need browser confirmation. Primary routes and representative state handlers were reviewed deeply; other sections were sampled, not exhaustively audited. This is neither a WCAG compliance certificate nor a scientific model validation.

## Executive assessment

**HazardNet’s biggest UX problem is not its color palette. It is the gap between what the interface claims and what its actions/data actually represent.**

The map, detailed report and profile forecast do not consistently communicate the same source, district/horizon context or freshness. Some report figures are generated from static district attributes, yet appear as operational intelligence. An emergency-dispatch action announces successful transmission without performing a transmission. These issues must precede aesthetic refinements.

The desired hierarchy is simple:

> **Where am I looking? What period does this cover? How current is the information? What does it mean? What can I safely do next?**

Preserve the amber/teal identity, geographic overview, accessible marker work and recent authentication improvements. Move technical instruments behind an explicit analyst view rather than making them the main language of the product.

## How to read this report

- **4 — Catastrophe:** task cannot actually be completed, or serious errors can result. Treat as a release blocker for the affected feature.
- **3 — Major:** recurring confusion or significant difficulty. High priority.
- **2 — Minor:** a workaround exists, but the interface imposes avoidable effort.
- **1 — Cosmetic:** appearance only. No separate cosmetic-only findings are needed here.
- **0 — Not a problem:** strengths, not defects.

Severity does not mean every visitor encounters an issue. For example, dispatch is an occasional action, but false confirmation of emergency delivery has severe consequences every time that action is used.

| Severity | Findings |
|---|---:|
| 4 — Catastrophe | 2 |
| 3 — Major | 9 |
| 2 — Minor | 7 |
| 1 — Cosmetic | 0 |
| **Total** | **18** |

### Quick wins

1. **Disable misleading emergency dispatch** and label the replacement “Prepare a draft — no messages sent” (F01). This is a frontend mitigation, not a promise to build emergency messaging in a day.
2. **Remove official/verified/live claims from generated report fields and exports**; show “Unavailable” for unsupported operational measurements (F02).
3. **Fix district share URLs and QR routes** using one route builder (F06).
4. **Replace white-on-amber CTA text with the existing dark foreground token**; use existing 44px target utilities for small icon controls (F08).
5. **Await clipboard completion** before announcing “Copied”; expose a retry/manual-copy alternative on failure (F14).

## Findings

### F01 · Severity 4 — Emergency dispatch reports delivery without sending anything

- **Principles:** H1 System status, H5 Error prevention, H9 Error recovery, H14 Perceptibility.
- **Evidence:** `frontend/src/pages/DistrictDetailPage.tsx:436–454` implements `handleTriggerDispatch` with `setTimeout`. It sets “dispatched” and adds SMS, radio and shelter-command logs. The public report button at `:2165–2194` says “Broadcast District Emergency Dispatch.” There is no delivery request in this handler.
- **Impact/rating:** occasional action; potentially severe false reliance; recurring for every dispatch. An operator may believe households or officials have been notified and stop pursuing another channel.
- **Plan:** immediately disable the operational claim. Offer an explicitly unsent draft and independently verified contact information. If real dispatch is later implemented, require authorization, preview/confirmation and server receipts; distinguish **prepared, queued, provider accepted, delivered, failed**. Never infer delivery from elapsed time.
- **Acceptance:** an unavailable service cannot produce a “sent,” “transmitted” or “delivered” state. Every genuine dispatch status is backed by an appropriate receipt; denied/failed requests preserve the draft.

### F02 · Severity 4 — Generated figures and simulations look like official operational evidence

- **Principles:** H1, H2 Real-world match, H5, H10 Help, H14.
- **Evidence:** `frontend/src/data/disasterDetails.ts:66–101` derives area/population from formulas and invents upazila suffixes. `:232–242` derives confidence, shelters, relief and medical-team numbers from severity. `DistrictDetailPage.tsx:109–153` retains these values while substituting current metadata; `:253–347` generates telemetry/history curves. `:417` labels the share text “OFFICIAL DISASTER INTELLIGENCE BRIEF”; `:2220–2243` includes hardcoded latency/calibration claims. `DisasterDetailModalUI.tsx:42–80` prints government/public-safety-directive headings over the same report family. `Dashboard.tsx:306–341` also substitutes preset model probabilities/severity when prediction fails.
- **Impact/rating:** frequent for report readers; potentially serious resource/safety errors; persistent. A current-looking timestamp can lend credibility to figures that did not come from observations or that execution.
- **Plan:** separate verified forecasts, sourced observations, reference geography and demo data in the view model. Hide unsupported operational metrics rather than manufacturing completeness. Put simulation behind a separate, conspicuous demo mode with watermarks in screen, clipboard, CSV/PDF and print outputs. Do not label HazardNet-generated content as government-issued without authority and provenance.
- **Acceptance:** no population/shelter/telemetry/confidence value appears as an observed fact without an attributable source and timestamp. API failure produces unavailable/stale state, never replacement probabilities. Generated figures cannot enter an operational export unmarked.

### F03 · Severity 3 — “Live” status and detail records can describe different data

- **Principles:** H1, H4 Consistency, H6 Recognition, H14.
- **Evidence:** `hooks/useForecasts.ts:30–43` returns a legacy snapshot after API failure, while `:81–95` sets `isLive` from matched rows alone. `LiveMapView.tsx:1401–1417` uses this to display “Live …/64.” Conversely, `DistrictDetailPage.tsx:159–181` loads its forecast table directly from static snapshots, while its metadata refresh at `:81–106` can obtain newer API metadata.
- **Impact/rating:** frequent when opening detail or falling back offline; substantial interpretation effort; recurring. A new publication date can coexist with older row values, and an offline snapshot can be presented as live.
- **Plan:** make the same forecast query and publication identity serve map, card, detail, comparison and export. Return a discriminated state such as `fresh-verified`, `stale`, `offline-copy`, `reference-only`, `unavailable`, with timestamps and run ID. Show age in visible text, not only a hover title. Reuse the profile card’s stricter freshness helper as a starting point.
- **Acceptance:** with the API unavailable and an old snapshot present, no surface says “Live.” Row dates/run IDs, not unrelated metadata, determine the report’s source label. Refresh cannot combine two publications in one displayed dataset.

### F04 · Severity 3 — District, horizon and crop context do not carry through the journey

- **Principles:** H4, H6, H12 Structure.
- **Evidence:** the map owns a local horizon in `LiveMapView.tsx:158–162`; `DistrictForecastCard.tsx:25–29` passes only a district ID to detail. `DistrictDetailPage.tsx:159–163` starts its table at seven days. `AdvisoriesPage.tsx:57–70` initializes independent Kurigram, hazard, severity and crop defaults. `AdvisoryPanel.tsx:60–65` hardcodes Aman rice and a new seven-day target rather than carrying the selected forecast. Profile editing already synchronizes district fields (`ProfileSection.tsx:239–248`); preserve that improvement rather than assuming it is absent.
- **Impact/rating:** frequent multi-page journey; wrong-context advice is hard to notice; recurring.
- **Plan:** carry a canonical district ID, horizon and optional crop context in route/query state. Use the profile only as the initial default, never to silently replace an explicit choice. Add a consistent context bar above forecasts and advisories. For custom scenarios, label edited severity/crop assumptions visibly.
- **Acceptance:** choosing **Gazipur / 15 days** survives map → detail → guidance → back → share. Guidance visibly states the same district/period; any scenario override is explicit.

### F05 · Severity 3 — Risk categories, colors and percentages teach conflicting meanings

- **Principles:** H2, H4, H10, H14.
- **Evidence:** `lib/forecasts.ts:303–304` bins at 0.34/0.67. `map/DistrictForecastCard.tsx:31–51` changes tone at 0.5/0.8. `map/mapPrimitives.ts:85` has a fallback category at 0.4/0.7. `LiveMapView.tsx:241` describes a severity percentage as “% Risk.” Static district records also carry independently specified risk labels.
- **Impact/rating:** frequent; users must infer whether differences are real or cosmetic; recurring. For example, a score of **0.72 is High by the shared bin but amber by the card tone**. A severity percentage is not necessarily a probability of an event or harm.
- **Plan:** establish one product-approved severity mapping and legend shared by marker, card, table, text and export. Keep hazard-type colors separate from severity colors. Say “Model severity 72/100” and explain confidence separately; do not assert calibration from a score alone. Domain review of thresholds remains distinct from UI consistency.
- **Acceptance:** boundary tests around every threshold produce identical labels/colors everywhere. A text label accompanies each risk color, and the score’s interpretation is visible at the point of use.

### F06 · Severity 3 — Shared district links and QR codes target a missing route

- **Principles:** H3 Control, H4, H9.
- **Evidence:** `DistrictDetailPage.tsx:761–775` and `:970–979`, plus `DisasterDetailModalUI.tsx:75–80`, build `/district/...` URLs. The router in `App.tsx` exposes `/forecast/district/:id`, not `/district/:id`.
- **Impact/rating:** occasional but central to sharing; recipients cannot open the intended report; persistent for generated links. Printed QR codes are particularly costly to correct.
- **Plan:** use a shared canonical route builder with district slug and selected horizon. Generate the absolute URL from approved deployment configuration. Add a legacy route redirect if such links have already been distributed.
- **Acceptance:** every screen/share/QR link resolves to the intended district and horizon. Automated route tests cover existing district slugs and unknown IDs; invalid IDs show a clear not-found state rather than another district.

### F07 · Severity 3 — The detail-page watchlist promise is not persistent

- **Principles:** H1, H4, H7 Efficiency, H15 Forgiveness.
- **Evidence:** `DistrictDetailPage.tsx:211–214,426–434` toggles local React state and announces a “Priority Watchlist” pin. `Dashboard.tsx:205–237` uses a different persisted local list and seeds it with six districts on first use.
- **Impact/rating:** frequent for repeat monitoring; users cannot rely on saved work; recurring after navigation/reload. Preselected districts also look like personal choices.
- **Plan:** create one saved-district service/hook used by detail, navigation and saved views. Distinguish anonymous device-local storage from account-synced storage. Start with an honest empty state and suggested districts separately. Support Undo for removal and disclose storage failures.
- **Acceptance:** save in detail → open My Districts → reload shows the same selection. An unsaved default is not labeled “saved.” Sign-out/account-switch behavior is defined and tested.

### F08 · Severity 3 — Critical card text is too small or low-contrast; small controls compound the problem

- **Principles:** H8 Minimalism, H11 Signifiers, H13 Accessibility, H14.
- **Evidence:** `DistrictForecastCard.tsx:117–178` specifies 8–10px metadata spans and a 24px close control; `:220` puts white text on `#f9a825`. `MapLegendUI.tsx:29–44` uses a 20px close control and small legend text. Existing tokens in `index.css:67–80,142–148,174,476–480` already provide safer foregrounds and a larger target utility.
- **Impact/rating:** frequent field/mobile reading; substantial effort in sunlight or with low vision; persistent. Exact final sizes must be checked in the browser because global typography can override utility classes.
- **Plan:** use 16px body, 14px important labels, 12px minimum noncritical captions as a starting scale; do not squeeze crop/elevation/coordinates into one tiny row on narrow screens. Use dark-on-amber tokens. Enlarge compact controls to a comfortable **44px design target**.
- **Acceptance:** rendered contrast is at least 4.5:1 for normal text and 3:1 for large text; content remains usable at 200% zoom. Check effective target size/spacing. **44px is an ergonomic target, not a claim that every smaller control fails WCAG 2.2 AA** (its target-size criterion has a 24px minimum and exceptions).

**Static color-pair checks (not browser-computed styles):** white on `#f9a825` = **1.97:1**; `#94a3b8` on white = **2.56:1**; existing `#475569` on white = **7.58:1**. The first two are not suitable for required normal text.

### F09 · Severity 3 — Important overlays lack a complete accessible dialog pattern

- **Principles:** H3, H11, H13.
- **Evidence:** `AdvisoriesPage.tsx:940–1034` builds the email generator from fixed divs with no dialog semantics, focus trap/restoration or Escape handling in that page; its close button is icon-only without an accessible name. Map export/layer overlays in `LiveMapView.tsx:2070–2305` use similar custom wrappers. The navigation drawer and command palette have some semantics/Escape behavior—this is not a claim that all overlays lack them.
- **Impact/rating:** occasional overlay use; significant difficulty for keyboard and assistive-technology users; repeats on each use.
- **Plan:** adopt one audited dialog/sheet primitive with accessible title, initial focus, focus containment, Escape/cancel and trigger-focus restoration. Associate every email-generator label with its control. Ensure top navigation cannot remain above or interactive through a modal overlay.
- **Acceptance:** keyboard-only users can open, complete and close each overlay without reaching background controls. A screen reader announces its title; dismissal restores focus to the opener. Validate layering and scroll behavior at phone/tablet widths.

### F10 · Severity 3 — Emergency email drafts start with plausible but unconfirmed facts

- **Principles:** H2, H5, H15.
- **Evidence:** `AdvisoriesPage.tsx:57–62` prepopulates district, upazilas, officer name, phone and damage area. `:79–105` inserts those values into official-looking copy/mailto text; even an empty area becomes a default number.
- **Impact/rating:** occasional high-consequence form; erroneous details can escape unnoticed; persistent default behavior.
- **Plan:** keep examples as placeholders, not actual values. Pull only confirmed district/profile information, require review of contact/impact fields, and use “Unknown/not assessed” rather than a guessed numeric value. Label the output “Draft assistance request”; show recipient and editable preview before launching mail.
- **Acceptance:** untouched fields cannot generate an attributed officer, phone number or claimed damage area. Changing district invalidates incompatible upazilas. The interface distinguishes drafting/opening an email client from sending a message.

### F11 · Severity 3 — Incident reporting says a report was logged, but only clears the form locally

- **Principles:** H1, H5, H9, H15.
- **Evidence:** supporting flow `frontend/src/pages/Contact.tsx:21–29`: `handleSubmit` uses a timer, displays “logged in the HazardNet validation queue,” and clears comments without a submission request.
- **Impact/rating:** occasional feedback task; reporting cannot actually be completed through this handler, and entered evidence is lost; recurring. Rated below emergency dispatch because the immediate safety dependency is less direct.
- **Plan:** until a real submission path exists, label the form unavailable or offer a copy/download draft. A future backend must return a report/ticket ID before the UI clears content or claims receipt. Preserve drafts on failure.
- **Acceptance:** success requires a receipt; offline/failure preserves all fields. The user can copy or download the report for an alternative channel.

### F12 · Severity 2 — Navigation and headings describe technology more than user tasks

- **Principles:** H2, H6, H8, H10, H12.
- **Evidence:** `Dashboard.tsx:497–508`, `Map.tsx:43–76`, `AnalyticsPage.tsx:19–32,48–76` and `Breadcrumbs.tsx:21–31` emphasize “telemetry,” “visualization engine,” “tensor,” “Firestore & Recharts,” and “ingestion.” Detail is a long operational/technical report with many peer sections (`DistrictDetailPage.tsx:1080 onward`).
- **Impact/rating:** frequent for newcomers; learnable but unnecessary effort; recurring. Density is a source-indicated risk, not a screenshot-confirmed judgment.
- **Plan:** primary navigation should read **Map · My Districts · What to Do · Reports**; retain an **Analyst tools** entry for technical users. Lead detail with summary, data status and actions. Put model diagnostics, coordinates and pipeline internals into labeled secondary sections.
- **Acceptance:** in task testing, a first-time user can find their district and the next useful action without interpreting a technical acronym. Expert tools remain discoverable, not deleted.

### F13 · Severity 2 — Comparison has no direct choice of the districts being compared

- **Principles:** H6, H7, H11, H12.
- **Evidence:** `Dashboard.tsx:921–973` renders `savedDistricts.slice(0, 3)`; no picker is present in that comparison block. The user must manipulate another list to change the comparison.
- **Impact/rating:** occasional analyst/repeat-user task; cumbersome workaround; recurring.
- **Plan:** offer two or three searchable district slots, explicit replace/remove controls, one shared horizon and data-state header, and an honest empty state. Compare aligned metrics from the same publication rather than saved copies of static district objects.
- **Acceptance:** a user can compare any two districts directly, swap one without leaving the page and share a URL that restores the comparison.

### F14 · Severity 2 — Failure and copy feedback often lack an honest recovery path

- **Principles:** H1, H9, H10, H15.
- **Evidence:** `AdvisoryPanel.tsx:76–111` shows an error without an explicit retry. `AdvisoriesPage.tsx:93–111` and `DistrictDetailPage.tsx:416–423` announce clipboard success without awaiting completion. `ProfileForecastCard.tsx:23` says “Try again later” without a retry control.
- **Impact/rating:** occasional network/permission failures; reload or manual selection is a workaround; repeats in poor connectivity.
- **Plan:** standardize persistent error/status components with Retry and source-specific alternatives. Await clipboard promises; offer a selectable text area if copying is denied. Keep district/horizon/input context during retry. Avoid showing raw service internals as primary guidance.
- **Acceptance:** denied clipboard permission never produces “Copied.” Retrying a forecast/advisory retains the selected context and distinguishes stale reference guidance from a newly generated result.

### F15 · Severity 2 — Existing design tokens are bypassed and the CSS cascade obscures intent

- **Principles:** H4, H8, H11, H12.
- **Evidence:** `index.css:37–175` defines a substantial token system, but card/map/analytics components contain bespoke colors, shadows and sizes. `index.css:699–774` also assigns unlayered styles to all headings, paragraphs, labels and buttons; these can override Tailwind’s layered utilities. `docs/design-system/MASTER.md` and current CSS disagree on parts of the severity palette.
- **Impact/rating:** frequent cross-page inconsistency; users can work around it; persistent. This also makes future visual fixes unpredictable.
- **Plan:** **consolidate the existing design system, do not create a competing one**. Reconcile its documentation with code, place appropriate defaults in the base layer and move component decisions into shared Button, Badge, ForecastStatus, ContextBar and Dialog patterns. Preserve brand amber/teal; reserve hazard colors for meaning. Use one coherent UI icon family while retaining recognizable provider logos.
- **Acceptance:** the same named action/state renders consistently across core pages; computed-style checks confirm intended type sizes and contrast. New core components do not introduce arbitrary palette/spacing values.

### F16 · Severity 2 — Route changes and core motion are not consistently accessible

- **Principles:** H3, H7, H13, H14.
- **Evidence:** `App.tsx:120–145` animates route content but does not implement a route-focus/live-announcement pattern or skip-to-content target there. Core map/report motion does not use `useReducedMotion`; the auth layout does. `index.css:605–617` reduces CSS animation, which is not a complete policy for JavaScript-driven Framer Motion and imperative smooth scrolling (`DistrictDetailPage.tsx:457–464`).
- **Impact/rating:** frequent navigation; users can often tab/search manually; recurring. Exact motion behavior needs rendered testing.
- **Plan:** add a skip link and predictable main-content focus on navigation, meaningful route titles, and a restrained live announcement. Apply a shared reduced-motion policy to Framer Motion and programmatic scrolling, preserving essential state changes.
- **Acceptance:** keyboard/screen-reader testing announces the new district/page and starts at useful content; reduced-motion settings remove nonessential translation/smooth scrolling without hiding state. Do not remove the existing keyboard-accessible map pins or command palette.

### F17 · Severity 2 — Some form errors are visible but not connected to the fields

- **Principles:** H5, H9, H13, H15.
- **Evidence:** sampled auth flow `SignUpPage.tsx:210–283` has field validation and `aria-invalid`, but name/email messages lack stable error IDs and `aria-describedby`; the submit path does not focus the first invalid control. `ForgotPasswordPage.tsx:66–79` has visible error content without an alert/live-region role.
- **Impact/rating:** occasional invalid submission; correction is possible visually, harder with assistive technology; recurring.
- **Plan:** give each error/help message an ID, associate it with its field, announce an error summary and focus the first invalid field after submit. Preserve existing field values and the recent standard email/password flow.
- **Acceptance:** submitting an incomplete form announces the errors, identifies the affected fields and places focus usefully. No correction requires re-entering previously valid information.

### F18 · Severity 2 — Language and time conventions do not match the stated local context consistently

- **Principles:** H2, H4, H7, H10, H13.
- **Evidence:** `ProfileSection.tsx:193` stores a preferred language, but no translation consumer was found in the core screens. The app shell is `lang="en"`. `DistrictDetailPage.tsx:128–141` formats ingestion time in **Europe/London**; forecast dates are UTC-oriented, while other report labels say BST. Core operational copy is English and technical.
- **Impact/rating:** audience-dependent; a workaround exists for bilingual users, but preference mismatch and timezone ambiguity recur. Raise priority if Bangla-first field testing shows task failure; do not assume every farmer has the same language ability.
- **Plan:** either implement the preference or label it as communication-only/not yet applied. Translate the critical district/status/action path into reviewed Bangla first; preserve source terminology where needed. Display local Bangladesh times with an explicit **Asia/Dhaka (UTC+6)** label and make UTC available for analysts. Define what a forecast “target date” means rather than implying daily precision.
- **Acceptance:** selected UI language persists across core routes with correct document language; critical warnings receive human review. All timestamps identify their timezone, including exports around date boundaries.

## Coverage of all 15 principles

| Principle | Assessment/evidence |
|---|---|
| H1 Visibility of system status | Major gap: F01–03, F07, F11, F14. Strength: profile forecast freshness states. |
| H2 Match to real world | F02, F05, F10, F12, F18: separate facts from simulations and use task language. |
| H3 User control and freedom | F06, F09, F16. Some overlays already have close/Escape controls; complete the pattern. |
| H4 Consistency and standards | F03–07, F12, F15, F18. Existing token architecture is a useful foundation. |
| H5 Error prevention | F01–02, F10–11, F17. Strength: password confirmation and disabled auth submission controls. |
| H6 Recognition over recall | F03–04, F12–13. Strength: searchable map and command palette. |
| H7 Flexibility and efficiency | F07, F13, F16, F18. Strength: keyboard marker activation and command shortcuts. |
| H8 Aesthetic and minimalist design | F08, F12, F15. Preserve the brand; reduce operational/technical competition. |
| H9 Error recovery | F01, F06, F11, F14, F17. Strength: root error boundary and back/home recovery routes exist. |
| H10 Help and documentation | F02, F05, F12, F14, F18. Put interpretation near scores, not only in technical docs. |
| H11 Affordances and signifiers | F08–09, F13, F15. Explicitly label real actions and give them usable targets. |
| H12 Structure | F04, F12–13, F15. Group context, summary and actions before diagnostics. |
| H13 Accessibility | F08–09, F16–18. Strength: zoom permitted, focus styles and several ARIA patterns exist. |
| H14 Perceptibility | F01–03, F05, F08, F16. Make freshness/meaning visible without hover or color alone. |
| H15 Tolerance and forgiveness | F07, F10–11, F14, F17. Preserve work and never clear it on unverified success. |

## Strengths to preserve

1. **The new profile forecast card is substantially more honest than the legacy report.** It exposes timestamps, labels stale/unverified fallback, distinguishes severity from confidence and reminds users to check official warnings (`ProfileForecastCard.tsx`, `lib/profileForecast.ts`; H1/H2/H14).
2. **Map pins already support keyboard activation and accessible names.** `LiveMapView.tsx:624–639` handles Enter/Space and describes district, hazard and severity. The command palette offers Ctrl/Cmd+K and search (H6/H7/H13). Do not replace these with pointer-only map interactions.
3. **The shell has useful accessibility foundations.** `index.html` declares language and permits zoom; CSS defines focus rings and reduced-motion handling. `AuthLayout.tsx` explicitly checks reduced-motion preference for its decorative strip (H13/H14).
4. **There is already a documented brand/token system.** Reusing it is preferable to a new visual identity; the main problem is incomplete adoption and drift (H4/H8).
5. **Responsive card containment and progressive disclosure exist.** The district card measures available height, keeps the CTA outside its internal scroll body and collapses the secondary location map. These are sound patterns to retain and test at narrow/short viewports (H3/H12).
6. **Recent authentication cleanup should stay.** Email/password, Google and GitHub are now the explicit sign-in choices; signup distinguishes account creation from email-delivery failure. The audit is not asking to reintroduce passwordless or extra providers (H5/H9).

## Proposed interface direction

### Core screen: task-first, analyst tools second

```text
HazardNet          Map · My Districts · What to Do · Reports       Account

[ Gazipur ▼ ]       [ 7 days | 15 days ]       [ বাংলা | English ]
Updated 09:30, 15 Sep · UTC+6     [Fresh verified / Stale / Offline copy]

┌ Map / accessible district list ┐  ┌ Gazipur: forecast summary ───────┐
│ Optional layers and legend    │  │ Main hazard · Severity 72/100    │
│ Focused selected district     │  │ Forecast period · Data caveat   │
│                               │  │ [Read guidance] [Save district] │
└───────────────────────────────┘  └─────────────────────────────────┘

What this means · Source and confidence · Official warning links
[Optional: Analyst details / map layers / technical methodology]
```

This is a structural proposal, **not a rendered mockup and not real forecast data**. On mobile, put district/horizon/status above the map and a readable summary sheet below it; provide a district list alternative. Avoid trying to retain all desktop instruments simultaneously. Emergency dispatch must not appear as an available operation unless actually implemented and authorized.

### Shared UX contracts

- **Forecast status:** source kind, execution ID, generated time, publication time, selected horizon, completeness and explicit unavailable/stale state.
- **Location context:** canonical district ID, profile default versus explicit selection, horizon, optional crop context; URL-addressable for sharing.
- **Risk display:** one approved label/threshold/color mapping; numerical severity is an index, not an implicit probability.
- **Action feedback:** success means a completed action at the stated level—copy completed, draft prepared, request accepted, delivery confirmed—not merely a click or animation.
- **Visual foundation:** retain amber primary actions and teal navigation. Use opaque/readable surfaces for important values; reserve glass effects for noncritical map chrome. Prefer 16px body, 14px labels, 12px secondary captions; semantic spacing and consistent target sizes.

## Prioritized delivery plan

Estimates are **indicative engineering effort**, not delivery commitments. They assume one frontend engineer with QA support; backend integrations, data licensing/verification, domain decisions and translation review can change scope. Do not sum overlapping work as independent projects.

| Phase | Scope / findings | Indicative effort | Owners / dependencies | Exit gate |
|---|---|---|---|---|
| **0. Contain misleading behavior** | F01–02; immediate truthful fallbacks for F10–11 | 0.5–2 frontend days for containment | Frontend + product/domain owner; no new messaging integration assumed | No false dispatch/report success; no unmarked generated operational data |
| **1. Establish shared data and design contracts** | F03–05, F08, F15 | 3–5 days | Frontend + forecast/API owner + domain review of labels | One source/state/context model; consistent severity boundaries and legible core components |
| **2. Rebuild the district-to-guidance journey** | F04, F06–07, F12–14 | 3–5 days | Frontend + product design; stable publication metadata | District/horizon survive navigation; save/compare/share work coherently |
| **3. Accessible interaction pass** | F09, F16–17; target-size/zoom verification from F08 | 2–4 days | Frontend + accessibility QA | Dialog, keyboard, focus, form-error and reduced-motion checks pass |
| **4. Localized field validation and real reporting** | F10–11 backend completion, F18, iterate F08/F12 | Separate estimate after scoping | Backend owner, Bangla reviewer, field users, approved contact/data sources | Confirmed reporting receipts; understandable reviewed copy; no safety-critical misunderstandings |

**Scope discipline:** first disable or relabel unsupported operations. Do not make the frontend audit depend on building a radio/SMS dispatch service, retraining the model or redesigning the entire product.

## Acceptance and research plan

### Test scenarios to add—not tests claimed as executed

1. **Forecast truth:** fresh run; stale run; API failure with old snapshot; no data; partial coverage. Check map/card/detail/comparison/clipboard/PDF for the same district, horizon and source identity.
2. **Safety boundary:** click dispatch with no service; deny/timeout a submission; verify no fabricated success or generated delivery log. Verify unsupported metrics stay unavailable in print/export.
3. **Core journey:** select Gazipur and 15 days, open detail, read guidance, go back, save, reload, share and open the generated link/QR.
4. **Accessibility:** keyboard only and a screen reader across map, search, dialogs, email form and report; 200% zoom and narrow reflow; reduced motion; denied clipboard/geolocation permissions.
5. **Responsive layouts:** 320/375/414px phones, 768/1024px tablets, 1440px desktop, short landscape heights. Validate computed contrast/target geometry, not just class names.
6. **Recovery:** offline/slow network retains context and drafts; reconnect does not silently relabel an old publication as new.

### Small field study

Recruit **6–8 participants** across farmers and extension/response users, including Bangla-first and lower-confidence smartphone users. Include an analyst and users who navigate by keyboard/assistive technology where possible. This is a proposed sample, not a completed study.

Ask participants to find their district, explain the forecast period and severity, identify whether data is current, select an appropriate next action, save a district and open a shared report. Ask explicitly: **“Has this system actually sent an alert?”** Avoid coaching terminology.

Suggested go/no-go targets (establish a baseline first):

- **Zero critical misunderstandings** about delivery, official authority or simulated observations.
- At least **90% assisted-free task success** on district → period → guidance in a larger follow-up sample; report counts, not just percentages, in the small study.
- Users can correctly distinguish current forecasts from stale/offline reference data.
- No critical/serious accessibility defects in the core manual/automated checks; automated tools alone do not establish conformance.

Track task completion, wrong-district/wrong-horizon errors, stale-data recognition, export-link resolution and actual submission receipts—not decorative click counts. Avoid collecting precise location or sensitive draft text merely for UX analytics.

## Sources reviewed and review depth

`frontend/src/` is the prefix below unless stated otherwise. “Targeted” means relevant handlers, markup or styles were inspected; it does not imply every line of a large file was read.

| Area | Files / depth |
|---|---|
| Application shell and design | `frontend/index.html`; `App.tsx`; `index.css`; `docs/design-system/MASTER.md` — structural/style review |
| Core map and detail | `pages/Dashboard.tsx`, `pages/DistrictDetailPage.tsx`, `components/LiveMapView.tsx` — targeted deep tracing; `components/Map.tsx`, `components/map/DistrictForecastCard.tsx`, `components/MapLegendUI.tsx` — component review |
| Data presentation | `hooks/useForecasts.ts`, `lib/forecasts.ts`, `lib/profileForecast.ts`, `data/disasterDetails.ts`, `data/bangladeshDistricts.ts`, `components/map/mapPrimitives.ts`, `services/geolocationService.ts` — relevant data/state/risk logic |
| Guidance and reporting | `pages/AdvisoriesPage.tsx`, `components/AdvisoryPanel.tsx`, `components/StructuredAdvisoryRenderer.tsx`, `components/DisasterDetailModal.tsx`, `components/DisasterDetailModalUI.tsx`, `pages/Contact.tsx` — targeted handlers/content/overlays |
| Shared navigation/recovery | `components/Navbar.tsx`, `components/MenuDrawer.tsx`, `components/CommandPalette.tsx`, `components/Breadcrumbs.tsx`, `components/ErrorBoundary.tsx`, `pages/NotFoundPage.tsx` — targeted patterns; `components/Footer.tsx` — scan only |
| Account/auth samples | `components/user/dashboard/ProfileForecastCard.tsx`, `components/user/dashboard/ProfileSection.tsx`, `components/auth/AuthLayout.tsx`, `pages/SignUpPage.tsx`, `pages/ForgotPasswordPage.tsx`, `context/AuthContext.tsx` — selected states/preferences/validation |
| Supporting section samples | `pages/AnalyticsPage.tsx`, `pages/UploadPage.tsx`, `pages/Documentation.tsx`, `pages/dashboard/BlogEditorPage.tsx` — purpose and representative interactions; these sections need a separate exhaustive audit before broader claims |
| Route-purpose inventory only | Top-level pages: About, AdvisoriesPage, AnalyticsPage, AuthCallbackPage, BlogArticlePage, Blogs, Contact, Dashboard, DistrictDetailPage, Documentation, DownloadCenter, ForgotPasswordPage, LoginPage, NotFoundPage, Privacy, PublicProfilePage, SetPasswordPage, SignUpPage, Terms, UpdatePasswordPage, UploadPage, UseCases, UserDashboardPage. Headings/routes were inventoried; this is not an assertion that every page received equal-depth review. |

## Recommended decision

Approve **Phase 0 containment first**, then shared forecast/context/severity contracts and the readable core card. Follow with the district-to-guidance flow and accessible interaction pass. Keep full-product visual redesign and new emergency-delivery integrations out of the initial scope.

No fixes were applied during this audit. Implementation should begin only after the owner agrees on the plan and any items to defer.

---

**Implementation follow-up:** The owner subsequently authorized remediation. See [the remediation matrix and verification record](2026-09-15-interface-remediation.md) for the code-level fixes, deliberate feature boundaries and remaining browser/field validation. The original findings above are retained as the audit baseline, not a description of the remediated worktree.
