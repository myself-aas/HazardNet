/**
 * Re-export shim.
 *
 * The advisory dataset itself moved to `@hazardnet/core` (`sectorAdvisories.ts`) when the native
 * Advisories screen landed: both platforms need the same protocols, and a copy per platform is how
 * the two drift. Web imports keep working through this file, and the path is the one the existing
 * call sites and tests already use.
 *
 * The import is from the package root rather than `@hazardnet/core/sectorAdvisories`: the frontend
 * aliases the bare specifier to the package's source entry, and the subpath form is not in the
 * package's exports map (the Vite build fails on it). The advisory `EmergencyContact` is re-exported
 * under its original name here - inside the package it is `AdvisoryEmergencyContact`, because
 * `alertPolicy` already owns a different `EmergencyContact`.
 */

export { SECTOR_ADVISORIES } from '@hazardnet/core';
export type {
  SectorAdvisoryData,
  TechnicalStep,
  CultivarOrInputSpec,
  OfficialDocLink,
  AdvisoryEmergencyContact as EmergencyContact,
} from '@hazardnet/core';
