# Plan

Remediate the frontend against the four-lens re-audit (`docs/audits/2026-09-30-frontend-reaudit.md`, grades Design 65/D, AI Slop A, Accessibility C, token compliance 88.0% vs a 90% gate). The work is sequenced into six sessions ordered by impact-per-unit-risk per `design-auditor`'s fix-session rules (max 30 fixes per session; structural changes need a decision, cosmetic ones are auto-fix). Sessions 1–4 and 6 are mechanical and can ship independently; Session 5 is structural and is **blocked on a product decision**, so it is planned last and not started.

## Scope

**In:**

- `frontend/src/**` — 33 pages / 105 components / 19 hooks / 38 lib / 5 services / 3 CSS, ~68k LOC
- `frontend/src/index.css` — the semantic token layer, and the only correct place for HazardNet brand decisions (`nasa-hds.css` is **generated**, do not edit)
- `frontend/DESIGN_SYSTEM.md` — updated in the same commit as any token change
- Contrast, dialog semantics, token compliance, typography/density, navigation/motion, Dashboard restructure
- Per-session commits and pushes to `arena/01a0f140-hazardnet`

**Out:**

- `backend/`, `api/`, `serverless/`, the data pipeline and deployment-health findings (74 rows vs 128, 343.6 h forecast age, 0 published alerts — tracked separately in `docs/codebase/CONCERNS.md` §7; Q13/Q14 remain open)
- `nasa-hds.css` (generated) and `__tests__/nasaTokens.test.js` (pins `--hds-color-nasa-red` to `#f64137`)
- `style-src 'unsafe-inline'` in `backend/security/csp.js` — the user confirmed the documented rationale is acceptable; 162 `style={{…}}` + 69 `style="…"` sites depend on it
- Visual/responsive verification — **no browser exists in this sandbox** (Playwright has no browsers, the Chromium CDN is blocked). Responsive Design is scored 75 unverified and finding 2.4 (line length) is deferred until a browser-capable pass.

## Action Items

- [ ] **Discovery & baseline**: recover the environment (`npm ci` at the repo root, `pip3 install --break-system-packages pytest pyyaml`), confirm HEAD is `c16c687` with a clean tree, and record the baseline gate set: `npx jest` (132 suites / 1321 tests), `npx tsc -p frontend/tsconfig.json --noEmit`, `npx eslint .` (0 errors / 684 pre-existing warnings), `npm run check:design` (3439 outstanding / 1 waived / 0 new), `npm run check:bundle` (1424.6 kB gzip), `python3 -m pytest scripts/tests -q` (119 passed), `npm run check:paths`. Re-run the token-compliance scan and record 88.0% as the Session 1 entry point.

- [ ] **Session 1a — primary action labels on red (12 sites)**: replace `text-carbon-black` with `text-white` on every `bg-nasa-red` ground. Verified sites: `pages/Dashboard.tsx:640` ("Pin Selected District"), `:855`, `:1035`; `components/PrintPreviewModal.tsx:374` (and the sibling icon at `:377`); `components/ErrorBoundary.tsx:64`; plus the sites in `components/district/DistrictBriefBody.tsx`, `DistrictBriefHeader.tsx`, `pages/AdvisoriesPage.tsx`, `pages/DownloadCenter.tsx`, `components/RegionSelector.tsx`, `components/ui/expand-map.tsx`. Use `Dashboard.tsx:530` as the in-file reference — it already pairs `bg-nasa-red` with `text-white`. Takes the label from 2.14:1 to 9.06:1 via the existing `--primary-foreground`. Do **not** touch the 36 uses on `bg-white`, `bg-amber-400/500`, or `group-hover` grounds — those are already ≥4.5:1.

- [ ] **Session 1b — forbidden greys and hardcoded hex**: `text-carbon-30` prose → `text-carbon-60` at `pages/Dashboard.tsx:628` and `:960`, and remove `line-clamp-2` at `:628` or add a "show more" affordance (the truncated remainder is otherwise unreachable). Then `text-carbon-40`/`text-carbon-50` → `text-carbon-60` at the 109 un-overridden sites of the 150 total — re-verify each of the 41 that already carry a `dark:text-carbon-*` override before changing it. Finally, hardcoded hex → tokens: `text-[#ad6d04]` ×8 and `[#ea6f24]` ×5 → `--hn-brand-red-dark`/a documented hover token, and `text-[#ff0000]` ×2 → `nasa-red` (stale pre-v2 red).

- [ ] **Session 1 validation**: add a computed-contrast unit test asserting the primary-action pairing and `--hn-hds-ink-soft` on white (7.09:1), modelled on the existing `__tests__/staticShellContrast.test.js`. Then re-run jest, `tsc --noEmit`, eslint and `check:design`, confirming **0 new** `check:design` offenders. Gate: no contrast failure remains on any text node.

