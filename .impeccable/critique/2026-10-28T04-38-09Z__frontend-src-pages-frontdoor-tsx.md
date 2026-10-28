---
target: front door (/)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 5
target_identity: "file:frontend/src/pages/FrontDoor.tsx"
target_fingerprint: "sha256:64518ce42826808f4406fdcbbd928a3670442e0881eee3a761bd6f900a7f3e16"
target_path: frontend/src/pages/FrontDoor.tsx
timestamp: 2026-10-28T04-38-09Z
slug: frontend-src-pages-frontdoor-tsx
---
# Critique — `/` (front door)

**Target:** `frontend/src/pages/FrontDoor.tsx` and the landing-page components it composes (`LiveStatusStrip`, `StatusVerdict`, `AppleHazardsBento`, `HeroCinematicBackground`, `HeroImageCarousel`)  
**Surface:** `.impeccable/surfaces/front-door.md` — mode **Persuade**  
**Method:** Assessment A was completed from the current source, route content, design spec and built static document before Assessment B was read into the synthesis. Assessment B ran the Impeccable detector, craft-floor gate, source design gate and targeted FrontDoor/i18n/hero-contrast tests. This environment exposes no sub-agent tool and no browser binary, so A and B ran sequentially in one context and the rendered page was not screenshot-inspected.

> ⚠️ DEGRADED: single-context (no sub-agent tool exposed; no browser automation available)

## Heuristic score — 28 / 40

| # | Heuristic | Score | Note |
|---|---|---|---|
| 1 | Visibility of system status | 3 | The verdict, run age, coverage and unread/no-ledger states are unusually explicit; the live strip nevertheless sits below a full-height hero and fades itself in from opacity 0 |
| 2 | Match between system and real world | 3 | District, hazard, horizon, forecast date and official-bulletin language are now clear; the hazard bento reintroduces telemetry/model jargon and a false “real-time” frame |
| 3 | User control and freedom | 3 | Language, standfirst disclosure and hero pause are real controls; the Shelf/Grid toggle adds control without a user task, while the default shelf hides most hazard classes off-screen |
| 4 | Consistency and standards | 2 | The clarified editorial vocabulary is coherent, but the composed page mixes alert/advisory/outlook, English constants inside Bengali, three card grammars and inconsistent heading scales |
| 5 | Error prevention | 3 | Missing values are never dressed as zero and the new copy separates severity, level and confidence; “live emergency” wording and unreviewed new Bengali safety copy create preventable misreadings |
| 6 | Recognition rather than recall | 3 | Provenance, dates and a table of contents help; the TOC arrives late, names only the editorial sections and the same facts recur in several competing summaries |
| 7 | Flexibility and efficiency of use | 2 | Direct routes exist, but the practical “Start here” guidance is buried under the hero, status, figures, alerts, a large hazard showroom and two editorial sections |
| 8 | Aesthetic and minimalist design | 2 | The page has a distinct editorial idea, then spends it on a cinematic carousel, figure cards, quick-action cards, 440px hazard cards, horizon cards, blog cards and repeated bordered panels |
| 9 | Help users recognise, diagnose and recover from errors | 3 | Most panels now name the unknown and offer retry/status routes; the live strip still prints a raw loader error and colours non-link error text as a link |
| 10 | Help and documentation | 4 | The 11 sections and 8 FAQs now answer purpose, action, forecast vs alert, severity vs confidence, updates, validation, access, languages and missing values in-path |

## Design specificity — pass, with reservations

Cover the wordmark and this is still not a generic climate SaaS homepage. Its structure is the product's honesty discipline: a checkable claim, a verdict that refuses to turn publication silence into safety, dated artifacts, withheld-row arithmetic, official-authority boundaries and a validation record. The 2026-10-28 clarify rewrite strengthens that specificity by making severity, alert level and confidence three visibly different ideas.

The reservation is that two borrowed retail/cinematic systems now compete with that publication voice: an Apple Store “bento” with Shelf/Grid modes and quick actions, and a looping AI-image hero. They are the parts another product could copy wholesale; the provenance record is the part it could not.

## Priority issues

