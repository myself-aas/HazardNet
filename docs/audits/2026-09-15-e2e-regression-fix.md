# District and mobile-navigation E2E regression repair

## Failures investigated

CI run `34890312632` reported six failures: district-card search/open tests on desktop and mobile, plus two mobile-menu tests.

- District search used an ambiguous substring locator that matched both the forecast heading and the renamed CTA.
- The open-brief test expected the removed “View Detailed Disaster Analytics” label and depended on an implicitly focused district.
- Local Chromium reproduction exposed a real interaction defect: the prediction-error toast intercepted the drawer close button. The drawer was trapped in the app navigation stacking context beneath the root toast layer. The same toast could also intercept the search trigger. Hovering over it could keep it alive, so waiting longer was not a fix.

## Repair

- Scope district lookup to the named forecast region.
- Start the open-brief test with Kurigram / 15 days explicitly selected; click “Read district forecast” and assert the exact district/horizon URL and heading.
- Portal the drawer to the document body and place backdrop/panel above notifications.
- Keep the toast layer below navigation and offset status messages below the header on non-auth pages.
- Add a controlled 503-response regression that keeps the error toast visible while closing the mobile drawer via an ordinary click. No force-clicks, hidden checks, disabled tests or increased timeouts.

## Local validation

- Entire Playwright suite: **48 passed**, retries disabled, desktop and Pixel 7 projects, against the built frontend.
- Unit/integration tests: **54 suites / 507 passed**.
- TypeScript, frontend production build, ESLint (0 errors; existing warnings remain), bundle budget and diff whitespace checks passed.

The usual browser download and GitHub artifact endpoints were unavailable in the sandbox. A temporary Chromium 153 binary was obtained through `@sparticuz/chromium`, outside the repository, with its bundled runtime libraries. A temporary local Playwright config selected that binary, used two workers, and disabled retries. It was removed after testing. No browser package, binary or local-only config was added to project dependencies or Git. CI still uses its normal Playwright Chromium installation and four workers; remote CI verification is a separate step.