- [ ] **Session 2 — dialog correctness (one primitive)**: lift the `MenuDrawer.tsx:66-80` pattern (Escape, focus save/restore, body overflow lock) into the shared `components/ui/BottomSheet.tsx:34` and add a Tab-cycle interceptor plus `inert` on the shell so `aria-modal="true"` stops promising containment the code does not deliver. Add the sibling modals' `useEffect` keydown listener to `PdfExportConfigModal.tsx:277`. Add `role="dialog"`, `aria-modal` and `aria-labelledby` to `DisasterDetailModal.tsx` and `SavedAssessmentsModal.tsx`. Sweep `aria-labelledby` across the remaining 7 `role="dialog"` sites (`ChatBot.tsx:202`, `CommandPalette.tsx:499`, `EventReportModal.tsx:81`, `GlideResourcePopover.tsx:58`, `MenuDrawer.tsx:107`, `PrintPreviewModal.tsx:239`, `map/DistrictForecastCard.tsx:51`). Gate: keyboard-only walk through all 9 dialogs never reaches the background.

- [ ] **Session 3 — token compliance (88.0% → ≥90%)**: declare semantic aliases in `frontend/src/index.css` `@theme inline` (~line 690) for the families that carry meaning — `rose`→`destructive`, `emerald`→`success`, `blue`→`accent`/info — then either tokenise or delete the rest, clearing the 740 uses across `emerald`×222, `rose`×219, `blue`×177, `sky`×58, `cyan`×18, `red`×15, `indigo`×8, `yellow`×8, `teal`×6, `orange`×5, `purple`×4. Convert `bg-nasa-red` (156 uses) → `bg-primary` **only** where it means "primary action"; leave badge instances for Session 5 finding 2.5. Route the 30 inline `<svg>` through `MaterialIcon` (225 uses / 59 files is the established family). Update `frontend/DESIGN_SYSTEM.md` in the same commit. Gate: compliance ≥90%, verified by re-running the scan.

- [ ] **Session 4 — typography and density**: `text-[10px]` ×146 and `text-[11px]` ×157 → `text-xs`; `text-[9px]` ×9 and `text-[8px]` ×4 → 12px floor or delete (they are all in dense data tables, so raise the size rather than dropping the label). Demote weight on non-numeric text — 1326 heavy vs 262 light weights, `font-black`/`font-bold` → `font-medium`/`font-semibold`. Replace `transition-all` ×236 with explicit property lists. Collapse the 9 distinct `rounded-*` values onto the scale, worst case `Dashboard.tsx:660` (`rounded-lg sm:rounded-[20px] md:rounded-[28px]`). Convert `space-x/y` ×500 → `gap-*` (1182 `gap-*` uses already exist as the convention). Expect a wide diff — review per-component, not per-line.

- [ ] **Session 6 — navigation and motion** (run before Session 5, which is blocked): add a `useEffect` on `location.pathname` in `App.tsx:236-315` that scrolls to top and focuses `#main-content` (the anchor target already exists). Associate form errors with fields across the 71 inputs — `id` + `aria-describedby` + `aria-invalid` per field, and focus the first invalid ref on submit failure (currently 3 `aria-invalid`, 2 `aria-describedby`, 140 catch blocks). Replace `window.prompt` at `components/blog/RichTextEditor.tsx:112,121` with a labelled input and URL validation, composed from `BottomSheet` or `GlideResourcePopover`. Raise `active:` states from 24 to parity with the 576 hover sites. Replace the 14 raw `ease-*` uses (incl. 5 banned `ease-in`) with the documented easing tokens (currently used at only 9 sites).

- [ ] **Session 5 — first-viewport restructure (BLOCKED, needs a product decision)**: move the map-stage height control out of `pages/Dashboard.tsx:765-790` — raw pixel buttons `📐 850px`, `Compact`, `Standard`, `Tall`, `Dynamic`, with the `📐` emoji at `:768` — into a "Map options" disclosure or persist it as a preference with a single toggle, and replace the emoji with `<MaterialIcon name="straighten" />`. Move the ServiceWorker cache, GIS satellite tile cache and "Granular Data Report" panels behind a "Diagnostics" disclosure or into `/status`. Restore the first viewport to: where you are, your saved districts, one next action. Reserve crimson for the single primary action per surface (2.5) and triage the 111 eyebrow/count-strip uses (1.5/1.6). **Do not start until the decision below is answered.**

- [ ] **Documentation, risk mitigation and rollout**: after each session, update `frontend/DESIGN_SYSTEM.md` for token changes and append a resolution log to the re-audit report. Post-implementation review per the audit skill: check semantic–visual sync (does `rose`→`destructive` read the same everywhere), specificity conflicts in `index.css`, design-token leaks (new arbitrary values), and visual-balance shifts. Rollback is per-session: each session is one commit on `arena/01a0f140-hazardnet`, so `git revert` of a single commit restores the prior state. **Do not ship visual changes without a browser pass** — re-run Responsive Design (category 7, 75 unverified) and finding 2.4 (line length) in a browser-capable environment first.

## Open Questions

**All three answered 2026-09-30:**

1. **Crimson stays reserved for the single primary action on each surface (2.5).**
   Consequence for Session 3: only primary-action instances of the 156 `bg-nasa-red`
   uses convert to `bg-primary`; the status-badge instances move off crimson in
   Session 5.