**P0 · The page calls a daily, unofficial publication “live emergency” and “real-time.”** In `AppleHazardsBento.tsx`, the quick action to `/alerts` is subtitled “Live emergency advisories” in English and “রিয়েল-টাইম আর্লি ওয়ার্নিং” (“real-time early warning”) in Bengali. HazardNet's own clarified copy says forecasts update in daily runs, its tiers are decision support, BMD/FFWC issue official warnings and emergencies belong to local administration/999. The front door elsewhere states that boundary carefully; this card blurs it in the most glanceable language on the page. Change the claim to the truthful one — published alerts from the last run — and let freshness be carried by the dated verdict, not by “live.”

**P1 · “Start here” does not start the page.** The visitor's Persuade task is to decide and act. Before section 3 (“Start here: what to do with an outlook”) they pass the cinematic hero, live verdict/count strip, four coverage figures, published-alert panel, hazard quick actions, a horizontal shelf or grid of 390–440px hazard cards, two horizon cards, the table of contents, and two editorial sections. The new section order is logical inside the editorial block, but page order defeats it. A farmer or parishad official gets the product catalogue before the operating instruction. Put a compact audience/action pathway immediately after the verdict, or move the full “Start here” section above the coverage figures and hazard showroom.

**P1 · The hazard registry has become a product shelf.** `AppleHazardsBento` adds a second navigation landmark despite the page's deliberate one-`<nav>` decision, four quick-action cards duplicating hero/strip destinations, “Next-generation geospatial intelligence” marketing copy, and a Shelf/Grid switch whose buttons are only `py-1` high with English-only aria labels and no pressed/selected state exposed. In the default shelf, eight classes are not all visible, each card is 440px tall, and a large decorative motif does more work than the district decision the class should support. The brief asks for eight hazard classes as type-led cards inside an editorial page, not a storefront inside the front door. Distill this to a static, scannable index, all rows findable without a view mode.

**P1 · Bengali is presented as fully settled while the newest safety copy is explicitly pending review.** The route still records `approved-native-speaker` on 2026-09-19 while the route update date is 2026-10-28 and the newly written Bengali begins as `pending-native-speaker` under the repository rule. Removing the old false draft badge was correct for the previously approved text; shipping new action/safety prose with no release gate would create the opposite false impression. The visible mix reinforces the concern: the trust figure hard-codes “7 & 15 days”, bento lead-time strings and aria labels stay English, and hazard names/seasons are not consistently localized. Do not merge the new Bengali until the project owner has re-read it, then move the review record honestly.

**P1 · The live status animates in from invisible, and one raw error survived the clarify pass.** `LiveStatusStrip` interpolates the whole status region from opacity 0 to 1 (and its error panel does the same), contrary to the design rule that a hazard level must be readable the instant the screen paints and entrances start from an already-visible default. At the strip's error row, `{error}` is still rendered directly in `--ap-link` colour; `lib/alerts.ts` can populate that value with implementation/fetch messages. The same strip's unread-state Retry button is `min-h-[32px]`, below the product's 44px target rule. This is the page's safety instrument: it should be still, fully painted, localized and touch-sized in every state.

**P1 · The hero uses unlabelled AI disaster imagery and makes low-end readers pay for the cinema.** `heroCarouselImages.ts` states the slides are AI-generated; they depict a flooded delta, monsoon river, cyclone and submerged village, but no visible “illustrative” label appears at the point of use, as `DESIGN.md` requires for imagery that could be read as a real place or event. In normal mode the carousel preloads all four painted frames at mount: about 838 KB of landscape files, or about 912 KB of portrait‑2x files on a high-density phone, before counting the animated glow, backdrop blur and frame loop. Reduced-motion and low-bandwidth paths are handled; an ordinary metered 3G reader who has not tripped low-bandwidth mode still pays for decoration before evidence.

**P2 · The editorial measure is too wide for the amount of prose now on the page.** The 11 sections contain about 1,873 English words plus 640 FAQ words, yet `SectionBody` paragraphs and bullets run across the 1200px container with no prose measure. On desktop the line is far beyond the craft floor's 65–75 characters; on the page's actual phone audience the repeated full-width paragraphs become a long, undifferentiated document. Set the editorial text to a real measure and let only the Knowledge products table break out.

