# Interface audit remediation

Date: 15 September 2026. Branch: `arena/01a0a0a6-hazardnet`.

Implements code-level fixes or honest containment for all 18 findings in [the interface audit](2026-09-15-interface-ux-audit.md). Existing uncommitted authentication work was retained. No production configuration, deployment, commit or push was performed.

## Resolution matrix

| Finding | Resolution implemented |
|---|---|
| F01 False emergency dispatch | Replaced timer-based delivery and fabricated dispatch logs with explicitly unavailable emergency dispatch and a downloadable **unsent** assistance draft. No SMS/radio/shelter notification is implied. |
| F02 Generated operational facts | Replaced the generated district report/modal with shared forecast summaries. Removed generated impact, shelter, telemetry, calibration and confidence figures from these operational views and exports. Profile modal no longer consumes the generator. Prediction failures no longer produce substitute probability vectors. Removed hardcoded confidence and government-issued claims from guidance print headers. Analyst examples and radar simulations are explicitly labeled demonstrations. |
| F03 Conflicting freshness | Map, district summary, comparison, profile and analyst forecast dashboard use the shared forecast query. Rows retain API versus snapshot provenance; snapshots cannot become “Live” merely by matching a district. Mixed-run API publications are rejected. Source/age/run information comes from the displayed rows, not a separate metadata refresh. Map refresh now actually refetches instead of timing a success message. |
| F04 Lost context | District/horizon are URL-addressable; map selection, detail, guidance, comparison, back links and share links carry context. Explicit map selections suppress automatic geolocation override. Profile district is an initial default only. Advisory scenario assumptions are identified, stale responses are canceled, and the selected horizon replaces hardcoded periods. |
| F05 Conflicting risk semantics | Shared 0.34/0.67 boundaries drive category, marker and card colors; baseline category labels are normalized. Severity is explained as a model index; confidence is not a probability of harm. Design-system documentation now defines three forecast categories. |
| F06 Broken sharing | Central district route builder; district QR/share links include horizon. Legacy `/district/:id` redirects preserve query state. Unknown districts remain not found. |
| F07 Ephemeral saves | One ID-based device-local watchlist across detail/dashboard/routes/tabs; no new preselected defaults. Storage failures do not claim success. Explicit device-local/sign-out behavior and removal Undo. Existing stored selections are retained. |
| F08 Readability/targets | Core card metadata uses at least 12px, dark-on-amber actions, an opaque reading surface, larger close/CTA controls and narrow-screen fact reflow. New shared panels use 16px body text. Computed contrast/zoom still require browser checks. |
| F09 Dialog accessibility | Shared native top-layer dialog for report, filter, layer, export and email overlays: accessible name, native background inertness/focus containment, Escape cancellation and opener-focus restoration. Email labels are connected to fields. |
| F10 False requisition defaults | Removed plausible officer/phone/upazila/damage defaults; unknown impact is explicitly unknown. District changes clear incompatible upazilas. Draft previews and copy feedback distinguish drafting/opening a mail app from sending. |
| F11 False reporting success | Contact forms download unsent drafts containing entered fields and preserve input. Map field reporting likewise prepares an unsent draft and no longer mutates forecast values or claims the report was logged. No submission service is implied. |
| F12 Task orientation | New district summary leads with place, period, source, meaning and actions. Navigation/breadcrumb wording uses Map, What to do and Analyst tools. Technical material is secondary or explicitly illustrative. |
| F13 Comparison selection | Three explicit district slots, replace/remove choices, shared horizon, query-restorable selections and shared forecast summaries instead of the first three saved objects. |
| F14 Recovery | Forecast refresh/retry controls; awaited clipboard completion with manual-copy recovery; advisory retries and cancellation of obsolete responses; map refresh failures remain explicit. |
| F15 Design consistency | Shared forecast/dialog/control/panel patterns; reconciled severity tokens/documentation; global element typography moved into the CSS base layer so component utilities work predictably. Amber/teal identity retained. |
| F16 Route/motion access | Skip link, focusable main content, route titles and polite navigation announcements; shared reduced-motion configuration and reduced-motion-aware Leaflet movement. Existing marker keyboard activation remains. |
| F17 Form errors | Signup errors linked to their controls; username validation accepts the submit error; first invalid field receives focus after validation. Password recovery feedback has a live region. |
| F18 Language/time honesty | Preference labeled **Preferred communication language (interface currently English)** rather than promising an untranslated UI. Core report/guidance times use Asia/Dhaka (UTC+6); preparation timestamps are distinguished from forecast-generation dates. Bangla UI translation is not claimed. |

## Verification performed

- `npm run lint`: TypeScript pass.
- `npm test -- --runInBand`: **54 suites, 501 tests passed**.
- `npm run lint:eslint`: **0 errors, 263 warnings** (repository warning backlog remains).
- `npm run build:frontend`: production frontend build passed.
- `npm run check:bundle`: passed.
- `git diff --check`: passed.

New regression coverage includes forecast source/fallback and mixed-publication handling; risk boundaries and timezone rollover; district/horizon sharing and legacy redirects; invalid district recovery; persistent watchlists; false-dispatch prevention; clipboard denial/success; contact draft preservation; comparison selection; and dialog opening/cancellation/focus restoration. Existing card tests were updated for the intentionally changed accessible region, action label and opaque reading surface.

## Deliberate feature boundaries

1. **Emergency dispatch remains unavailable.** Real delivery requires authorization, backend/provider integration, receipts and operational approval. A downloadable draft does not send a notification.
2. **Contact/map incident reporting is draft-only.** There is no claim of a server receipt. All three contact forms include their actual entered values in the downloaded draft.
3. **Unsupported operational measurements are unavailable**, not estimated for visual completeness. The legacy generator is no longer consumed by production presentation components; it is not a scientific data source.
4. **Watchlists are device-local, not account-synced.** They persist after sign-out; that behavior is disclosed.
5. **The interface remains English.** The stored language setting is explicitly communication-only. Safety-critical Bangla copy needs human review before UI localization can be promised.
6. **Scientific validity is not established by these UI fixes.** Domain validation of the model, threshold calibration and authoritative sources remains separate.

## Remaining release verification (not claimed complete)

No rendered-browser session, real screen-reader test, automated browser accessibility scan, mobile screenshot validation or live provider-delivery test was performed. Native dialog unit tests use a jsdom API shim; they test integration, not browser focus containment itself.

Before promoting these changes, manually verify:

- Gazipur / 15 days → detail → guidance → back → save/reload → share/QR.
- API unavailable, stale/offline fallback, empty data and mixed-publication cases on every core surface.
- Keyboard and screen reader behavior through map/search/dialogs/forms; 200% zoom, narrow/short viewports and reduced motion.
- Computed text contrast and effective touch-target geometry.
- Printed/downloaded output preserves the unsent/experimental/source caveats.
- Bangla-first field users understand the English interim labels, and no user believes a notification has been delivered or an illustrative figure is an official observation.

This matrix closes the source-level findings through implementation/containment. It is not a WCAG conformance certificate or production-safety approval.
