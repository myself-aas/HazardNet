import { ALL_64_DISTRICTS, DistrictData, getDistrictById } from './bangladeshDistricts';

export interface UpazilaImpact {
  name: string;
  severityScore: number; // 0.0 to 1.0
  status: 'Critically Inundated' | 'High Risk' | 'Moderate Impact' | 'Alert Mode';
  householdsAffected: number;
}

/**
 * ⚠ This module SYNTHESISES a district detail view. The exposure figures
 * (impact area, population, upazila lists, shelters, relief tonnage) and
 * `confidenceLevel` are derived from the static district baseline
 * (`bangladeshDistricts.ts`) for display; they are not model output and must not
 * be presented as such. `confidenceLevel` in particular is
 * `92 + severity * 7.2` — a display score, not a calibrated probability (Phase 3
 * model ops: `docs/model-ops/CALIBRATION.md`, and the copy guards in
 * `scripts/tests/test_model_claims.py`). Replacing this panel with served
 * forecast fields is tracked for Phase 5.
 */
export interface GranularDisasterData {
  districtId: string;
  districtName: string;
  division: string;
  // Mirrors DistrictData['hazardType'] (static baseline + live model classes).
  hazardType:
    | 'Flash Flood'
    | 'Monsoon Flood'
    | 'Drought'
    | 'Tropical Cyclone'
    | 'Cold Wave'
    | 'Severe Storm'
    | 'Flood'
    | 'Heat Wave'
    | 'Fire'
    | 'Severe Local Storm';
  hazardSubtype: string;
  incidentDate: string;
  peakImpactWindow: string;
  lastSatelliteUpdate: string;
  estimatedImpactAreaKm2: number;
  totalDistrictAreaKm2: number;
  impactAreaPercentage: number;
  affectedPopulation: number;
  affectedHouseholds: number;
  affectedCropLandHectares: number;
  primaryCropsAtRisk: string[];
  elevationMeters: number;
  physicalSensorMetrics: {
    primaryMetricName: string;
    primaryMetricValue: string;
    secondaryMetricName: string;
    secondaryMetricValue: string;
    sensorStationName: string;
  };
  impactedUpazilas: UpazilaImpact[];
  modelAssessment: {
    continuousSeverityIndex: number;
    riskCategory: 'Low' | 'Moderate' | 'High';
    confidenceProbabilities: {
      hazard: string;
      probability: number;
    }[];
    // Display score derived from the static baseline severity — NOT a calibrated
    // probability and not read from the published forecast. See the module header.
    confidenceLevel: number; // e.g. 96.4%
  };
  emergencyResponse: {
    activeShelters: number;
    shelterCapacityUsedPercent: number;
    reliefDistributedTons: number;
    medicalTeamsDeployed: number;
    advisoryBullets: string[];
  };
  historicalComparison: string;
}

