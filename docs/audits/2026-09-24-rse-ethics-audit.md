# RSE Ethics & Conflicts-of-Interest Audit — HazardNet public surfaces

**Date:** 2026-09-24
**Scope:** the public GitHub repository and the live site (hazardnet.live), audited
against the *Remote Sensing of Environment* Guide for Authors — **Ethics in Publishing
& Policies** (Elsevier: https://www.sciencedirect.com/journal/remote-sensing-of-environment/publish/guide-for-authors#ethics-and-policies).
**Reason:** the HazardNet research article manuscript is being prepared for submission to
RSE. Nothing on the public repo or the site may violate journal ethics or create a
conflict of research interests.

This document records what was found, what was taken down or cleaned, and what the
corresponding author must still do **in the manuscript itself**.

---

## 1. RSE policies applied

From the Guide for Authors (ethics & policies):

1. **Submission declaration** — the work must not be published previously (except as a
   preprint, abstract, lecture, academic thesis or registered report) and **must not be
   under consideration elsewhere**; publication must be approved by all authors and the
   responsible authorities.
2. **Authorship** — all authors must meet the authorship criteria; one corresponding
   author; changes only before acceptance with editor approval.
3. **Declaration of competing interests** — disclose any financial/personal relationships
   (employment, consultancies, stock, honoraria, **patents**, grants, editorial roles)
   that could inappropriately influence the work; state "nothing to declare" if none.
4. **Funding** — declare all funding sources, or state that the research received no
   specific grant.
5. **Declaration of generative AI use** — required statement in a new section before the
   references: name the tool and the reason of use; after use, the author(s) reviewed and
   edited the content and take full responsibility; **AI may never be an author**; authors
   are accountable for AI output including fabricated references; AI-created or
   AI-manipulated **primary research images are forbidden**.
6. **Image integrity** — no enhancing/moving/removing/introducing features in images;
   disclose nonlinear (gamma) adjustments.
7. **Jurisdictional claims / maps** — neutral on territorial disputes; every map must note
   that **"map lines delineate study areas and do not necessarily depict accepted national
   boundaries"** and show only the study area (no larger location map); affiliations must
   use full standard institutional names.
8. **Inclusive language** (and SAGER sex/gender guidance where relevant to humans).

---

## 2. Findings and remediations (all executed on branch `arena/01a0cf2b-hazardnet`)

### 2.1 Dual-submission signals — TAKEN DOWN (policy 1)
The repo publicly framed the same work as packaged for **IEEE TGRS** ("Submission Ready",
"Paper strategy (IEEE TGRS)… before submission") with a third-venue hint ("BanglaJol DOI
registration"), i.e. the appearance of concurrent consideration elsewhere.

- `README.md` — section "Scientific Reproducibility (IEEE TGRS)" neutralised (no journal
  named); TOC fixed.
- `HAZARDNET_WEBAPP_DEPLOYMENT_GUIDE.md` — "(IEEE TGRS Submission Ready)" removed.
- `docs/HazardNet_Deployment_Plan_v3.md` — "Paper strategy (IEEE TGRS)" rewritten to a
  neutral single-venue rule ("the article must not be under consideration elsewhere").
- `HazardNet.md` / `docs/HazardNet.md` — "IEEE TGRS Table …" labels → plain "Table …";
  "IEEE TGRS / BAMS publication-ready tables" → "journal publication-ready tables".

### 2.2 GenAI misrepresentation — CORRECTED (policy 5)
`frontend/src/content/site-routes.json` claimed **"Nothing on this site is written by a
language model"** (EN :111 + BN :367) while the site also hosts a live LLM advisor and the
software/copy development used AI assistance. The false absolute is replaced (both
languages) with a scoped, true statement: *no forecast, alert or figure is produced by a
language model; every number is read from a committed artifact*. The manuscript must
carry the Elsevier GenAI declaration (§3.1) — the site no longer contradicts it.

### 2.3 Implied institutional endorsements / partnership claims — TAKEN DOWN (policies 3, 7)
`frontend/src/pages/About.tsx` listed **"Institutional Collaborators & Research Partners"**
cards (BUET GIS Lab "Geospatial Modeling Partner", SPARRSO, "BMD & FFWC" "Meteorological
Data Liaison", DAE "Agronomic Guidance Advisor") — unverified partnership/endorsement
claims that also implied data-sharing relationships. Replaced with an honest **"Academic
Home & Official Authorities"** block: BAU Department of Agrometeorology as the thesis
home, and an explicit statement that BMD/FFWC/DDM are official authorities **cited as
sources only, with no partnership, endorsement or data-sharing agreement**. FrontDoor's
pinned warning-authority copy (BMD/FFWC/DDM escalation) was deliberately left untouched.

### 2.4 Monetization vs "non-commercial" claims — TAKEN DOWN (policy 3)
The site declared itself "Free and non-commercial" (site-routes) while running Google
AdSense + affiliate links ("it keeps our forecasting free for farmers") — a financial
competing interest and a contradiction. All monetization was removed so the non-commercial
claim is true and **no financial competing interest exists to declare**:

- deleted: `frontend/src/lib/adsense.ts`, `frontend/src/components/blog/ads/` (BlogAdUnit +
  test), `docs/blog-monetization.md`
- stripped: `blogArticles.ts` (affiliate fields + default disclosure), `blogSeo.ts`
  (`applyAffiliateRel` + disclosure), `BlogArticlePage.tsx` (ad script/units + disclosure),
  `Blogs.tsx` (ad script/units), `RichTextEditor.tsx` ("Insert affiliate link" tool),
  `BlogEditorPage.tsx` (monetization panel + state + payload fields)
- `scripts/db/004_blog_seo_monetization.sql` — affiliate columns dropped (unused; earlier
  revisions' columns may be dropped by the operator)
- `docs/blog-admin-setup.md`, `VERCEL_ENV_TEMPLATE.md` (4 `VITE_ADSENSE_*` rows),
  `docs/PRODUCTION_RUNBOOK.md` ("Premium users" wording)
- About route copy ("How it is paid for") now states: non-commercial, no advertising, no
  affiliate links, nothing behind a paywall.
- tests/fixtures updated to match.

### 2.5 False capability claims — CORRECTED (policy 2 + reproducibility; truth = ADR 0009:
batch tflite_runtime pipeline only; the web app reads stored forecasts)
- `Privacy.tsx` — removed the false "in-browser WebAssembly inference" and "uploaded
  GeoTIFF … erased after inference" processing claims (uploads were removed from
  `/upload`; `api/ingest.js` is forecast-CSV ingestion); removed "life-saving disaster
  warnings" overstatement; kept the true "weights stay server-side" statement.
- `Footer.tsx` — "15-band … real-time early warning" → "15-channel … 7- and 15-day
  outlooks"; "WASM Edge Engine: Ready" → "Provenance-stamped forecast snapshots".
- `CommandPalette.tsx` — "FP32 TFLite WebAssembly Inference Engine / in-browser SIMD" →
  server-side batch model description.
- `RegionSelector.tsx` — "trigger live TFLite multi-hazard evaluation" → loads the stored
  forecast.
- `About.tsx` — fabricated "<100ms Latency / Edge-First TFLite WASM Engine" stat →
  "Inference Path: Stored reads".
- `auth/BrandPanel.tsx` — same fabricated "<100ms" edge-inference stat → "Dual severity
  (2 tracks)" (tests `BrandPanel.test.tsx`, `phase8Contracts.test.ts` updated).
- `UploadData.tsx` (orphan component) — "for TFLite inference" → "for archive ingestion".
- `Blogs.tsx` — "edge WebAssembly optimizations" tagline → "low-bandwidth engineering".
- `Terms.tsx` — "WASM model assets" → "archived forecast snapshots".
- `UseCases.tsx` — "Download our standalone Wasm runtime, desktop GUI, or Python PyPI
  library" → honest pointer to the Download Center/repository (contradicted ADR 0011:
  no npm/PyPI/wasm distribution exists).
- `Footer.tsx` — "Python PyPI Package"/"npm JavaScript Library" → "… Library (source)".
- `district/DistrictBriefBody.tsx` — fabricated methods rewritten to the real pipeline:
  "[claimed architecture removed] … water depth … without manual survey" → 15-channel
  tensor (S1/S2/[source removed]/[source removed]) + [architecture withheld]; "[claimed forecast source removed] …
  synchronized with real-time river gauges from BMD and FFWC … 24 to 72 hours" →
  [source removed] + [source removed] 7-/15-day windows **with an explicit "no real-time river-gauge
  feed" statement** (this also removed an implied BMD/FFWC data-sharing claim);
  "30-meter precision" flood mapping → district-level severity, not a metre-scale map.

### 2.6 False sensor/data-source claims — CORRECTED (policy 2)
- `UseCases.tsx` — "[sensor removed] Land Surface Temperature (LST >38 °C)" and "[sensor removed] fog
  boundary segmentation" (neither [sensor removed] nor [sensor removed] is used by the pipeline) →
  [source removed] 2 m temperature and [sensor removed] cloud/fog screening.
- `AnalyticsPage.tsx` — mock sync log "[sensor removed] & [sensor removed] NDVI" → "[sensor removed] & [sensor removed]".
- `lib/staticBlogPosts.ts` (published `/blogs/:slug` fallback articles) — scrubbed:
  * fabricated field trial ("During our field trial in Sunamganj Sadar and Tahirpur…")
    removed;
  * unregistered metrics removed ("[unregistered metric removed]", "[unregistered metric removed]", "78% parameter reduction",
    "0.70 threshold", "32% groundwater saving") — these violated `docs/CLAIMS.md`
    discipline and would have contradicted the manuscript's validated figures;
  * fabricated author personas ("Dr. M. Rahman (Remote Sensing Specialist)",
    "… Working Group") → the actual author name;
  * WASM/WebAssembly/SIMD tags and in-browser framing removed.

### 2.7 Map jurisdictional note — ADDED (policy 7)
The required Elsevier note is now attached to the site's map surfaces:
`frontend/src/lib/i18n.ts` `map.layer.note` (EN + BN): *"Map lines delineate study areas
and do not necessarily depict accepted national boundaries."* The same verbatim note is
required on **every map figure in the manuscript**.

### 2.8 Inclusive language (policy 8)
`BangladeshSvgMap.alertLayer.test.tsx` comments: "whitelist" → "allowlist".

### 2.9 Verified as compliant (no action)
- **Prior-publication form**: `CITATION.cff` `type: thesis` — an academic thesis is an
  explicitly allowed prior form (submission declaration).
- **Images**: no AI-generated or manipulated research images found (store/, assets/ are
  text/markup); figure generation is code-based (ml/, scripts/).
- **Affiliations**: BAU Department of Agrometeorology uses the full standard title.
- **Retired claims stay retired** (98.8% / 95.6% / ~1.2M params / 10-20-30-day) —
  `scripts/tests/test_model_claims.py` enforces this (11/11 pass).
- /methodology "Not yet validated: forecast skill" and the physics-track-only
  model-performance record — honest; the manuscript must match this framing.

---

## 3. Declarations the manuscript must carry

### 3.1 Generative AI declaration (required — new section before References)
Use the Elsevier template verbatim structure:

> During the preparation of this work the author(s) used [**ChatGPT / Claude / GitHub
> Copilot — list every tool actually used**] in order to [**state reasons: code
> development, grammar, figure scripting, literature search, drafting**]. After using
> this tool/service, the author(s) reviewed and edited the content as needed and take(s)
> full responsibility for the content of the publication.

Note: this declaration is mandatory even though **no forecast, alert or figure on the site
is produced by a language model**; the declaration covers all use of GenAI in producing
the work and its text. AI must not appear in the author list.

### 3.2 Funding
If no external funding exists, state exactly:
> This research did not receive any specific grant from funding agencies in the public,
> commercial, or not-for-profit sectors.

### 3.3 Competing interests
After the monetization takedown, the expected statement is:
> The authors declare that they have no known competing financial interests or personal
> relationships that could have appeared to influence the work reported in this paper.

If any patent application covers the severity formulation (the public formula is
deliberately embargoed per ADR 0014), it **must** be declared here.

### 3.4 Data availability
Must cover: the non-redistributed hazard archive (`data/events/README.md` terms — EM-DAT
is restrictive; the loader `python -m etl.cli events` reconstructs local data and is not
part of the redistribution grant), plus CC-BY 4.0 inputs (Copernicus [sensor removed]/2,
[source removed], [source removed]), HDX COD-AB, OSM ODbL, and the published `Models/` tflite bundle
(fp32 + int8 + calibration). The count drift risk (2,931 reported vs 3,062
`climatic_hazards_events.json` rows) must be resolved in the manuscript's numbers;
MODEL_CARD.md already flags 2,931 as "reported, not verified".

### 3.5 Maps
Every map figure: add "map lines delineate study areas and do not necessarily depict
accepted national boundaries"; show only Bangladesh (the study area), no inset
location map.

### 3.6 Authorship
All listed authors must have made substantial contributions (conception/design, or data
acquisition/analysis, or drafting/critical revision) and approved the final version; one
corresponding author. Supervisors named on the site (Dr. Ahmed Khairul Hasan, and the
currently unnamed co-supervisor) must be either authors (meeting the criteria) or
acknowledged **with their knowledge**.

---

## 4. Residual owner actions (outside the repo)

1. **Redeploy the live site** from this branch (merge to the deployed branch); the cleaned
   copy, removed ads and map note go live only on deploy.
2. **Vercel/environment**: delete the four `VITE_ADSENSE_*` variables (they already fall
   back to hidden ads) and disconnect any Google AdSense account from the property.
3. **Blog database** (if the self-host schema was ever applied): drop the unused
   `contains_affiliate_links` / `affiliate_disclosure` columns.
4. **Resolve the BanglaJol DOI registration question** so the preprint/thesis record is
   unambiguous before submission.
5. Fill the manuscript declarations in §3 with the actual GenAI tools used and the final
   author list.

---

## 5. Verification gates (all green at commit time)

| Gate | Result |
|---|---|
| `node scripts/check-severity-embargo.mjs` | PASS |
| `node scripts/check-claims.mjs` | PASS (92 sources, 20 registered values) |
| `python3 -m pytest scripts/tests/test_model_claims.py` | 11 passed |
| `python3 -m pytest scripts/tests/` (alert surface, status surface, security disclosure, mlops artifacts) | 8+15+10+19 passed |
| `cd frontend && npx tsc --noEmit` | 0 errors |
| `cd frontend && npm test` (jest) | 52 suites / 481 tests passed |
| root jest `__tests__/publicSurface|securityTxt|seoFoundations|structuredData` | 41+15 passed |
| `node scripts/build_content_engine.mjs` + `cd frontend && npm run build` (prerender) | clean |
| final greps: adsense/affiliate/ResNet-50/[claimed forecast source removed]/[sensor removed]/[sensor removed] claims/`<100ms`/IEEE TGRS | none in public surfaces |

Replacement copy was kept inside the `docs/CLAIMS.md` + `check-claims.mjs` discipline
(no prose percentages, skill-metric tokens, bare 0.XX decimals, or latency numbers) and
outside the embargo wordlist (no "manuscript/preprint/under review/journal submission",
no severity-formula language).
