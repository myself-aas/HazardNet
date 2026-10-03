/**
 * Re-export shim.
 *
 * The advisory dataset itself moved to `@hazardnet/core` (`sectorAdvisories.ts`) when the native
 * Advisories screen landed: both platforms need the same protocols, and a copy per platform is
 * how the two drift. Web imports keep working through this file, and the path is the one the
 * existing call sites and tests already use.
 */

export * from '@hazardnet/core/sectorAdvisories';
