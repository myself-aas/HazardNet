# Live security headers — measured 2026-10-26

**Question.** `site-health.yml`'s `security_headers` probe has been the only red
check on the scheduled Site Health Probe for over a day (run 40254033856 and the
runs before it). Is that a workflow bug, or is production really not sending the
headers the repository declares?

**Answer: production really is not sending them.** Three of the five required
headers are absent from every answer measured; the repository declares all five
in three separate configs. The workflow was reporting a true condition, but
reporting it without saying *which* header — which is fixed in the same change
(`data/site-health/latest.json` now carries `checks[].detail`).

Method: `curl` from a GitHub Actions runner (`.github/workflows/` on Ubuntu,
`ubuntu-latest`, 2026-10-26T01:40Z–01:43Z), headers only (`-D -`, `-o /dev/null`).
Raw output is quoted verbatim below. Run logs are not published here because
GitHub's log blob storage was not reachable from the environment that produced
this document; the commands are given so the measurement is repeatable.

## 1. `https://hazardnet.live/` (the domain the probe uses)

```
HTTP/2 200
date: Mon, 26 Oct 2026 01:41:00 GMT
content-type: text/html; charset=utf-8
x-content-type-options: nosniff
access-control-allow-origin: *
cache-control: public, max-age=0, must-revalidate
referrer-policy: strict-origin-when-cross-origin
server: cloudflare
cf-cache-status: DYNAMIC
cf-ray: a505c1947ebcc07f-LAX
```

Required, missing from this answer:

| Header | Required by the probe | Present |
| --- | --- | --- |
| `Strict-Transport-Security` | `includeSubDomains` | ❌ absent |
| `Content-Security-Policy` | `frame-ancestors 'none'` | ❌ absent |
| `X-Content-Type-Options` | `nosniff` | ✅ |
| `Referrer-Policy` | any value | ✅ |
| `Permissions-Policy` | any value | ❌ absent |

The answer carries **no origin fingerprint**: no `x-fh-requested-host` /
`x-served-by` (Firebase Hosting), no `x-vercel-id` / `x-vercel-cache` (Vercel),
no `etag`, no `last-modified`. `server: cloudflare` and `cf-cache-status:
DYNAMIC` say only that Cloudflare proxied the request. The header set that *is*
present (`nosniff`, `referrer-policy`) is a subset of the repository's set, so
this is not "no policy at all" — it is a stale or different copy of it.

## 2. `https://www.hazardnet.live/` — Cloudflare challenge, not an origin

```
HTTP/2 403
cf-mitigated: challenge
content-security-policy: default-src 'none'; script-src 'nonce-…' 'unsafe-eval' https://challenges.cloudflare.com; …
permissions-policy: accelerometer=(),camera=(),…
server: cloudflare
```

The CSP and `Permissions-Policy` here belong to **Cloudflare's interstitial**,
not to HazardNet — a trap worth naming, because those two header names are
exactly the two the probe finds missing on the real answer. Any probe that read
this response would pass the header check against Cloudflare's own policy.

`www` (the canonical host per Action 16) is challenged for a datacenter IP
*without* the probe header, while `hazardnet.live` answers 200 inconsistently
(5 of 5 repeats inside the same minute returned 403 with `cf-mitigated`). That
is the behaviour Action 18's WAF skip rule is for; it is in place for the probe
(`edge_challenged: false` in the published artifact) but not for ad-hoc
requests.

## 3. The Firebase origin serving the same site is stale, and also lacks two headers

TXT record `hosting-site=hazardnet-aas48424` says the Firebase Hosting site for
this project still exists, and its default domains answer directly:

```
GET https://hazardnet-aas48424.web.app/          (and .firebaseapp.com)
HTTP/2 200
cache-control: max-age=3600
etag: "260987b3f7cef1f1bb43a4f4185c11a3befa34ee503fa4522c85f313ac7023e9"
last-modified: Thu, 24 Sep 2026 21:56:33 GMT
referrer-policy: strict-origin-when-cross-origin
strict-transport-security: max-age=31556926; includeSubDomains; preload
x-content-type-options: nosniff
x-frame-options: DENY
vary: x-fh-requested-host, accept-encoding
x-served-by: cache-phx1710024-PHX
```

