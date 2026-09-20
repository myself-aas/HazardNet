# Full-scale audit — 2026-09-14

**Scope.** Whole repository at `arena/01a09c59-hazardnet` (`59b845c`): backend, API
functions, frontend, RAG pipeline, data/CI workflows, database policy, dependencies,
tests, documentation and repo hygiene.

**Method.** Every claim below is reproduced from this checkout — commands were run, not
read. Where a property could not be verified from here (live database, Vercel
credentials, browser E2E) the finding says so and the gap is listed in §8. No
application code was modified by this audit; the tree is clean against `HEAD`.

**Headline.** Two findings matter, and they are independent of each other but *chain*:

1. **Blog write access is not really restricted to superadmins** (§3.1) — the row-level
   security policy checks a **client-supplied email column** instead of the
   authenticated identity, and public signup is open. Any registered user can publish,
   edit and delete articles.
2. **The blog HTML sanitizer is bypassable** (§3.2) — four payloads survive it,
   including one that silently redirects every reader.

Together: an unauthenticated visitor can register, publish a crafted article, and
control what every visitor to the public blog sees — including stored XSS.

---

## 1. Findings summary

| # | Severity | Finding | Verified by |
|---|---|---|---|
| 3.1 | **Critical** | Blog RLS authorises via spoofable `author_email` column, not `auth.email()`; public signup open → any user can publish/edit/delete | SQL policy text + `authorToRow` client code + signup flow |
| 3.2 | **High** | Hand-rolled blog sanitizer: 4 bypasses incl. silent redirect; fail-open `catch` | Executed 16 payloads under jsdom |
| 4.1 | **Medium** | CI "backend tests" step works only by accident of argv parsing; one reorder silently drops all 21 backend suites | 3-way `--listTests` experiment |
| 4.2 | **Medium** | Dependabot alerts disabled; 14 dependency exceptions all expire 2026-12-12 | GitHub API; `audit-exceptions.json` |
| 4.3 | **Medium** | Broken gitlink with no `.gitmodules` — `git submodule status` fails in a fresh clone | Clone test |
| 4.4 | **Medium** | Blog schema/RLS lives only in a Markdown doc, not a migration — drift is undetectable | `scripts/db/` inventory |
| 4.5 | **Low** | `firestore.rules` lets a user write `role: 'admin'` on their own profile (latent) | Rule text + authz trace |
| 5.1 | **Low** | Six pieces of committed root cruft incl. inert `.npmrc.bak` whose stated reason is false | `git ls-files` + file contents |
| 5.2 | **Low** | Documentation drift on test counts ("34 Jest suites" vs 42 actual) | Doc grep vs measured |
| 5.3 | **Low** | Frontend coverage 21% statements / 14.7% functions; gate disabled for frontend runs | Measured coverage |
| 5.4 | **Low** | 272 ESLint warnings, unenforced; no `docs/audits` index | `npm run lint:eslint` |

---

## 2. Verified healthy (measured, not assumed)

These were tested and pass. Recording them matters as much as the findings — several are
unusually well built.