2. **The 303 sub-11px uses are retained** — they sit mostly in dense data tables,
   where the audit's own density target for dashboards is "high". Session 4 drops
   the 12px-floor task; audit finding 3.9 is closed as accepted risk.
3. **Diagnostics move to `/status`** — not a Dashboard disclosure. Session 5's
   Dashboard work is therefore a removal, not a reorganisation.

---

## Session log

### Session 0 — recovery (complete)

The sandbox reset rewound the branch ref to `674c03c` twice during planning.
Recovered both times via `git fetch origin` → `git reset --hard
origin/arena/01a0f140-hazardnet` after confirming the working tree was
byte-identical to the remote commit. **Do not rebuild from scratch.**

### Session 1 — contrast (complete, commit on `arena/01a0f140-hazardnet`)

**Baseline (all green, identical to the recorded values):** jest 130 suites /
1321 tests · `tsc --noEmit` exit 0 · eslint 0 errors / 684 warnings ·
`check:design` 3439 outstanding / 1 waived / 0 new · `check:paths` 0 offenders ·
`check:bundle` 1424.6 kB gzip PASS · pytest 119 passed.

**Delivered** — 25 files, 63 insertions / 63 deletions, pure token swaps with no
line-count change:

- **1a — primary action labels (13 sites).** `text-carbon-black` → `text-white`
  on every crimson ground: `ErrorBoundary.tsx:64`, `PrintPreviewModal.tsx:374`
  and its icon at `:377`, `blog/RequireSuperAdmin.tsx:33`,
  `AdvisoriesPage.tsx:476`, `Dashboard.tsx:618,640,774,855,950,1035`,
  `DownloadCenter.tsx:45,309`. Takes the label from **2.14:1 to 9.06:1**.
  `Dashboard.tsx:530` was already correct and served as the in-file reference.
- **1b — forbidden text greys (33 sites).** `text-carbon-40`/`text-carbon-50` →
  `text-carbon-60` on verified light grounds only, plus two `carbon-40` icons
  that failed the 3:1 non-text threshold. Two sites whose ground flips dark in
  dark mode (`WeatherBadge.tsx:38`, `ui/BottomSheet.tsx:92`) gained a paired
  `dark:text-carbon-40` so dark mode does not regress.
- **1b — off-system hex (19 sites).** `text-[#ad6d04]` → `text-amber-700`
  (documented 5.5:1 on white, vs 4.23:1 raw) · `hover:bg-[#ad6d04]` →
  `hover:bg-nasa-red-shade` (aligns with every other crimson button) ·
  `text-[#ea6f24]` → `text-amber-500` and `border-l-[#ea6f24]` →
  `border-l-amber-500` (both already aliased to
  `--hds-color-international-orange`, so zero visual change) · `#ff0000` →
  `nasa-red` (4.00:1 → 9.06:1, and the correct post-v2 brand red).

**Validation added:** `__tests__/primaryActionContrast.test.js` — 6 tests
covering the crimson-ground pairing, the `--primary-foreground` resolution, the
carbon-50/60 token-semantics arithmetic, the light-on-dark greys that must *not*
be darkened, and the retired hexes. Negative-controlled: a deliberately
reintroduced `bg-nasa-red … text-carbon-black` fails the suite.

**Corrections to the audit found while executing (recorded, not hidden):**

- **Finding 3.2 is a false positive.** `Dashboard.tsx:628`'s `text-carbon-30`
  prose sits inside a `bg-carbon-90 … text-white` panel, so it is **9.12:1**,
  not 1.96:1. Same for `:960`, `:621`, `:953`. The audit computed carbon-30
  against white without checking the ground. **No carbon-30 text was changed** —
  a blanket `carbon-30 → carbon-60` would have broken ~18 dark surfaces.
- **The grey-token count was overstated.** Of 150 `text-carbon-40`/`50` uses,
  37 were `dark:text-carbon-*` variants already correct in light mode, and 12 sat
  on genuinely dark grounds where carbon-40/50 is the right choice (carbon-60 on
  carbon-90 is 2.52:1 — darkening them is a *regression*). 33 sites were real
  light-ground failures.
- **`line-clamp-2` at `Dashboard.tsx:628` deferred to Session 4.** It is a layout
  change, not a contrast one, and the contrast premise above no longer applies.
- The remaining `#ea6f24` uses are decorative data-viz swatches and gauge fills
  (3.09:1, clearing the 3:1 non-text threshold) plus the token definitions in
  `design-system/tokens.ts` — left alone deliberately.

**Gate results after the change:** jest **133 suites / 1327 tests** (the +1 suite
/ +6 tests is the new file) · `tsc --noEmit` exit 0 · eslint 0 errors / 684
warnings (unchanged) · `check:design` 3439 / 1 / **0 new** ·
`check:paths` 0 · `check:bundle` 1424.6 kB PASS (no bundle impact) · pytest 119.
`check:design`'s low-contrast counter did not move: it scores markdown prose, not
Tailwind class tokens, so it is not a Session 1 signal.

**Not done in Session 1 (deliberately):** no browser exists in this sandbox, so
the visual result of these swaps is unverified. The contrast is computed from
token hexes, not sampled from a render.