and its deployed artifact is from that same day:

```
GET https://hazardnet-aas48424.web.app/data/freshness.json
{ "schema": "hazardnet-freshness/v1",
  "built_at": "2026-09-24T20:35:20.524Z", … }
```

So the Firebase deployment has not been updated since **2026-09-24T21:56Z**,
which predates the `content-security-policy` and `permissions-policy` entries
in `firebase.json` (added 2026-10-04). It sends HSTS + `nosniff` +
`Referrer-Policy` + `X-Frame-Options`, and no CSP, no `Permissions-Policy`.

## What this means

1. The `security_headers` probe is **correct**: the header policy the repository
   declares is not what the domain serves.
2. No change in `.github/workflows/` can fix it. The three places that declare
   the policy are `firebase.json`, `vercel.json` and `frontend/vercel.json`, and
   `__tests__/securityHeadersParity.test.js` already pins them to each other; the
   gap is between the declaration and the deployment.
3. Two different hosts are involved and both are behind the same Cloudflare
   zone: the apex answer has no origin fingerprint, and the Firebase origin is a
   month old. The owner identified the deployment platform on 2026-10-26 as
   **Cloudflare Pages / Workers**, which explains the fingerprint-less answer: a
   Cloudflare deployment serves only the headers it is given, and none of
   `firebase.json` / `vercel.json` / `frontend/vercel.json` is a Cloudflare
   config. Owner action: docs/ops/owner-actions.md **Action 17**.

## The fix this repository can make: `frontend/public/_headers`

Cloudflare Pages (and Workers static assets) honour a `_headers` file served from
the asset root, with its own syntax:

```
/*
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  Content-Security-Policy: …
```

`frontend/public/_headers` now carries the full policy — the same literal
values as `frontend/vercel.json`, plus the `/assets/*`, `/serviceWorker.js` and
`/data/*` cache rules that were Vercel/Firebase-only. Vite copies
`frontend/public/` into `dist/` verbatim, so the file lands next to `index.html`
where Cloudflare looks for it. `__tests__/securityHeadersParity.test.js` parses
it and pins every value, because a `_headers` file that Cloudflare cannot parse
fails **silently** — the deployment simply keeps serving the origin's headers,
which is the state that made this probe red.

Two caveats, both recorded in the file's own header:

- `Strict-Transport-Security` may be ignored by Cloudflare depending on plan
  tier; there it is the **SSL/TLS → Edge Certificates → HSTS** switch, not the
  header file. If HSTS is still the only missing header after a deploy, that
  switch is why.
- The file only takes effect on the next Cloudflare deployment of this build.

## Making the probe useful in the meantime

Changed in this pass (`.github/workflows/site-health.yml`):

- the header step records **which** headers are missing/wrong in
  `steps.security_headers.outputs.detail`, prints the answering host's
  fingerprint, and writes a summary block naming the failing header list;
- `data/site-health/latest.json` carries that string in `checks[].detail`
  instead of `null` (it flows into `frontend/public/data/freshness.json` via
  `scripts/build_freshness_artifact.mjs`, which already renders `detail`);
- the aggregate gate prints every failing check **with its detail** before it
  exits non-zero, so the reason is in the run summary and not only in a step log.

Repeat the measurement with (add `-H "x-hazardnet-probe: $SITE_PROBE_TOKEN"`
if the WAF skip rule from Action 18 is in place; without it Cloudflare answers
403 `cf-mitigated: challenge` for `/`, `/data/*` and `/status` from a datacenter
IP, which no probe can read):

```sh
curl -sSL -D - -o /dev/null https://hazardnet.live/ | tr -d '\r'
curl -sS  -L -D - -o /dev/null https://hazardnet-aas48424.web.app/ | tr -d '\r'
curl -sS  -L https://hazardnet-aas48424.web.app/data/freshness.json | head -c 200
```