// Generate realistic granular disaster details for any district in Bangladesh
export function getGranularDisasterData(districtId: string): GranularDisasterData {
  const district = getDistrictById(districtId) || ALL_64_DISTRICTS[0];
  const sev = district.severity;

  // Base estimations derived from district geography and severity
  const approxTotalArea = Math.round(1200 + (district.lat * 100) % 1800); // 1200 - 3000 sq km
  const estimatedImpactKm2 = Math.round(approxTotalArea * (0.15 + sev * 0.65));
  const impactPct = Math.min(98, Math.round((estimatedImpactKm2 / approxTotalArea) * 100));
  const populationMultiplier = district.division === 'Dhaka' ? 450000 : district.division === 'Chattogram' ? 320000 : 210000;
  const affectedPop = Math.round(populationMultiplier * (0.2 + sev * 1.1));
  const affectedHouseholds = Math.round(affectedPop / 4.4);
  const cropHectares = Math.round(25000 + sev * 42000);

  // Upazila list generation based on district name
  const upazilaSuffixes = ['Sadar', 'North', 'South', 'East', 'West', 'Char Region', 'Bazar'];
  const impactedUpazilas: UpazilaImpact[] = upazilaSuffixes.map((sfx, idx) => {
    const upName = idx === 0 ? `${district.name} Sadar` : `${district.name} ${sfx}`;
    const upSev = Math.min(0.98, Math.max(0.25, sev + (idx % 2 === 0 ? 0.08 : -0.12)));
    const status: UpazilaImpact['status'] =
      upSev >= 0.82
        ? 'Critically Inundated'
        : upSev >= 0.65
        ? 'High Risk'
        : upSev >= 0.45
        ? 'Moderate Impact'
        : 'Alert Mode';
    return {
      name: upName,
      severityScore: Number(upSev.toFixed(2)),
      status,
      householdsAffected: Math.round(affectedHouseholds / 7 * (1 + (6 - idx) * 0.15)),
    };
  });

  // Hazard specific metrics & subtypes
  let subtype: string;
  let primaryMetricName: string;
  let primaryMetricValue: string;
  let secondaryMetricName: string;
  let secondaryMetricValue: string;
  const stationName = `${district.name} Hydro-Met Station #${Math.floor(district.lat * 10) % 90 + 10}`;
  let advisories: string[];
  let comparison: string;

  switch (district.hazardType) {
    case 'Flash Flood':
      subtype = 'Pre-Monsoon Runoff & Haor Inundation';
      primaryMetricName = 'Surge Crest above Danger Level';
      primaryMetricValue = `+${(1.1 + sev * 1.4).toFixed(2)} m`;
      secondaryMetricName = '24-hr Upstream Rainfall';
      secondaryMetricValue = `${Math.round(180 + sev * 220)} mm`;
      advisories = [
        'Immediate early harvest of mature Boro rice in low-lying Haor basins.',
        'Deploy mobile water purification units and temporary livestock platforms.',
        'Activate emergency sluice gates and monitor embankment breach points.'
      ];
      comparison = `Exceeds the 2022 Flash Flood crest benchmark by +${(sev * 15).toFixed(0)}cm in low-lying agricultural zones.`;
      break;

    case 'Monsoon Flood':
      subtype = 'Riverine Overflow & Char Inundation';
      primaryMetricName = 'Water Level above Danger Line';
      primaryMetricValue = `+${(0.8 + sev * 1.5).toFixed(2)} m`;
      secondaryMetricName = '72-hr River Discharge Rate';
      secondaryMetricValue = `${Math.round(85000 + sev * 35000)} m³/s`;
      advisories = [
        'Reinforce vulnerable earthen embankments along primary river corridors.',
        'Distribute dry ration packs and water purification tablets to Char communities.',
        'Coordinate early evacuation of cattle to raised Killa structures.'
      ];
      comparison = `Flow velocity and river stage rival the major 2020 Brahmaputra/Jamuna monsoon inundation event.`;
      break;

    case 'Tropical Cyclone':
      subtype = 'Category 3 Coastal Cyclone & Storm Surge';
      primaryMetricName = 'Max Sustained Wind Speed';
      primaryMetricValue = `${Math.round(110 + sev * 65)} km/h`;
      secondaryMetricName = 'Predicted Storm Surge Height';
      secondaryMetricValue = `${(2.2 + sev * 2.8).toFixed(1)} m`;
      advisories = [
        'Mandatory evacuation to coastal cyclone shelters for high-risk seawall zones.',
        'Secure coastal salt beds, betel leaf sheds, and shrimp aquaculture gher enclosures.',
        'Suspend all maritime vessel operations and clear emergency coastal access roads.'
      ];
      comparison = `Surge pressure profile closely aligns with Cyclone Sidr (2007) and Amphan (2020) coastal trajectories.`;
      break;

    case 'Drought':
      subtype = 'Barind Tract Agricultural Soil Moisture Deficit';
      primaryMetricName = 'SPEI Drought Index (3-Month)';
      primaryMetricValue = `-${(1.2 + sev * 0.9).toFixed(2)} (Extreme)`;
      secondaryMetricName = 'Volumetric Soil Moisture (0-30cm)';
      secondaryMetricValue = `${(18 - sev * 11).toFixed(1)} %`;
      advisories = [
        'Initiate alternate wetting and drying (AWD) irrigation for standing Aman paddy.',
        'Deepen tube-well suction pipes and regulate industrial groundwater extraction.',
        'Promote drought-tolerant crop varieties (BRRI dhan56/57) for next sowing cycle.'
      ];
      comparison = `Subsurface moisture depletion is the severe driest period recorded in Barind since 2016.`;
      break;

    case 'Cold Wave':
      subtype = 'Severe Sub-Himalayan Temperature Anomaly';
      primaryMetricName = 'Minimum Night Temperature';
      primaryMetricValue = `${(10.5 - sev * 4.8).toFixed(1)} °C`;
      secondaryMetricName = 'Fog Duration / Sunlight Deficit';
      secondaryMetricValue = `${Math.round(14 + sev * 8)} hrs/day`;
      advisories = [
        'Cover seedbeds with polythene sheets to prevent cold injury on boro seedlings.',
        'Provide thermal blankets and warm shelter support to vulnerable elderly populations.',
        'Apply light night irrigation to crop fields to buffer root zone temperatures.'
      ];
      comparison = `Cold snap matches the lowest minimum temperature recorded in Northern Bangladesh in 2018.`;
      break;

    default: // Severe Storm
      subtype = 'Convective Nor\'wester (Kalbaishakhi) & Hailstorm';
      primaryMetricName = 'Peak Gust Speed';
      primaryMetricValue = `${Math.round(85 + sev * 40)} km/h`;
      secondaryMetricName = 'Radar Echo Intensity';
      secondaryMetricValue = `${Math.round(52 + sev * 12)} dBZ`;
      advisories = [
        'Tie down temporary structures, greenhouse plastic covers, and fruit orchard supports.',
        'Issue localized lightning alerts for open field agricultural workers.',
        'Inspect electrical distribution grids for wind-blown branch interference.'
      ];
      comparison = `Convective cell energy parameters reflect classic high-intensity pre-monsoon squall lines.`;
      break;
  }

  // confidence probability distribution
  const primaryProb = Number((0.62 + sev * 0.32).toFixed(2));
  const remain = Number((1.0 - primaryProb).toFixed(2));
  const confidenceProbabilities = [
    { hazard: district.hazardType, probability: primaryProb },
    { hazard: district.hazardType === 'Monsoon Flood' ? 'Flash Flood' : 'Monsoon Flood', probability: Number((remain * 0.55).toFixed(2)) },
    { hazard: 'Drought', probability: Number((remain * 0.25).toFixed(2)) },
    { hazard: 'Tropical Cyclone', probability: Number((remain * 0.20).toFixed(2)) },
  ];

  return {
    districtId: district.id,
    districtName: district.name,
    division: district.division,
    hazardType: district.hazardType,
    hazardSubtype: subtype,
    incidentDate: '2026-07-31 06:00 BST',
    peakImpactWindow: 'Jul 31 - Aug 05, 2026',
    lastSatelliteUpdate: 'Satellite-1 satellite • 2026-08-01 03:20 UTC',
    estimatedImpactAreaKm2: estimatedImpactKm2,
    totalDistrictAreaKm2: approxTotalArea,
    impactAreaPercentage: impactPct,
    affectedPopulation: affectedPop,
    affectedHouseholds: affectedHouseholds,
    affectedCropLandHectares: cropHectares,
    primaryCropsAtRisk: district.mainCrop.split('&').map((c) => c.trim()),
    elevationMeters: district.elevationMeters,
    physicalSensorMetrics: {
      primaryMetricName,
      primaryMetricValue,
      secondaryMetricName,
      secondaryMetricValue,
      sensorStationName: stationName,
    },
    impactedUpazilas,
    modelAssessment: {
      continuousSeverityIndex: district.severity,
      riskCategory: district.risk,
      confidenceProbabilities,
      // Display score for the panel; see the module header. Do not describe it as
      // a calibrated confidence — nothing in this repository is calibrated.
      confidenceLevel: Number((92 + sev * 7.2).toFixed(1)),
    },
    emergencyResponse: {
      activeShelters: Math.round(35 + sev * 110),
      shelterCapacityUsedPercent: Math.round(25 + sev * 68),
      reliefDistributedTons: Math.round(120 + sev * 480),
      medicalTeamsDeployed: Math.round(8 + sev * 32),
      advisoryBullets: advisories,
    },
    historicalComparison: comparison,
  };
}