| Area | Evidence |
|---|---|
| Backend tests | backend-only run → **21 suites / 198 tests passed** |
| Frontend tests | `npx jest --ci frontend/src` → **20 suites / 207 tests passed** |
| Python tests | `pytest scripts/tests -q` → **18 passed** (needs `scripts/requirements-pipeline.txt`; a bare interpreter fails 7 with `ModuleNotFoundError: pandas` — environment, not repo) |
| Type safety | `npm run lint` (`tsc --noEmit`) → clean |
| Lint | `npm run lint:eslint` → **0 errors**, 272 warnings |
| Build | `npm run build:frontend` → succeeds in 1.9 s |
| Bundle budget | `npm run check:bundle` → **PASS**, 1103 kB gzip total |
| Dependency gate | `node scripts/npm-audit-ci.mjs` → PASS; all high/critical are excepted with expiry |
| Secret scan | `bash scripts/check-secrets.sh` → **730 files, 14 patterns, clean** |
| API auth | `backend/utils/apiKeyAuth.js` — `timingSafeEqual`, **fail-closed 503** when unset |
| CORS | Production fails closed when `FRONTEND_ORIGIN` unset; permissive mode is dev-only |
| Rate limiting | Layered: AI 20/min, predict 60/min, base 120/min per IP |
| Firestore rules | Default-deny first; ownership via `auth.uid()`; forecasts public-read, client-write denied |
| User-dashboard RLS | `scripts/db/003_user_dashboard.sql` uses the **correct** `auth.uid() = id` pattern throughout |
| Exception discipline | `audit-exceptions.json` requires an expiry per entry and fails closed on unlisted advisories |
| Repo size | 15 MB working tree, 6.4 MB history; largest tracked file 844 kB — no bloat |
| Test hygiene | No `.only`/`xit`/`test.todo` debt; one intentional conditional `test.skip` (e2e host guard) |
| External monitoring | `site-health.yml` probes production every 30 min with a data-age gate |

---

## 3. Critical & High

### 3.1 Critical — Blog writes are authorised by a client-supplied column

**Where:** `docs/blog-admin-setup.md` lines 61–96 (the only definition of the table and
its policies — see §4.4).

```sql
create policy "blog_superadmin_write"
  on public.blog_articles for insert
  with check (
    lower(author_email) in ('shuvo.1807016@bau.edu.bd', 'shuvoasifahmed@gmail.com', 'asifahmedshuvo.aas@gmail.com')
  );
```

`author_email` is an ordinary column on the row — `author_email text not null default ''`
— and it is **supplied by the client**:

```ts
// frontend/src/lib/blogArticles.ts:213
assign('author_email', article.authorEmail);
// frontend/src/pages/dashboard/BlogEditorPage.tsx:214
authorEmail: signedInAuthor.email,
```

The policy compares that value against the allowlist. Postgres evaluates `with check`
against the row being written, so a request that *sets* `author_email` to a superadmin
address satisfies it. Nothing else enforces the identity: there is no trigger, no
`default auth.email()`, and `auth.email()` appears nowhere in the file
(`grep -n 'auth\.' docs/blog-admin-setup.md` → no matches).

**Reachability.** Registration is open — `signUpWithEmail` calls
`createUserWithEmailAndPassword` with no invite, approval or allowlist gate. So the actor is
"anyone who can create an account", not "a known insider".

**Impact.** With a single authenticated `insert`, an unauthenticated-in-effect attacker
can:

- publish arbitrary articles to the public blog (`status='published'` is world-readable
  by the `blog_published_public_read` policy);
- edit or delete the three superadmins' existing articles (the `update`/`delete`
  policies use the same column);
- combine with §3.2 to serve crafted HTML to every visitor.

That is content injection and stored XSS on the project's public, indexed surface — plus
SEO poisoning, since the blog is the site's search-visible content.

**Why this is a defect and not a design choice:** the same repository already does it
correctly elsewhere — `scripts/db/003_user_dashboard.sql` uses `auth.uid() = id` /
`with check (auth.uid() = user_id)` for every user-scoped table. The blog table is the
outlier.

**Fix (owner action — must be run in Postgres; a code change alone does not fix it):**

```sql
drop policy if exists "blog_superadmin_write"  on public.blog_articles;
drop policy if exists "blog_superadmin_update" on public.blog_articles;
drop policy if exists "blog_superadmin_delete" on public.blog_articles;

create policy "blog_superadmin_write" on public.blog_articles for insert
  with check (lower(auth.email()) in ('shuvo.1807016@bau.edu.bd','shuvoasifahmed@gmail.com','asifahmedshuvo.aas@gmail.com'));

create policy "blog_superadmin_update" on public.blog_articles for update
  using      (lower(auth.email()) in ('shuvo.1807016@bau.edu.bd','shuvoasifahmed@gmail.com','asifahmedshuvo.aas@gmail.com'))
  with check (lower(auth.email()) in ('shuvo.1807016@bau.edu.bd','shuvoasifahmed@gmail.com','asifahmedshuvo.aas@gmail.com'));

create policy "blog_superadmin_delete" on public.blog_articles for delete
  using      (lower(auth.email()) in ('shuvo.1807016@bau.edu.bd','shuvoasifahmed@gmail.com','asifahmedshuvo.aas@gmail.com'));
```