**P2 · The hero contrast defect is closed; the hero's cost and depth are not.** The 2026-10-26 contrast P1 now has token tiers and `heroContrast.test.js` proving 4.5:1 over a white worst-case photograph. The remaining problem is composition: a minimum 600px mobile header and `100dvh` desktop hero still delay the verdict, while the scrim, hairline, backdrop blur and two 0.8-alpha text shadows solve legibility four times. The prior evidence-pointer duplication is gone, but language switch, clamped 70-word standfirst with a 44px disclosure, one CTA, three 44px links, authority small print and a floating pause control remain a crowded first screen.

**P2 · Cards and rules, not editorial space, now structure too much of the page.** The brief asks for one idea per section and an 80px editorial rhythm. The implementation stacks sections at 32/48px, puts a visible top rule on every editorial section, and surrounds them with figure cards, a status card, an alerts card, quick-action cards, bento cards, horizon cards, a TOC card, blog cards and an attribution card. Individually most groups earn a container; cumulatively the “no card grid as page structure” decision is honoured only in the spaces between card grids.

**P2 · The table of contents promises the page and indexes only part of it.** “On this page” appears after the status, coverage, alerts and hazards sections and lists only the 11 editorial sections; it omits those earlier sections plus blog, FAQ and attribution. Either index the whole page before the long reading begins, or name it for what it is: a guide to the explanatory sections.

**P3 · Small register defects remain.** Non-link error prose is set in link colour in both `FrontDoor` and `LiveStatusStrip`; several prose asides still use mono uppercase (“Field notes and analysis”, the hazard count line), even though the run aside was correctly returned to sentence style; section heading sizes alternate between `text-lg`, tagline and `lg:text-2xl` without a corresponding change in rank; `/live` and `/alerts` are offered repeatedly with changing labels while a resident's most likely first task — “show my district” — still requires leaving through the generic map action.

## What improved since 2026-10-26

- Hero small-print contrast is now computable and test-pinned over the worst-case photograph.
- Figure values use tabular numerals, and the run aside is no longer prose in a mono costume.
- Severity, alert levels and confidence are explicitly separated, including `NO_ALERT` vs `NORMAL` and “confidence is not a probability.”
- The FrontDoor alerts/blog errors no longer interpolate raw error values in the panels the clarify pass touched.
- The mobile-only duplicate evidence pointer is gone.
- The status verdict remains the strongest element on the page: one sentence, three honest states, colour never carrying the meaning alone.

## Assessment B evidence

- `npx impeccable detect --json` on `FrontDoor.tsx`, `LiveStatusStrip.tsx`, `StatusVerdict.tsx` and `HeroCinematicBackground.tsx`: `[]`, exit 0.
- `node scripts/check-craft-floor.mjs --json`: 259 files scanned, 0 findings.
- `npm run check:design:source`: 0 outstanding, 0 waived, 0 new.
- Targeted Jest (`heroContrast`, `FrontDoor`, `i18n`): 37/37 tests pass. The run still emits React `act(...)` noise from the `useWebFrame` rAF state loop, which is test evidence of the animation architecture Assessment A flags, not a separate user-facing failure.
- The built static document contains the h1, all 11 new editorial h2s and the FAQ heading, so the clarified text is present without JavaScript.

The clean detector result should not be read as a clean bill of health: every P0/P1 above is a content, ordering, state or affordance judgment in code the mechanical rules either allow or do not inspect.

## Recommended order

1. `clarify` + `harden`: remove “live emergency/real-time” claims; localize and map the status-strip error; make every recovery target 44px.
2. `distill` + `layout`: replace the bento shelf/grid and quick-action duplication with a visible hazard index, and promote the action pathway to immediately after the verdict.
3. `typeset`: impose a 65–75ch editorial measure and restore the 80px section rhythm.
4. `optimize`: stop preloading the whole hero carousel on normal connections; label the AI imagery illustrative or replace it with a static, attributable visual.
5. `polish`: remove the status fade-from-zero, redundant hero depth signals, residual mono prose and partial TOC promise; hold merge until the owner re-reads the new Bengali.

## Not tested

Actual render at 320/360/390/768/1440px; first-viewport geometry in English and Bengali; 125%/200% text scaling; keyboard traversal through the hero and horizontal hazard shelf; screen-reader announcements when the status artifact changes; dark ground; print; real low-end Android frame cost for the carousel/glow/blur; Core Web Vitals. No browser binary was available in this environment.
