# `www.hazardnet.live` reported the alerts artifact unreadable — the host split, not a stale deploy

**Measured 2026-10-26 ~09:20Z, after `main` was merged and deployed as `f28f854`.**
**Verdict: the deployment was current on both hostnames. The front door said the file could not
be read because the *live API* answered instead of the file — with an empty ledger, on the one host
that has a working serverless function.**

## What was actually served

| | `hazardnet.live` (apex) | `www.hazardnet.live` |
|---|---|---|
| DNS (`hazardnet.live` zone, 2026-10-26 09:18Z) | `CNAME hazardnet.pages.dev` → **Cloudflare Pages** | `CNAME 57d8e2d687290f37.vercel-dns-017.com` → **Vercel** |
| `/hazards` h1 | `Hazards of Bangladesh` | `Hazards of Bangladesh` |
| Key-figure row | *Climatic classes 8 · Archive-only 1 · Recorded events 3,062* | identical |
| Earthquakes card | `Archive only · not modelled` | identical |
| `/data/freshness.json` | 13,371 bytes, `built_at 2026-10-26T06:31:52.253Z` | **byte-identical** |
| `/data/alerts-latest.json` | `generated_at 2026-10-25T19:21:16.916Z`, 106 `WATCH`, 128 assessed | **byte-identical** |
| `/api/v1/alerts` | **404** (a static host has no serverless function) — falls through to the SPA's 404 page | **200** `{"count":0,"state_counts":{},"alerts":[],"generated_at":"<now>"}` |

So the frontend **was** updated on `www`: both origins serve the merged build, down to the h1 and
the key-figure row that PR #99 introduced, and both serve the same committed artifacts. What
differed between the two hostnames was the answer to one request.

## Why that produced the banner

`loadAlerts` (`frontend/src/lib/alerts.ts`) tries the live API first and the committed snapshot
second. On the apex the API 404s, the loader falls through, and the snapshot renders: *“Advisories
are active. 106 district advisories are published at WATCH or above.”* On `www` the API answers
`200`, so the loader **returned immediately** — with `alerts: []` and no `counts` field (the
handler served `state_counts`, which counts lifecycle states, not levels).

The front door then rendered four separate untruths from one empty answer:

1. `LiveStatusStrip` tested `unread = counts === null` — and `counts` was null. So it printed *“The
   alerts artifact could not be read on this load.”* The artifact had been read; the API it read
   was empty.
2. `StatusVerdict` therefore rendered `unknown` → *“The advisory file could not be read. Conditions
   are unknown on this load, not confirmed safe.”*
3. `assessed` was absent from the API payload → *“Assessed rows —”*.
4. `generated_at` was the **function's clock** (`new Date()` in the handler), so the strip printed
   *“Updated 0 h · <now>”* and the run line printed *“it was generated <now>”*. That is why the
   timestamp moved between reads (09:19 in the first screenshot, 09:21 on the next fetch, 09:24
   from `curl`): it is not an artifact age at all.

Meanwhile `/data/freshness.json` — untouched by the API path — rendered *normally* on the same
page, which is why “Districts covered 64 / 64 (complete)” was correct while the counts beside it
said nothing could be read.

The Vercel function is not broken; it is **unwired**. `serverless/v1/alerts/index.js` calls
`listAlerts({ store })`, and that deployment has no alert store populated, so the honest answer is
“zero published alerts”. The code had no way to tell “the publisher has nothing unpublished” from
“this endpoint has no data behind it”, and it preferred that answer to the snapshot sitting next
to it.

## What was fixed (this branch)

- **`loadAlerts` no longer returns an answer that states nothing.** A `200` carrying no published
  alert *and* no level ledger falls through to the committed snapshot, and the divergence is
  reported as a warning (*“the live API answered with no published alert and no level ledger; this
  read is the committed snapshot, which carries 106”*) plus an error line naming the API. An API
  answer that does carry a ledger — including an all-zero one — still wins, because that is a
  statement about the publisher.
- **`generated_at` is no longer fabricated.** `asString(snapshot.generated_at) || fetched_at` made
  a snapshot with no timestamp claim it had been generated at request time. Absent stays absent;
  the strip renders “—”.
- **“Unreadable” now means unreadable.** `LiveStatusStrip` takes `readFailed` (the loader's
  `source === 'none'`) instead of inferring it from `counts === null`, and a readable answer with
  no ledger gets its own sentence. The alarming copy is reserved for the alarming case.
- **The API serves the ledger both routes' clients read.** `counts` (level → published row count)
  added to `serverless/v1/alerts/index.js` **and** `backend/routes/alerts.js`, since the web client
  cannot tell which one answered.

Pinned by `frontend/src/lib/__tests__/alerts.test.ts` (three new cases: empty-API fallback, an
all-zero ledger still winning, no invented generation time),
`frontend/src/components/frontdoor/__tests__/FrontDoorLivePanels.test.tsx` (a readable answer with
no ledger is not called an unreadable file) and `__tests__/api/alerts.test.js` (`counts` in the
response).

## What is still owner-side

- **Two hostnames, two platforms, one repository.** `main` deploys twice, and the two deployments
  are not equivalent: only Vercel runs `api/`, and only that deployment's API has no data. Every
  URL the site advertises (`canonical`, sitemap, `security.txt`, structured data) points at
  `www`, i.e. at the half whose API is unwired. Either point `www` at the Cloudflare Pages
  deployment (one hostname, one answer) or give the Vercel deployment a populated alert store —
  Actions 16 and 17 in `docs/ops/owner-actions.md`.
- **The monitor watches the wrong half.** `site-health.yml` probes `SITE_URL`, which is
  `https://hazardnet.live` — the origin where the front door was correct. Nothing probes `www`,
  so this ran for as long as the split existed without a red check.
- **`/api/v1/alerts` on the apex is a 404 page, not a JSON 404.** The dispatcher in Vercel returns
  `{"error":"not found"}`; on Cloudflare Pages the SPA answers instead. The client treats any
  non-2xx the same way, so nothing is broken — but a client that starts trusting a `200` SPA page
  would be reading HTML as JSON.