`auth.email()` reads the JWT-verified claim, which the client cannot forge. Additionally:
keep `author_email` for display but stop deriving permission from it, and move this SQL
into `scripts/db/` so it is reviewable and diffable (§4.4).

**Severity caveat.** This audit could not read the live policies — no Postgres
credentials here. The finding is against the SQL the repo documents as its deployed
state. Confirm with `select * from pg_policies where tablename = 'blog_articles';`
before treating it as closed.

---

### 3.2 High — Blog HTML sanitizer has verified bypasses and fails open

**Where:** `frontend/src/lib/blogArticles.ts:113` (`sanitizeBlogHtml`), applied on write
(`:319`, `:354`) and on render (`frontend/src/pages/BlogArticlePage.tsx:130`) before
`dangerouslySetInnerHTML` (`:193`, `:202`).

It is a hand-rolled blocklist: remove `script,iframe,object,embed,link,style,form`, strip
`on*` attributes, and drop `href`/`src` values starting with `javascript:` or
`data:text/html`.

**Reproduction** (16 payloads executed through the real function under jsdom; the scratch
harness was removed afterwards, so re-create it as a test file under
`frontend/src/lib/__tests__/` with `jest.mock('../postgres', …)` as the existing
`blogArticles.test.ts` does):

```
blocked  | plain script               | <p>hi</p>
blocked  | onerror attr               | <img src="x">
blocked  | href javascript:           | <a>x</a>
blocked  | href with char entity      | <a>x</a>
blocked  | svg animate onbegin        | <svg><animate attributeName="x"></animate></svg>
SURVIVES | href with leading control  | <a href="&#1;javascript:alert(1)">x</a>
SURVIVES | meta refresh               | <meta http-equiv="refresh" content="0;url=...">
SURVIVES | style expression           | <div style="background:url(javascript:alert(1))">x</div>
SURVIVES | svg xlink:href             | <svg><a xlink:href="javascript:alert(1)">x</a></svg>
```

Assessed individually, most honestly:

- **`<meta http-equiv="refresh">` — the practically serious one.** It is not in the
  removal list at all, so it survives sanitisation in full. A crafted article can
  therefore **silently redirect every reader** to an arbitrary URL, no click required.
  Whether the redirect target can itself be `javascript:` depends on the browser
  (generally blocked), but redirect-to-external is plainly effective and is the far more
  damaging outcome.
- **`javascript:` behind a leading control character — a real blocklist bypass.** The
  check is `value.trim().toLowerCase().startsWith('javascript:')`; `trim()` does not strip
  `\u0001`, while HTML's URL parsing removes leading C0 control characters, so the browser
  sees `javascript:`. Exploitation needs a click, but the guard is defeated.
- **`svg xlink:href`** is not covered (the check only looks at `href`/`src`). Modern
  browsers do not execute `javascript:` from SVG links, so treat this as hardening rather
  than an exploit.
- **`style: url(javascript:…)`** survives, but CSS does not execute `javascript:` URLs in
  current browsers. Hardening.

**Second defect: it fails open.**

```ts
} catch {
  return html;   // returns the UNSANITISED input
}
```

A throw in `DOMParser`/DOM traversal yields raw attacker HTML into
`dangerouslySetInnerHTML`. A security control should fail closed (return `''`).

**Note the test gap:** `frontend/src/lib/__tests__/blogArticles.test.ts:96` covers
`<script>` and `onerror` — the two easiest cases — which is why these gaps persisted
while the suite stayed green.

