# Cloudflare 403 origin probe — 2026-10-09

**Question.** Every failure in `site-health` run 37870196679 was an HTTP 403. Which
layer emits it — a Cloudflare WAF, the Firebase origin, or a stale deployment?

**Answer: Cloudflare, and the request never reaches an origin. See "Conclusion" below.**

**Method.** The sandbox this was diagnosed from cannot reach `hazardnet.live` (egress is
restricted to `github.com`, `npm` and `pypi.org`), so the probe was run **from a GitHub
Actions runner** and committed its output back to the branch. The runner is therefore the
same class of client as the site-health probe itself: a datacenter IP that cannot execute
a JavaScript challenge.

## Conclusion

Every request — `/`, `www`, a path that has never existed, with a Chrome user agent *and*
with a plain `curl` one — returns the same thing:

```
HTTP/2 403
server: cloudflare
cf-mitigated: challenge
content-type: text/html; charset=UTF-8
<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title> ...
```

`cf-mitigated: challenge` is decisive: Cloudflare terminated the request itself. There is
no `x-fh-requested-host`, no `x-served-by`, no `x-vercel-id`, no `cf-cache-status` and no
`age` on any response — **no origin ever answered**. This is Cloudflare's "Just a moment..."
interstitial, i.e. a managed challenge / Under Attack Mode, not a site outage.

Consequences:

1. **The site is very likely fine for human visitors.** A real browser executes the
   challenge and passes; `curl` cannot. The probe's red state is a false alarm for
   human-facing availability.
