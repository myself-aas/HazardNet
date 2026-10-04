# Device verification script — web + native (2026-10-04)

The design-system audits left a set of findings that could not be closed from source: they describe
what a *device* does. This is the executable script for those items, and the record of everything in
them that has already been checked off-machine.

Two kinds of evidence appear here:

- **Automated (CI)** — the check runs on every build and fails on regression. Run them with
  `npm run check:device` (web) and `npm --prefix apps/mobile run test:rn -- deviceConditions` (native).
- **Hardware pass** — a human on a real device, with the exact steps and the expected result. A row
  is only "verified" once the *Observed* column is filled in for the device named.

## 1. Already verified off-machine

| Item | How it was checked | Result |
|---|---|---|
| `--navbar-height` carries the safe-area inset (`V-P1-2`) | Emulated 390x844 viewport, then set `--navbar-height: calc(3.5rem + 47px)` in the page and re-measured: the landing hero's top padding went 76px → 123px and the console header's 64px → 111px, both exactly +47px, with no horizontal overflow | **Pass** — the surfaces move with the variable, which is the property the fix claims |
| Phone first viewport carries the proof (`H-P1-3`) | Emulated 360x740 / 390x844 / 430x932 at DPR 3: H1 at y≈169, primary CTA at y≈427-431, evidence pointer at y≈583-587, all above the 740-844 fold; the proof card itself starts at y≈917 | **Pass** — claim, action and one checkable fact are in the first viewport |
| Text scaling does not break the layouts | Emulated `html { font-size: 20px }` (125%) at 390x844 and `24px` (150%) at 320x568 on `/` and `/live` | **Pass** — zero horizontal overflow at both, CTA and pointer grow (48 → 79px, 44 → 96px) rather than clipping |
| Hero art direction is real art, not an upscale (`L-P2-4`) | The four 9:16 renders are 768x1376 (≈2x of a 390x844 hero at DPR 2, 1.97 px/CSS px) and are selected by `@media (max-width: 639px) and (min-resolution: 2dppx)`; a network trace at 390x844 DPR 3 shows the portrait files requested and nothing else from `hero-carousel` | **Pass** — see `frontend/src/styles/hero-media.css` |
| Native safe areas, font scaling, Reduce Motion, Bengali chrome | `apps/mobile/__tests__/deviceConditions.test.ts` (4 tests): safe-area use confined to the shell primitives, no `allowFontScaling={false}` anywhere, all text through the shared `Text`, Reduce Motion reachable from one hook, tab bar + accessibility hints present in both locales | **Pass in CI** |
| Native contrast, type roles, touch floor | `apps/mobile/__tests__/nativeMeridianParity.test.tsx` (light / dark / OLED / high-contrast × status roles, `TOUCH_MIN`, Large + Bold preferences) | **Pass in CI** |

## 2. Hardware pass

Devices that cover the matrix: **one notched iPhone** (Dynamic Island or notch, iOS 17+), **one
Android with gesture navigation** (API 33+, e.g. Pixel 6a), **one small/low-end Android** (2 GB RAM,
720p), **one font-scale test** (iOS "Larger Text" at maximum, Android "Font size" 130%+ and "Bold
text" on), **one Bengali device** (system language Bengali, or the in-app language switched to
বাংলা).

Fill in the table; an empty *Result* means unverified.

| # | Item | Steps | Expected | Device | Result |
|---|---|---|---|---|---|
| 1 | Web safe areas (`V-P1-2`) | Open `https://hazardnet.live/` and `/live` on the notched iPhone (Safari) and the Android (Chrome). | The navbar and the console's floating header sit *below* the status bar / cutout; nothing is hidden behind the home indicator at the bottom of the map. | | |
| 2 | Web first viewport (`H-P1-3`) | On each phone, load `/` in portrait. | The H1, the "Open the live map" button and the "This run: …" line are all visible without scrolling. | | |
| 3 | Web console on a phone (`P1-4`, `P1-7`) | Open `/live`, then `/alerts`, `/hazards`, `/divisions`. | No table as the primary content; the map fills the viewport without a horizontal scrollbar; the URL bar does not overlap content on scroll. | | |
| 4 | Web text scaling | iOS Settings → Accessibility → Display & Text Size → Larger Text → maximum; Android → Display → Font size → largest. Reload `/` and `/live`. | Text grows, no clipped or overlapping labels, no horizontal scroll; buttons stay tappable. | | |
| 5 | Native VoiceOver traversal | Launch the app with VoiceOver on: Today → Alerts → Alerts detail → Map → Map tools → Saved → Saved place → More → advisories. | Every control is announced with a name and a role; the map's controls are reachable; the alert list announces each row's hazard, district and time once; actions (swipe on an alert, dismiss the banner) are announced and reachable as separate elements. | | |
| 6 | Native TalkBack traversal | Same route set with TalkBack on the Android device. | Same as #5, plus the back gesture does not trap focus inside a sheet. | | |
| 7 | Native extreme Dynamic Type / Bold Text | Android: font size 130% + Bold text; iOS: maximum Larger Text + Bold Text. Walk the same route set. | No truncated headline, no text under a fixed height, no control smaller than 44pt/48dp, no overflow off-screen. The in-app Large/Bold preferences stack on the OS setting rather than replacing it. | | |
| 8 | Native Bengali | Switch the in-app language to বাংলা (More → language) on both devices. | Tab bar, screen titles and the accessibility hint render in Bengali with correct conjuncts and no tofu boxes. Body copy that is still English is expected (109 of 191 keys are translated — see §3). | | |
| 9 | Native safe areas / navigation modes | Run both Android navigation modes (3-button and gesture) and a foldable or large-screen device if available. | Tab bar clears the gesture pill; content is not clipped by the camera cutout in either orientation; the map's bottom controls stay reachable. | | |
| 10 | Low-end map performance | On the 2 GB 720p Android: open Map, pan for 30 s with the divisions choropleth on; then open Alerts and scroll 200 rows. | Map stays interactive (no sustained <30fps), the app does not fire a low-memory kill, the banner/foreground notification appears without dropping frames. | | |
| 11 | Web export paths on a phone | From `/live`, run the PDF export and open the result in the phone's viewer. | The sheet is A4, light-pinned (never dark), and the map snapshot inside it renders. | | |

## 3. Known, recorded gaps (not defects hidden by this script)

- **Mobile translation backlog.** 109 of 191 English keys are translated to Bengali. The chrome is
  complete; the remaining keys are listed in
  `docs/audits/2026-10-03-frontend-design-system-audit.md` §10, and
  `apps/mobile/__tests__/deviceConditions.test.ts` pins the count so it can only grow.
- **The native app is not the whole web IA.** Roughly thirty of the 52 web routes have no native
  counterpart by design (`docs/MOBILE_AUDIT_AND_REDESIGN.md` §5.3). Web-only surfaces stay web-only;
  row 11 exists so the export path is still checked on a phone browser.

## 4. Running the automated half

```bash
# Web checks (tokens, design ratchet, prose, icons, summary artifact, fonts, bundle)
npm run check:tokens && npm run check:design && npm run check:prose && npm run icons:check \
  && npm run check:events-summary && npm run check:fonts && npm run check:bundle

# Native checks
npm --prefix apps/mobile run test:rn -- --runInBand --forceExit
npx tsc --noEmit -p apps/mobile/tsconfig.json
```