**Fix:** use **DOMPurify**, which is already in the dependency tree (3.4.15, pulled in
transitively by `jspdf`, and already shipped in the bundle as `purify.es-*.js`). Add it
as a direct dependency of `frontend`, then:

```ts
import DOMPurify from 'dompurify';
export function sanitizeBlogHtml(html: string): string {
  if (typeof window === 'undefined') return '';
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['meta', 'base'] });
}
```

Add the surviving payloads from the list above as regression cases. Realistically,
§3.1 is the more urgent half of the chain: it is what lets a non-superadmin reach this
code path at all.

---

## 4. Medium

### 4.1 CI's "Run backend unit tests" works by accident and is one edit from silently disabling itself

`.github/workflows/ci.yml`, `test-backend`:

```yaml
- name: Run backend unit tests
  run: npx jest --ci --coverage --coverageDirectory=./coverage/backend --testPathIgnorePatterns='/e2e/' 'frontend/src'
```

`--testPathIgnorePatterns` is **array-valued**: jest consumes trailing arguments into it,
so `'frontend/src'` is not a test-path selector at all — it becomes a *second ignore
pattern*. The job therefore runs "everything except `e2e/` and `frontend/`", which
happens to be exactly the backend suites. Three-way proof with `--listTests`:

| Command | Suites | Of which backend |
|---|---|---|
| `--testPathIgnorePatterns='/e2e/' 'frontend/src'` (the CI step) | 21 | **21** |
| `'frontend/src'` alone | 20 | 0 |
| `--testPathIgnorePatterns='/e2e/'` alone | 41 | 21 |

Why this is worth fixing despite being green today:

- Reading the command suggests the opposite of what it does (it looks like it *selects*
  frontend tests).
- The behaviour depends on argument order. Moving the pattern before the flag — a
  natural "cleanup" — flips the job to running the **frontend** suites and skipping all
  21 backend suites, and **the job still passes**. Backend coverage in CI would vanish
  silently.
- Related: the `test-frontend` job runs the same frontend suites, so a mis-edit makes the
  two jobs duplicates rather than complements.

**Fix** — make the exclusion explicit and documented (identical behaviour, stated
intent):

```yaml
      # Backend suites live in __tests__/ at the repo root; frontend suites live
      # under frontend/src. Select the backend set by exclusion. NOTE: jest
      # consumes trailing values into --testPathIgnorePatterns, so these two
      # patterns (and only these) must follow the flag — adding a positional test
      # pattern here would be swallowed by the flag and silently change the run.
      - name: Run backend unit tests
        run: npx jest --ci --coverage --coverageDirectory=./coverage/backend --testPathIgnorePatterns='/e2e/' '/frontend/'
```

A `test_workflows.py` guard asserting the backend job's ignored-trees list would pin it.

### 4.2 No vulnerability alerting, and every dependency exception expires on the same day

- **Dependabot alerts are disabled** for the repository — the API answers
  `Dependabot alerts are disabled for this repository`, which is a configuration state,
  not a permissions error. The `.github/dependabot.yml` added recently configures
  *version updates* for GitHub Actions only; it does not enable security alerts for npm.
- All **14** entries in `audit-exceptions.json` carry `"expires": "2026-12-12"` — the same
  date. The gate is designed to fail on expiry (good), which means on 2026-12-12 CI turns
  red across the board at once, with no staggered re-review and no alerting in between.

The exceptions themselves are **sound** — I verified the "install-time only" rationale
independently: `tar` and `adm-zip` are required only by
`node_modules/@mapbox/node-pre-gyp/lib/{install,package,testpackage}.js`, and no
application code under `backend/`, `api/`, `frontend/src/`, `scripts/` or `rag_pipeline/`
references them. The exposure is build-time (the tfjs-node binary extraction), from a
trusted origin.

**Fix:** enable Dependabot alerts (Settings → Code security); stagger the expiry dates so
re-review is incremental; keep the current fail-closed design.