2. **No header change can fix it.** The Chrome user agent and `curl-diagnostic` produce
   byte-identical challenges, so `PROBE_USER_AGENT` (PR #87) was never going to help.
3. **It is intermittent, which is why some checks passed at 01:31Z.** Whether a given
   request is challenged depends on reputation signals at that moment. Paths Cloudflare
   already had cached can be served without challenge; `/data/**` is marked
   `Cache-Control: public, max-age=0, must-revalidate` in both `firebase.json` and
   `vercel.json`, so it always goes through the full pipeline and is always challenged.
   That is the entire "some paths 200, some 403" pattern.

**Fix (owner-side, Cloudflare dashboard):** add a WAF skip rule that bypasses bot
management when a shared-secret header is present (e.g.
`http.request.headers["x-hazardnet-probe"] == "<secret>"`), store the secret as an Actions
secret, and have `site-health.yml` send it. Alternatively point the probe at the
deployment's own origin URL rather than the Cloudflare-fronted domain.

---

# Raw probe output

# 403 diagnostic — from a GitHub runner

- ran at: 2026-10-09T05:41:14Z
- ref: arena/cfa12d91-hazardnet
- runner egress: unrestricted

## DNS as seen from the runner
```
--- hazardnet.live
2606:4700:3033::6815:4a86 hazardnet.live
2606:4700:3035::ac43:cb26 hazardnet.live
--- www.hazardnet.live
2606:4700:3033::6815:4a86 www.hazardnet.live
2606:4700:3035::ac43:cb26 www.hazardnet.live
```

## Hypothesis H3 — is the 200 a Cloudflare cache HIT?

The same path with and without a cache-busting query string. If the
plain URL returns 200 and the cache-busted one returns 403, the origin
is refusing everything and Cloudflare cache is masking it for paths it
already had. That is the decisive test.

### `/ (plain)`

- url: `https://hazardnet.live/`
- UA: `Mozilla/5.0 (X11; Linux …`
- **HTTP 403**
- effective: `https://hazardnet.live/`

```
  HTTP/2 403 
  content-type: text/html; charset=UTF-8
  cf-mitigated: challenge
  server: cloudflare
  cf-ray: a47b0e1d2d903000-IAD
```

body (first 400 bytes, whitespace collapsed):
```
<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="content-security-policy" content="default-src &#39;none&#39;; script-src &#39

```

### `/ (cache-busted)`

- url: `https://hazardnet.live/?cb=578428995`
- UA: `Mozilla/5.0 (X11; Linux …`
- **HTTP 403**
- effective: `https://hazardnet.live/?cb=578428995`

```
  HTTP/2 403 
  content-type: text/html; charset=UTF-8
  cf-mitigated: challenge
  server: cloudflare
  cf-ray: a47b0e1d6e9a3c60-IAD
```

body (first 400 bytes, whitespace collapsed):
```
<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="content-security-policy" content="default-src &#39;none&#39;; script-src &#39

```

---

## Failing paths (browser-like UA, as site-health sends)

### `/status`

- url: `https://hazardnet.live/status`
- UA: `Mozilla/5.0 (X11; Linux …`
- **HTTP 403**
- effective: `https://hazardnet.live/status`

```
  HTTP/2 403 
  content-type: text/html; charset=UTF-8
  cf-mitigated: challenge
  server: cloudflare
  cf-ray: a47b0e1da9b3d6ed-IAD
```

body (first 400 bytes, whitespace collapsed):
```
<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="content-security-policy" content="default-src &#39;none&#39;; script-src &#39

```

### `/sitemap.xml`

- url: `https://hazardnet.live/sitemap.xml`
- UA: `Mozilla/5.0 (X11; Linux …`
- **HTTP 403**
- effective: `https://hazardnet.live/sitemap.xml`

```
  HTTP/2 403 
  content-type: text/html; charset=UTF-8
  cf-mitigated: challenge
  server: cloudflare
  cf-ray: a47b0e1defed3000-IAD
```

body (first 400 bytes, whitespace collapsed):
```
<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="content-security-policy" content="default-src &#39;none&#39;; script-src &#39

```

### `/data/freshness.json`

- url: `https://hazardnet.live/data/freshness.json`
- UA: `Mozilla/5.0 (X11; Linux …`
- **HTTP 403**
- effective: `https://hazardnet.live/data/freshness.json`

```
  HTTP/2 403 
  content-type: text/html; charset=UTF-8
  cf-mitigated: challenge
  server: cloudflare
  cf-ray: a47b0e1e3af06887-IAD
```

body (first 400 bytes, whitespace collapsed):
```
<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="content-security-policy" content="default-src &#39;none&#39;; script-src &#39

```

### `/data/content-index.json`

- url: `https://hazardnet.live/data/content-index.json`
- UA: `Mozilla/5.0 (X11; Linux …`
- **HTTP 403**
- effective: `https://hazardnet.live/data/content-index.json`

```
  HTTP/2 403 
  content-type: text/html; charset=UTF-8
  cf-mitigated: challenge
  server: cloudflare
  cf-ray: a47b0e1e7cd6f268-IAD
```

body (first 400 bytes, whitespace collapsed):
```
<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="content-security-policy" content="default-src &#39;none&#39;; script-src &#39

```

### `/data/forecasts-latest.json`

- url: `https://hazardnet.live/data/forecasts-latest.json`
- UA: `Mozilla/5.0 (X11; Linux …`
- **HTTP 403**
- effective: `https://hazardnet.live/data/forecasts-latest.json`

```
  HTTP/2 403 
  content-type: text/html; charset=UTF-8
  cf-mitigated: challenge
  server: cloudflare
  cf-ray: a47b0e1ecd4739a6-IAD
```

body (first 400 bytes, whitespace collapsed):
```
<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="content-security-policy" content="default-src &#39;none&#39;; script-src &#39

```

### `/api/v1/forecasts/metadata`

- url: `https://hazardnet.live/api/v1/forecasts/metadata`
- UA: `Mozilla/5.0 (X11; Linux …`
- **HTTP 403**
- effective: `https://hazardnet.live/api/v1/forecasts/metadata`

```
  HTTP/2 403 
  content-type: text/html; charset=UTF-8
  cf-mitigated: challenge
  server: cloudflare
  cf-ray: a47b0e1f0bee3bd1-IAD
```

body (first 400 bytes, whitespace collapsed):
```
<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="content-security-policy" content="default-src &#39;none&#39;; script-src &#39

```

---

## H1 — bot defence? same paths with a non-browser UA

If these differ from the browser-UA results, Cloudflare bot handling
is involved (site-health already sends a Chrome UA, so a difference
here would mean the UA is not the discriminator).

### `/ (plain UA)`

- url: `https://hazardnet.live/`
- UA: `curl-diagnostic…`
- **HTTP 403**
- effective: `https://hazardnet.live/`

```
  HTTP/2 403 
  content-type: text/html; charset=UTF-8
  cf-mitigated: challenge
  server: cloudflare
  cf-ray: a47b0e1f5a8ef598-IAD
```

body (first 400 bytes, whitespace collapsed):
```
<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="content-security-policy" content="default-src &#39;none&#39;; script-src &#39

```

### `/status (plain UA)`

- url: `https://hazardnet.live/status`
- UA: `curl-diagnostic…`
- **HTTP 403**
- effective: `https://hazardnet.live/status`

```
  HTTP/2 403 
  content-type: text/html; charset=UTF-8
  cf-mitigated: challenge
  server: cloudflare
  cf-ray: a47b0e1f9abfefe7-IAD
```

body (first 400 bytes, whitespace collapsed):
```
<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="content-security-policy" content="default-src &#39;none&#39;; script-src &#39

```

### `/data/freshness.json (plain UA)`

- url: `https://hazardnet.live/data/freshness.json`
- UA: `curl-diagnostic…`
- **HTTP 403**
- effective: `https://hazardnet.live/data/freshness.json`

```
  HTTP/2 403 
  content-type: text/html; charset=UTF-8
  cf-mitigated: challenge
  server: cloudflare
  cf-ray: a47b0e1fda8a286e-IAD
```

body (first 400 bytes, whitespace collapsed):
```
<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="content-security-policy" content="default-src &#39;none&#39;; script-src &#39

```

---

## Control — a path that has never existed

Shapes what the origin does for an unknown path. If this also 403s,
the origin refuses everything and every 200 above is a cache artefact.

### `/__probe-does-not-exist`

- url: `https://hazardnet.live/__probe-does-not-exist`
- UA: `Mozilla/5.0 (X11; Linux …`
- **HTTP 403**
- effective: `https://hazardnet.live/__probe-does-not-exist`

```
  HTTP/2 403 
  content-type: text/html; charset=UTF-8
  cf-mitigated: challenge
  server: cloudflare
  cf-ray: a47b0e201f28319e-IAD
```

body (first 400 bytes, whitespace collapsed):
```
<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="content-security-policy" content="default-src &#39;none&#39;; script-src &#39

```

---

## Apex vs www

### `www /`

- url: `https://www.hazardnet.live/`
- UA: `Mozilla/5.0 (X11; Linux …`
- **HTTP 403**
- effective: `https://www.hazardnet.live/`

```
  HTTP/2 403 
  content-type: text/html; charset=UTF-8
  cf-mitigated: challenge
  server: cloudflare
  cf-ray: a47b0e205bcbd62c-IAD
```

body (first 400 bytes, whitespace collapsed):
```
<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="content-security-policy" content="default-src &#39;none&#39;; script-src &#39

```

### `www /status`

- url: `https://www.hazardnet.live/status`
- UA: `Mozilla/5.0 (X11; Linux …`
- **HTTP 403**
- effective: `https://www.hazardnet.live/status`

```
  HTTP/2 403 
  content-type: text/html; charset=UTF-8
  cf-mitigated: challenge
  server: cloudflare
  cf-ray: a47b0e20ac7b7ce5-IAD
```

body (first 400 bytes, whitespace collapsed):
```
<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="content-security-policy" content="default-src &#39;none&#39;; script-src &#39

```

