/**
 * Web re-export of the shared token engine.
 *
 * This file used to be a 179-line copy of `packages/design-system/src/tokens.ts` (same
 * `HDS_TOKENS` name, near-identical colour block, a typography block that named four families the
 * bundle never loaded). Nothing that rendered used its colours: the only consumer was
 * `components/ui/BottomSheet.tsx`, for `touch.*` and `motion.*`. The cost was a second source of
 * hex - which is how the phone ended up drawing SEVERE as `#f64137` while the web drew danger as
 * `#970002`, with a parity test that asserted this copy and stayed green.
 *
 * The package is the one source now (`docs/audits/2026-10-03-frontend-design-system-audit.md`,
 * P0-2). Import from `@hazardnet/design-system` in new code; this path stays so existing imports
 * keep resolving and so `__tests__/designTokensParity.test.js` can assert the two paths are the
 * same object.
 */
export { HDS_TOKENS, HDS_NASA_TOKENS, getSeverityTokenScore, getReactNativeTokenStyle } from '@hazardnet/design-system';
export type { HDSTokenType } from '@hazardnet/design-system';