### 4.3 A gitlink with no `.gitmodules` breaks `git submodule` in a fresh clone

`git ls-files -s audit_temp/web-quality-skills` → `160000 afa8da9…` — a submodule
reference. There is no `.gitmodules`. In a fresh clone:

```
$ git submodule status
fatal: no submodule mapping found in .gitmodules for path 'audit_temp/web-quality-skills'
```

The directory is empty and `audit_temp/` has no content (its name suggests a scratch
area that was never meant to be committed). Any tooling that runs `git submodule
status/update` — several common CI setups do — fails hard on this repository.

**Fix:** `git rm --cached audit_temp/web-quality-skills` (and drop `audit_temp/`), or add
the mapping if the submodule was intended.

### 4.4 The blog schema and its security policy exist only as prose

`scripts/db/` holds five numbered, idempotent SQL migrations. The `blog_articles` table
and all four of its RLS policies are defined **only inside `docs/blog-admin-setup.md`**,
as a fenced code block. Consequences:

- the deployed policy cannot be diffed against a source of truth in review;
- §3.1's defect had nowhere to be caught — no migration to review, no test to run;
- `scripts/db/004_blog_seo_monetization.sql` explicitly says "RLS policies are unchanged",
  so the security-critical SQL is referenced but never versioned.

**Fix:** lift the table + policies out of the doc into `scripts/db/005_blog_articles.sql`
(idempotent, with the §3.1 correction), and leave the doc as an explanation that links to
it.

### 4.5 `firestore.rules` permits self-assigned `role: 'admin'` (latent)

```javascript
&& (!('role' in data) || (data.role == 'user' || data.role == 'admin'))
```

A signed-in user may write `role: 'admin'` to their own profile document
(`match /users/{userId}` allows update when `isOwner(userId)`).

**Currently not exploitable** — I traced the authorisation path: the blog studio gates on
`isPrimarySuperAdmin(user.email)` (`frontend/src/lib/superadmins.ts`, an email allowlist),
and no backend route reads a role from Firestore. Nothing consumes `role`.

It is still worth closing: the field is advertised as a role in
`firebase-blueprint.json` (`enum: ["user","admin"]`), so the next feature that trusts it
inherits a privilege-escalation bug.

**Fix:** drop `'admin'` from the writable set — allow only `role == 'user'` on
client writes — or remove the field from the rule entirely and manage it server-side.

---

## 5. Low & hygiene

### 5.1 Committed root cruft

Six tracked files that are dead weight or actively misleading:

| File | Why it is cruft |
|---|---|
| `fix-dash.cjs` | One-off regex rewriter for `Dashboard.tsx`; already applied |
| `patch.cjs` | Same, rewrites a Dashboard JSX block |
| `update_print_css.cjs` | Uncomments one CSS declaration in `index.css` |
| `test_pdf_export.cjs` | Reads `index.css`, logs `Checks complete` — asserts nothing |
| `test_perm.txt` | Contains the word `test` |
| `.npmrc.bak` | See below |
| `arena_patch.patch` | The patch this branch implements; now applied |

`.npmrc.bak` deserves its own note: npm reads `.npmrc`, **not** `.npmrc.bak`, so its
settings (`legacy-peer-deps=true`, `allowBuilds@tensorflow/tfjs-node=true`) are inert —
and `allowBuilds@…` is not a real npm key. Its header claims "there is no committed npm
lockfile", which is **false**: `package-lock.json` is tracked (844 kB) and `npm ci` works
without those flags. A file that documents a non-existent problem is worse than no file.

**Fix:** delete all seven (the `.bak` and patch file confidently). If `legacy-peer-deps`
is genuinely required, put it in a real `.npmrc`.

### 5.2 Documentation drift

- `HAZARDNET_WEBAPP_DEPLOYMENT_GUIDE.md:107` says "34 Jest suites" → **41** today
  (21 backend + 20 frontend), 405 tests.
