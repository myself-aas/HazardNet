# NASA Horizon Design System integration — technical report

**Workstream:** adopt NASA's design system as HazardNet's global UI/UX, as a personal preference
expressed by the owner ("global ui ux same as nasa.gov, after scraping all of their design tokens,
integrate them").

**Date:** 2026-09-18 · **Status:** complete for the token system and application chrome; the
front-door composition (see §7) is proposed and awaiting a decision.

---

## 1. What was found

`nasa.gov` itself is not the design system; it is a consumer of one. Two facts from the
investigation changed the approach:

1. **NASA publishes the tokens.** [`nasa/hds-core`](https://github.com/nasa/hds-core) is the Horizon
   Design System (HDS), the CSS-only design system NASA maintains for `*.nasa.gov` sites. It carries
   `tokens.json` — the values *and* a usage rule per token — and ships **CC0-1.0** (public domain
   dedication, work of the United States Government), with Inter and DM Mono under the SIL Open Font
   License.
2. **The tokens are rules, not swatches.** NASA's descriptions are normative: red means
   *go somewhere*, blue means *do something here*, neither is for dataviz, orange is a status accent,
   green never brands anything. Scraping the hexes without the rules would have produced a costume.

Scraping the live site was attempted first (`curl` to `nasa.gov` returns no route from the sandbox;
`fetch_page` returns the markup) and produced the *composition* reference — image-led cards with
reading time and dates, a masthead of uppercase section links, a footer of institutional links. The
*values* came from the published token source, which is both more accurate and more honest about
where the design comes from.

**One deliberate scope limit.** HDS's `AGENTS.md` states the system is built for NASA sites and is
"not general-purpose" — it is not meant to be consumed as a package by third parties. So this
integration **vendors the token source and compiles it locally**; it does not add `@nasa-hds/*` as a
dependency, does not pull in USWDS, and does not pretend HazardNet is a NASA property. The tokens are
facts about a design, and the licence permits using them.

## 2. What was built

```
data/design/nasa-hds/tokens.json          verbatim copy of NASA's token source (CC0-1.0)
data/design/nasa-hds/PROVENANCE.md        repository, revision, licence, what is taken and what is not
scripts/import_nasa_tokens.mjs            compiler + drift gate (--check)
frontend/src/styles/nasa-hds.css          GENERATED — 174 custom properties, NASA's own names
frontend/src/index.css                    token layers remapped onto NASA's values
docs/design-system/MASTER.md              lineage, usage rules, measured contrast
__tests__/nasaTokens.test.js              16 tests over the pipeline and the wiring
```

The compiler is deterministic (no clock, no ordering drift), resolves HDS's `{reference}` syntax
into literal values, resolves composite typography styles into usable `font` shorthands, and skips
only what this product does not consume. `--check` is a byte comparison, so a hand-edited token or a
vendored update without a regenerate fails CI:

```yaml
# .github/workflows/ci.yml — Derived artifacts describe their committed inputs
node scripts/import_nasa_tokens.mjs --check
```

174 properties: colour, spacing, breakpoints, border width + the two radii, focus mechanics, layout
widths and gutters, line-height, letter-spacing, font-weight, font-size, three font families, 16
composite typography styles, the categorical dataviz palette (light + dark, plus HDS's own
recommended five-series assignment), and the yellow/orange sequential ramps.

**Why vendored rather than fetched:** a build that reaches the network to decide a colour is a build
that fails offline and a design that changes under a commit. Pinning the source to a revision keeps
the diff reviewable — a NASA change arrives as a visible token diff, not a silent dependency bump.

## 3. How it was integrated (and why it needed no component rewrite)

The application already had a three-layer token architecture — primitives → semantic → component —
with every component consuming Layer 2/3 only. That is what made a global restyle possible without
touching hundreds of call sites: the *names* stayed and the *values* changed.

| Layer | Before | After |
| --- | --- | --- |
| Primitives | local amber/teal/sky/emerald ramps | new Layer 1b: `--hn-hds-*` referencing NASA's `--hds-*` |
| Semantic `--primary` | amber `#f9a825` | NASA red `#f64137` ("go somewhere") |
| Semantic `--accent` | slate | NASA blue `#1c67e3` ("do something here") |
| Semantic `--background` / `--foreground` | slate-50 / slate-900 | HDS `carbon-05` / `carbon-90` |
| Semantic `--muted-foreground`, `--text-subtle` | slate-600 | HDS `carbon-60` (7.1:1; `carbon-50` is 4.46:1 and therefore excluded from text) |
| Semantic `--border` / `--input` | slate-200 / slate-300 | `carbon-20` / `carbon-50` (control boundaries clear 1.4.11's 3:1) |
| `--radius` and the whole radius scale | 0.75rem + `calc()` steps | HDS's two radii — 0px surfaces, 2px controls |
| `--panel-radius`, `--panel-shadow` | 1.25rem, soft double shadow | 0px, `0 1px 2px` (HDS is flat; depth comes from 1px rules) |
| Chart palette `--chart-1…5` | mixed local hues | HDS categorical assignment (brand red/blue are barred from dataviz) |
| Warm ramp (`amber-*` ×600 sites) | Tailwind defaults | NASA's yellow + international-orange sequences |
| Type stack | Noto Sans / Playfair Display / JetBrains Mono | **Public Sans / Inter / DM Mono** — NASA's three families |
| Focus ring | 2px solid amber, 2px offset | **1px dashed `carbon-60`, 1px offset** (HDS), `carbon-30` on dark surfaces |

Beyond the token layer, three sweeps changed call sites:

1. **Brand fills** (284 replacements across 53 files): `#f9a825` → `bg-nasa-red`, hover `#d08305` →
   `bg-nasa-red-shade`, interaction borders/rings/accents → `bg|border|ring|accent-nasa-blue`, and
   the 22 literal `'Playfair Display'` font strings inside Leaflet popup HTML →
   `var(--hds-font-family-heading)`.
2. **The masthead** — the header is now flat opaque white with a 1px `carbon-20` rule (no backdrop
   blur), section links use HDS's `metadata` typography (uppercase 12px/700/+0.025em) with a 2px rule
   that turns red for the current section, and the locate-me control became a blue control.
3. **Off-system teal** → NASA blue, and the amber hover-paired button fills → NASA CTAs.

The three font families are self-hosted through `@fontsource` (no third-party font request; the
service worker caches them for offline use), and the typefaces are registered under the exact names
NASA's tokens reference (`'Inter'`, `'Public Sans Web'`, `'DM Mono'`) so a `var()`-driven stack
resolves rather than silently falling back.

**What deliberately did not change.** HazardNet's five-step hazard severity ramp stays product
semantics: NASA's three-colour status set cannot express five hazard levels, the values are asserted
by map/legend tests, and the ramp carries meaning the brand palette does not. It is now *derived
beside* NASA's palette rather than invented against it — the moderate step is aligned to HDS's
status orange. Also unchanged: every route, every component API, every behaviour.

## 4. Verification

| Gate | Result |
| --- | --- |
| `scripts/import_nasa_tokens.mjs --check` | 174 tokens match the vendored source |
| `__tests__/nasaTokens.test.js` | 16 passed (byte-equality, determinism, fail-loud cases, token existence, rule checks) |
| `npx tsc --noEmit -p frontend/tsconfig.json` | 0 errors |
| `npm run lint:eslint` | 0 errors |
| `npx jest --ci` | **81 suites / 942 tests passed** (926 before this workstream, +16) |
| `npm --prefix frontend run build` | succeeds; prerender writes all routes |
| `build_content_engine --check` | 75 routes match their inputs |
| `build_model_performance --check` | 5 episodes match their reports |
| `build_freshness_artifact --check` | artifact matches its inputs |
| Playwright (local, both projects) | **46 passed** — smoke + critical paths, overflow 320–1280, the GIS map and district-search flow on `/`, no JS errors |
| Rendered font probe | body resolves to `"Public Sans Web"`, `h1` to `Inter`, CTA `border-radius: 0px` |

**What verification caught.** Writing the suite was not ceremony — it found two real defects that
would otherwise have shipped silently: `--hds-font-family-mono` and `--hds-color-black` do not exist
(NASA names them `code` and `carbon-black`), so two custom properties were invalid and silently
inherited their values. The suite also found stale `'JetBrains Mono'` references in the data-readout,
badge and print blocks of `index.css` — sections that no grep of the token layers would have reached.
That is the argument for asserting *undefined-token* references rather than only asserting the tokens
you expect to exist.

Rendering found three more, each invisible to the unit suite:

- **The masthead overflowed a 1280px viewport by 62px.** Uppercase metadata links are ~30% wider
  than the sentence-case links they replaced, so the e2e overflow test failed exactly at the `xl`
  breakpoint boundary. Fixed by scaling the nav label back to 11px below 2xl (`0.6875rem`,
  tracking `0.02em`) while keeping HDS's full 12px/`+0.025em` composite where there is room, and by
  tightening the masthead paddings. Red is still the current-section colour.
- **`/status` overflowed 320px by 81px** — `scripts/build_freshness_artifact.mjs` inside inline
  `<code>` is one unbreakable token. Inline `code`/`kbd`/`samp` now break rather than widening the
  page, and the two bare tables on that panel scroll inside the panel like the third one already did.
- **The `/model-performance` H1 said "four historical episodes" while the table beneath it listed
  five.** The earlier count-derivation work missed this one string. It is derived now, and the test
  that asserted the literal ("four") was the reason the bug survived — it was rewritten to derive the
  count from the artifact. This is out of the design-system's scope, but it is exactly the kind of
  claim the audit flagged, so it was fixed rather than filed.

**Honest caveats.** (a) The 3.1:1 contrast of white on `nasa-red` is NASA's own choice; it clears AA
for large/bold labels but not for a 14px one, so `--primary-strong` (the HDS red shade, 7.0:1) exists
for small-label CTAs and the reasoning is recorded in MASTER.md. (b) Playwright runs against a
Chromium built for Amazon Linux in this sandbox (`@sparticuz/chromium`), not the CI browser build.
(c) Fewer than a dozen amber surfaces outside buttons (decorative chips, one avatar tint) still use
HDS yellow/orange deliberately.

## 5. Files touched

```
data/design/nasa-hds/tokens.json           NEW  vendored NASA token source (CC0-1.0)
data/design/nasa-hds/PROVENANCE.md         NEW  provenance, licence, scope, regeneration
scripts/import_nasa_tokens.mjs             NEW  token compiler + --check gate
frontend/src/styles/nasa-hds.css           NEW  generated: 174 custom properties
__tests__/nasaTokens.test.js               NEW  16 tests
frontend/src/index.css                     token layers, @theme keys, fonts, focus, nav-link class
frontend/src/components/Navbar.tsx         flat masthead, HDS metadata links, red current-section rule
frontend/src/components/ChatBot.tsx        CTA + FAB onto the NASA palette
frontend/src/components/LiveMapView.tsx    12 popup/label font strings → HDS heading token
frontend/src/components/map/mapPrimitives.ts, hooks/useMapMeasurements.ts, hooks/useLeafletMap.ts
frontend/src/utils/pdfExport.ts            print stack → DM Mono
frontend/index.html                        font preload note
docs/design-system/MASTER.md               NASA lineage, usage rules, measured contrast
.github/workflows/ci.yml                   token drift gate
~50 further components                      mechanical palette sweep (284 replacements)
```

## 6. Regenerating / moving to a newer NASA revision

```bash
node scripts/import_nasa_tokens.mjs                       # rebuild frontend/src/styles/nasa-hds.css
node scripts/import_nasa_tokens.mjs --check               # CI gate
# newer NASA revision:
#   copy nasa/hds-core's tokens.json over data/design/nasa-hds/tokens.json,
#   update the revision table in PROVENANCE.md, regenerate, run the suite, commit.
```

## 7. Open decision — the front door

The token system is global, but `/` is still a full-screen GIS console: it has **no `h1`, no
identity or mandate line, no dated knowledge products, and no authority boundary** — the gaps the
owner's own benchmark audit of `hazardnet.live` identified against UN / Red Cross / WMO / NASA
references. NASA's own front door is editorial: hero, dated and attributed cards, sectioned
navigation, an institutional footer.

Two routes to close that gap, and they are not equivalent:

- **A — Restyle `/` in place.** Keep the GIS stage as the hero, but add the identity line, trust
  strip, live-alert summary, methodology teaser, knowledge products and authority boundary beneath
  it. The existing e2e contracts (map + district search on `/`) keep working; the page gains an `h1`
  and the missing sections.
- **B — Move the console to `/live`.** `/` becomes fully editorial and the console moves, as the
  audit recommends. This rewrites e2e contracts and changes every deep link, so it needs its own
  workstream.

Route A is the smaller, reversible change and preserves the tested behaviour; Route B is the more
faithful reading of the audit. **Awaiting the owner's choice** — the token system is complete and
gate-green either way.
