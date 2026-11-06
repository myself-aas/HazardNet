---
target: "entire frontend — mobile responsiveness @375px / @768px"
skill: "ui-ux-pro-max-skill ui-ux-pro-max SKILL.md (priority 2 Touch & Interaction, priority 5 Layout & Responsive)"
timestamp: 2026-11-06T02:00:00Z
slug: mobile-responsiveness-audit
---

# Mobile responsiveness audit — 2026-11-06

**Method:** the skill's mobile contract (mobile-first breakpoints, viewport meta with zoom
enabled, no horizontal scroll, no fixed px page widths, 44×44px touch targets, safe-area
insets, fixed elements must not obscure content) checked statically and via the repo's gates.
Playwright browser binaries are not downloadable in this sandbox (CDN unreachable), so the
existing `e2e/mobile-responsive.spec.ts` suite could not be executed here; it remains the
authoritative browser check in CI.

## Findings — pass

- **Viewport meta:** `width=device-width, initial-scale=1.0, viewport-fit=cover`; zoom NOT
  disabled (no `user-scalable=no` / `maximum-scale=1`).
- **No horizontal scroll guard:** `overflow-x: clip` on html/body; every wide element on the
  new pages scrolls locally (`overflow-x-auto` on report tables, archive table, profile tab
  bar). No fixed-px page containers (only fluid `max-w-*`).
- **Touch targets:** tab buttons are py-3 + text-sm ≈ 44px; back-to-top FAB is h-11 w-11 (44px);
  global 44px minimums enforced by the craft floor gate.
- **Safe areas:** chat bar, chat sheet and back-to-top FAB all respect
  `env(safe-area-inset-*)`; footer reserves `calc(6rem + safe-area)` bottom padding so the
  fixed chat bar never covers footer content.
- **Fixed-element overlap:** back-to-top FAB raised to `bottom-[max(5.75rem,…)]` clear of the
  full-width chat bar (fixed earlier this session); chat opens as a full-screen sheet on phones.

## Improvements applied this pass

1. `UserProfilePage` sticky tab bar: hardcoded `-mx-4 px-4 sm:-mx-6 sm:px-6` replaced with the
   design-system spacing token `-mx-ap-lg px-ap-lg` so the bar aligns edge-to-edge with the
   `Container`'s padding at every breakpoint.
2. `ReportsPage` / `ReportsArchivePage`: page gutters moved from `px-4` to the `px-ap-lg` token
   for consistency with the rest of the site.

## Gates after changes

`tsc --noEmit` PASS · profile + dashboard suites 15/15 PASS · full frontend suite 792/792 PASS
· token-compliance / craft-floor / contrast / residue / prose-dashes all PASS.

## Not tested here

Real-device/emulator rendering at 360–375px (no browser binary in sandbox); run
`e2e/mobile-responsive.spec.ts` in CI for the pixel-level overflow assertions.
