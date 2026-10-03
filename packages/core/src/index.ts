/**
 * Main exports for @hazardnet/core
 *
 * This package contains pure TypeScript with NO dependencies on React,
 * React Native, or the DOM. It is safe to import from any platform.
 */

export * from './contracts';
export * from './forecasts';
export * from './alertPolicy';
export * from './dataStates';
export * from './freshness';
export * from './geo';
export * from './haptics';
export * from './dedupe';
export * from './queryKeys';
export * from './analytics';
export * from './savedPlaces';
export * from './notifications';
// The advisory dataset is re-exported value-by-value rather than with a wildcard: `alertPolicy`
// already exports an `EmergencyContact` (the hotline directory), and that package's `EMERGENCY_CONTACTS`
// has a different shape (agency, department, landline, scope) from the advisory one. Naming the
// exports keeps the collision visible instead of resolving it silently.
export { SECTOR_ADVISORIES } from './sectorAdvisories';
export type {
  SectorAdvisoryData,
  TechnicalStep,
  CultivarOrInputSpec,
  OfficialDocLink,
} from './sectorAdvisories';
export type { EmergencyContact as AdvisoryEmergencyContact } from './sectorAdvisories';
export * from './notificationMatcher';
