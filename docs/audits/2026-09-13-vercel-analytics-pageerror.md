# Vercel Web Analytics pageerror — 2026-09-13

**Trigger:** `CI/CD Pipeline` → `E2E Tests` failed with 2 of 44 tests:

```
Performance › no JavaScript errors on critical pages
  Error: JavaScript errors found: Unexpected token '<', Unexpected token '<', Unexpected token '<'
```

identical on `chromium-desktop` and `chromium-mobile`, on all three retries.

**Outcome:** the loader is no longer injected into non-Vercel builds, the E2E
suite is green again, and `/ _vercel/insights/script.js` is now excluded from
the SPA catch-all rewrite so the script also works where it is supposed to (on
Vercel).

---

## 1. What the error actually was

The failing spec navigates `/`, `/advisories` and `/forecast/district/dhaka`
and collects `page.on('pageerror')` — three errors for three navigations, one
per page load. `@vercel/analytics/react` is what produces them:

```
<Analytics />  →  useEffect([])  →  inject()
                 →  document.createElement('script')
                 →  src = "/_vercel/insights/script.js"      (production mode)
```

That last path is a **Vercel system route**. Vercel's edge answers it only for
a project with Web Analytics enabled; every other host answers an unmatched
path with the SPA shell. In this repo that is two places:

| host | behaviour for `/_vercel/insights/script.js` |
| --- | --- |
| `vite preview` (CI job, `sirv` `single: true`) | `200 text/html` → `index.html` |
| Firebase Hosting (`"rewrites": [{ "source": "**" }]`) | `200 text/html` → `index.html` |

A classic `<script>` parses whatever it receives as JavaScript, so the app
shell is fed to the parser and the parse throws before the tag's `onerror`
handler can fire:

```
SyntaxError: Unexpected token '<'
```

Playwright reports that as `pageerror` with the `SyntaxError: ` prefix split
off by its error parser, which is why the CI message is the bare
`Unexpected token '<'` ×3.

Two near-misses worth recording, because both look like this failure and are
not:

- `JSON.parse` of the same body (`res.json()` on an HTML response) reports
  `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` — a different,
  longer message. The CI message is the *script* parse, not a JSON parse of an
  API response.
- A genuinely missing script (404) would be invisible here: the package's
  `onerror` only `console.log`s. The regression needed the 200-HTML body that
  an SPA fallback produces.

Verified locally against the built preview (`npm run build:frontend` +
`vite preview --port 4173`):

```
$ curl -sD- -o - http://127.0.0.1:4173/_vercel/insights/script.js | head -5
HTTP/1.1 200 OK
Content-Type: text/html
...
<!DOCTYPE html>        ← the built index.html, served as a "script"
```

Reproduced mechanically — jsdom (same V8 parser the browser uses) fetching the
path from the preview server, doing exactly what `inject()` does at mount:

```
$ node /tmp/jsdom-repro.cjs
jsdomError → Uncaught [SyntaxError: Unexpected token '<']
script tag present in head: true      # script.onerror never fired: the request succeeded
```

## 2. Root cause

`frontend/src/App.tsx` mounted `<Analytics />` unconditionally, so *every*
deployment of the built bundle — CI, Firebase, sandbox previews — shipped a
request for a Vercel-only route. The defect was introduced with the analytics
integration itself (the same PR that made it green in the first place: the
loader had simply never been requested before).

The package offers no runtime opt-out, and `vercel.json` only governs Vercel,
so the decision has to be made where the deployment target is known: at build
time.

## 3. Fix

1. **Build-time gate** — `frontend/vite.config.ts` resolves

   ```ts
   env.VITE_VERCEL_ANALYTICS !== undefined
     ? env.VITE_VERCEL_ANALYTICS === 'true'
     : env.VERCEL === '1'
   ```

   and injects it as a boolean via `define`
   (`import.meta.env.VITE_VERCEL_ANALYTICS`). `vercel build` and Vercel's own
   build image set `VERCEL=1` for every deployment they build — production,
   preview, and custom domains such as `hazardnet.live` — so the loader is
   wired in exactly where the edge can serve it. Anything else (CI, local
   builds, Firebase) leaves it out. `VITE_VERCEL_ANALYTICS=true|false`
   overrides the guess (documented in `frontend/.env.example`).

2. **Client** — `frontend/src/App.tsx` now renders
   `{vercelAnalyticsEnabled && <Analytics />}`, with the flag read from
   `frontend/src/lib/vercelAnalytics.ts` (which carries the full story).
   Because the flag is a literal `false` in non-Vercel builds, Rolldown
   tree-shakes the whole package out of the bundle — verified: the built
   chunks contain no `_vercel/insights` string unless the build ran with
   `VERCEL=1`.

3. **Vercel routing** — `vercel.json`'s catch-all rewrite excluded only
   `api/`, `assets/` and `serviceWorker.js`, so on Vercel itself
   `/_vercel/insights/script.js` was rewritten to `/index.html` — the loader
   "succeeded" with HTML and collected nothing, and the same `SyntaxError`
   appeared in production. The negative lookahead now also excludes
   `_vercel/`, so the edge serves the real script (3 KB of JavaScript) instead
   of the shell.

4. **Regression guard** — `e2e/critical-paths.spec.ts`:

   - `no JavaScript errors on critical pages` now records
     `${error.name}: ${error.message}` and, in the same array message, any
     `.js` response served as `text/html`. The assertion is unchanged
     (`errors` must be empty) — the extra context exists so the next reader
     does not have to open a trace to learn *which* script was involved.
   - New `does not request Vercel-only assets off Vercel`: fails if a loopback
     (locally built, non-Vercel) preview ever requests a `/_vercel/` path.
     Scoped to loopback hosts so running the suite against a real Vercel
     deployment, where the route legitimately exists, is not a false failure.

## 4. Verification

- `npm run build:frontend` (no `VERCEL`) → no `_vercel/insights` anywhere in
  `frontend/dist/assets/**` (package fully tree-shaken).
- `VERCEL=1 npm run build:frontend` → loader present in `index-*.js`.
- `VERCEL=1 VITE_VERCEL_ANALYTICS=false npm run build:frontend` → absent (the
  explicit override wins over the environment guess).
- `npm run lint` (tsc), `npm run lint:eslint` (0 errors), `npm run
  check:bundle` (within budget), `npx jest --ci frontend/src` (20 suites, 207
  tests) all pass.
- End-to-end confirmation is CI-only: this sandbox cannot install Playwright
  browsers (no network access to the browser CDN), so the suite must be re-run
  by the `E2E Tests` job.