- `docs/PRODUCTION_READINESS_SUMMARY.md:21` says "9 test suites" → **41** Jest + 18
  Python.
- No index exists for `docs/audits/` (10 documents including this one); only the runbook
  links them, and the previous audit in this series already flagged that drift is how
  stale guides survive.

**Fix:** update the two counts from a measured run and add `docs/audits/README.md`
listing each audit with a one-line outcome.

### 5.3 Frontend coverage is shallow, and its gate is off

Measured with CI's own command: **21.01 % statements, 17.61 % branches, 14.7 % functions,
17.7 % lines** across `collectCoverageFrom`. The `test-frontend` job passes
`--coverageThreshold='{}'`, disabling the gate, and the comment explains why: the 32 %
thresholds are calibrated for the backend job and "can never pass on a run that executes
no backend suites".

The effect is that the 32 % ratchet applies only to backend/API code; frontend has no
floor at all, and the large page components (`Dashboard.tsx` 68 kB, `DistrictDetailPage`
108 kB, `LiveMapView` 132 kB) have no component tests. This is a *known* state rather than
a defect — recording it so the number is not mistaken for coverage elsewhere.

### 5.4 Lint warnings and a large vendor chunk

- 272 ESLint warnings, dominated by `@typescript-eslint/no-explicit-any` and unused
  variables; 3 are auto-fixable. Nothing enforces them, so the count only grows.
- `vendor-pdf` is 849 kB raw / 240 kB gzip — the largest chunk, larger than
  `vendor-firebase` (611 kB). It is route-split, so it is not in the initial payload, but
  it is the obvious next target if the budget gets tight.

---

## 6. Dependency posture (informational)

Current majors are behind but not vulnerable: `express` 4.22 (5.2 available), `@mui/material`
6.5 (9.4), `eslint` 9.39 (10.10), `@testing-library/react` 14.3 (16.3), `@types/react` 18.3
(19.3 — React 18 is in use). Nothing here is urgent; the tfjs-node exceptions (§4.2) are
the only advisories, and they are reasoned.

---

## 7. Prioritised remediation

| Order | Action | Effort | Owner |
|---|---|---|---|
| 1 | Replace the three blog RLS policies with `auth.email()` (§3.1) | minutes | owner (Postgres) |
| 2 | Swap `sanitizeBlogHtml` for DOMPurify + regression tests (§3.2) | ~1 h | code |
| 3 | Fix the CI backend-test argv and add a guard test (§4.1) | minutes | code |
| 4 | Enable Dependabot alerts; stagger exception expiries (§4.2) | minutes | owner |
| 5 | Remove the gitlink + root cruft (§4.3, §5.1) | minutes | code |
| 6 | Move blog SQL into `scripts/db/` (§4.4) | ~30 min | code |
| 7 | Close the Firestore `role` field; fix doc drift; add audits index (§4.5, §5.2) | ~30 min | code |

Items 1 and 2 are the ones that change the site's security posture; the rest are
correctness, hygiene and durability.

---

## 8. Limits of this audit

- **No live database access.** §3.1 is assessed against the SQL the repository documents.
  Confirm the deployed policies before marking it closed.
- **No browser E2E run.** `npx playwright test` needs browsers from the CDN, which this
  environment cannot reach; the suite passed in CI (`E2E Tests`, 2 m 8 s) on the same
  commit, so E2E is green but unverified *here*.
- **No Vercel/Postgres credentials**, so runtime behaviour of the deployed site was not
  observed; `site-health.yml` covers that externally.
- **Branch protection could not be read** (the token lacks admin scope). Whether the CI
  jobs are *required* checks before merge is unknown, and that determines the real
  blast radius of §4.1.
- **Coverage figures** are from local runs, not Codecov.
- Findings are bounded by the surfaces inspected; `rag_pipeline/`, `agent/`,
  `monitoring/` and the vendored `.agents/`, `skills/`, `references/` trees received a
  structural review, not a line-by-line one.
