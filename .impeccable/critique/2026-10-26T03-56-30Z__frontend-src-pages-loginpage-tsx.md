---
target: Authentication (/login, /signup, /password)
total_score: 34
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:frontend/src/pages/LoginPage.tsx"
target_fingerprint: "sha256:1e25225708da747baba3079c5e8add847e88ebef6eb64208864c97dd3b8bd644"
target_path: frontend/src/pages/LoginPage.tsx
timestamp: 2026-10-26T03-56-30Z
slug: frontend-src-pages-loginpage-tsx
---
# Critique — authentication (`/login`, `/signup`, `/forgot-password`, `/update-password`, `/set-password`, `/auth/callback`)

**Target:** `frontend/src/pages/LoginPage.tsx, frontend/src/pages/SignUpPage.tsx, frontend/src/pages/ForgotPasswordPage.tsx, frontend/src/pages/UpdatePasswordPage.tsx, frontend/src/pages/SetPasswordPage.tsx, frontend/src/pages/AuthCallbackPage.tsx`
**Surface brief:** `.impeccable/surfaces/auth.md` · mode chosen by the brief
**Method:** A from source; B from the bundled detector (0 findings on every file in scope), the craft-floor gate (0 violations / 259 files) and the contrast gate (162 components clean in both themes). No render inspection, no sub-agent isolation.

> ⚠️ DEGRADED: single-context (no sub-agent tool exposed; no browser automation available)

## Heuristic score — 34 / 40

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 4 |
| 2 | Match between system and real world | 4 |
| 3 | User control and freedom | 3 |
| 4 | Consistency and standards | 4 |
| 5 | Error prevention | 4 |
| 6 | Recognition rather than recall | 3 |
| 7 | Flexibility and efficiency | 3 |
| 8 | Aesthetic and minimalist design | 4 |
| 9 | Error recovery | 4 |
| 10 | Help and documentation | 3 |

## Design specificity — pass



## Priority issues

**P2 · The reveal control announces its label but not its state** — The password toggle sets `aria-label` to "Show password" / "Hide password" and swaps it, but carries no `aria-pressed`. Both patterns work; the pair is inconsistent with a control that does expose state, so a screen-reader user cannot tell which of the two conventions this one follows.

**P2 · Error copy names the field, not the recovery** — The inline error region renders the provider's message verbatim. "Invalid login credentials" names the problem and not the next step; the page has a reset link but does not mention it at the moment it is needed.

## Positive findings

- No P0 or P1: labelled inputs, `aria-live` error regions, a 44px password reveal with a real label, disabled-until-valid submits, and a callback page that distinguishes a failed exchange from a slow one.
- Five auth screens share one visual grammar and one error region.
- `/auth/callback` handles the exchange failure explicitly rather than spinning forever.
- Labels are real `<label for>` elements, not placeholders.
- No password is ever echoed into a console statement.

## Not tested

The forms at 125% text with a virtual keyboard open, and the callback page's offline path.
