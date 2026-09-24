import MaterialIcon from "./MaterialIcon";
import React from 'react';
import { useMemo, useState } from 'react';
import { ALL_8_DIVISIONS, DistrictData, DivisionData } from '../data/bangladeshDistricts';
import { useLiveDistricts } from '../hooks/useForecasts';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  PieChart,
  Pie
} from 'recharts';

interface NationalOverviewProps {
  onSelectDistrict?: (district: DistrictData) => void;
  onSelectDivision?: (divisionName: string) => void;
}

export interface HazardSummary {
  hazardName: string;
  districtCount: number;
  avgSeverity: number; // 0 to 1
  minSeverity: number;
  maxSeverity: number;
  compositeScore: number; // districtCount * avgSeverity
  highRiskCount: number;
  moderateRiskCount: number;
  lowRiskCount: number;
  impactedCrops: string[];
  affectedDivisions: string[];
  icon: string;
  color: string;
}

export interface DivisionSummary {
  division: DivisionData;
  districtCount: number;
  highRiskDistrictCount: number;
  avgSeverity: number;
  primaryHazard: string;
  districts: DistrictData[];
}

const HAZARD_METADATA: Record<string, { icon: string; color: string; bg: string; border: string }> = {
  'Monsoon Flood': { icon: 'water', color: '#38bdf8', bg: 'bg-sky-500/10', border: 'border-sky-500/30' },
  'Flash Flood': { icon: 'bolt', color: '#06b6d4', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
  'Tropical Cyclone': { icon: 'cyclone', color: '#f43f5e', bg: 'bg-rose-500/10', border: 'border-rose-500/30' },
  'Drought': { icon: 'sunny', color: '#f59e0b', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  'Cold Wave': { icon: 'ac_unit', color: '#a855f7', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
  'Severe Storm': { icon: 'thunderstorm', color: '#eab308', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  'Severe Local Storm': { icon: 'thunderstorm', color: '#eab308', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' }
};

export const NationalOverview: React.FC<NationalOverviewProps> = ({
  onSelectDistrict,
  onSelectDivision
}) => {
  const [selectedHazardFilter, setSelectedHazardFilter] = useState<string | null>(null);
  const [selectedDivisionFilter, setSelectedDivisionFilter] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'top3' | 'all_hazards' | 'divisions' | 'formula'>('top3');

  // Live forecast overlay (weekly pipeline via /api/v1/forecasts/bulk);
  // static baseline when the API is unreachable.
  const { districts } = useLiveDistricts();

  // 1. Calculate Hazard Summaries using {unique_hazard_name} + {district_counts} + {districts_average_severity_score}
  const { hazardSummaries, top3Hazards, nationalAvgSeverity, totalDistricts } = useMemo(() => {
    const grouped: Record<string, DistrictData[]> = {};

    districts.forEach((district) => {
      const hazard = district.hazardType || 'Monsoon Flood';
      if (!grouped[hazard]) grouped[hazard] = [];
      grouped[hazard].push(district);
    });

    const summaries: HazardSummary[] = Object.entries(grouped).map(([hazardName, districts]) => {
      const count = districts.length;
      const sumSeverity = districts.reduce((acc, d) => acc + (d.severity || 0.5), 0);
      const avgSeverity = sumSeverity / count;

      const severities = districts.map((d) => d.severity || 0.5);
      const minSeverity = Math.min(...severities);
      const maxSeverity = Math.max(...severities);

      // Composite Score formula = districtCount * avgSeverity
      const compositeScore = count * avgSeverity;

      const highRiskCount = districts.filter((d) => d.risk === 'High').length;
      const moderateRiskCount = districts.filter((d) => d.risk === 'Moderate').length;
      const lowRiskCount = districts.filter((d) => d.risk === 'Low').length;

      const cropsSet = new Set<string>();
      const divisionsSet = new Set<string>();

      districts.forEach((d) => {
        if (d.mainCrop) cropsSet.add(d.mainCrop.split('&')[0].trim());
        if (d.division) divisionsSet.add(d.division);
      });

      const meta = HAZARD_METADATA[hazardName] || {
        icon: 'warning',
        color: '#ef4444',
        bg: 'bg-red-500/10',
        border: 'border-red-500/30'
      };

      return {
        hazardName,
        districtCount: count,
        avgSeverity,
        minSeverity,
        maxSeverity,
        compositeScore,
        highRiskCount,
        moderateRiskCount,
        lowRiskCount,
        impactedCrops: Array.from(cropsSet).slice(0, 4),
        affectedDivisions: Array.from(divisionsSet),
        icon: meta.icon,
        color: meta.color
      };
    });

    // Sort by composite score descending to get predicted top hazards
    summaries.sort((a, b) => b.compositeScore - a.compositeScore);

    const top3 = summaries.slice(0, 3);
    const overallAvgSeverity =
      districts.reduce((acc, d) => acc + (d.severity || 0.5), 0) / districts.length;

    return {
      hazardSummaries: summaries,
      top3Hazards: top3,
      nationalAvgSeverity: overallAvgSeverity,
      totalDistricts: districts.length
    };
  }, [districts]);

  // 2. Calculate Division Summaries/Regions
  const divisionSummaries = useMemo(() => {
    const list: DivisionSummary[] = ALL_8_DIVISIONS.map((div) => {
      const districtsInDiv = districts.filter(
        (d) => d.division.toLowerCase() === div.id.toLowerCase() || div.name.toLowerCase().includes(d.division.toLowerCase())
      );

      const count = districtsInDiv.length || div.districtCount;
      const sumSeverity = districtsInDiv.reduce((acc, d) => acc + (d.severity || 0.5), 0);
      const avgSev = count > 0 ? sumSeverity / count : div.avgSeverity;

      const highRiskCount = districtsInDiv.filter((d) => d.risk === 'High').length;

      // Primary hazard in this division
      const hazardCounts: Record<string, number> = {};
      districtsInDiv.forEach((d) => {
        hazardCounts[d.hazardType] = (hazardCounts[d.hazardType] || 0) + 1;
      });
      let primaryH = div.primaryHazard;
      let maxHCount = 0;
      Object.entries(hazardCounts).forEach(([h, cnt]) => {
        if (cnt > maxHCount) {
          maxHCount = cnt;
          primaryH = h;
        }
      });

      return {
        division: div,
        districtCount: count,
        highRiskDistrictCount: highRiskCount,
        avgSeverity: avgSev,
        primaryHazard: primaryH,
        districts: districtsInDiv
      };
    });

    // Alphabetical browsing only; no research-derived ranking.
    list.sort((a, b) => a.division.name.localeCompare(b.division.name));
    return list;
  }, [districts]);

  // Filtered districts list when a hazard or division card is selected
  const filteredDistricts = useMemo(() => {
    return districts.filter((d) => {
      if (selectedHazardFilter && d.hazardType !== selectedHazardFilter) return false;
      if (selectedDivisionFilter && !d.division.toLowerCase().includes(selectedDivisionFilter.toLowerCase())) return false;
      return true;
    });
  }, [selectedHazardFilter, selectedDivisionFilter, districts]);

  return (
    <div className="bg-white border border-carbon-20/90 rounded-3xl p-6 sm:p-8 md:p-10 shadow-md space-y-8 text-carbon-80 relative overflow-hidden transition-all duration-300 hover:shadow-lg">
      
      {/* Background Ambient Glow */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-rose-500/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header Bar */}
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-carbon-20">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="px-3 py-1 rounded-full text-xs font-mono font-black uppercase tracking-wider bg-nasa-red/10 text-nasa-red-shade border border-nasa-blue/20 shadow-2xs flex items-center gap-1.5">
              National AI Overview Mode
            </span>
            <span className="text-carbon-30 hidden sm:inline">•</span>
            <span className="text-xs font-mono text-carbon-60 bg-carbon-05 px-2.5 py-1 rounded-lg border border-carbon-20/90">
              Formula: <code className="text-emerald-600 font-bold">{`{unique_hazard_name} + {district_counts} + {avg_severity}`}</code>
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-carbon-90 tracking-tight leading-tight">
            National Hazard & Division Overview
          </h2>
          <p className="text-xs sm:text-sm text-carbon-60 max-w-4xl leading-relaxed">
            Aggregating multi-spectral telemetry across all 64 districts of Bangladesh to predict the <strong className="text-carbon-90 font-bold">Top 3 National Hazards</strong> and browse the <strong className="text-carbon-90 font-bold">Division Summaries</strong>.
          </p>
        </div>

        {/* Executive KPI Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
          <div className="bg-carbon-05/80 border border-carbon-20/90 p-3.5 rounded-2xl flex flex-col justify-center shadow-2xs">
            <span className="text-[10px] font-mono text-carbon-60 uppercase font-bold">Analyzed Districts</span>
            <span className="text-xl font-black text-carbon-90">{totalDistricts} / 64</span>
            <span className="text-[10px] text-emerald-600 font-mono">Full national coverage</span>
          </div>

          <div className="bg-carbon-05/80 border border-carbon-20/90 p-3.5 rounded-2xl flex flex-col justify-center shadow-2xs">
            <span className="text-[10px] font-mono text-carbon-60 uppercase font-bold">National Severity</span>
            <span className="text-xl font-black text-amber-600">{(nationalAvgSeverity * 100).toFixed(1)}%</span>
            <span className="text-[10px] text-carbon-60 font-mono">Index {nationalAvgSeverity.toFixed(2)}</span>
          </div>

          <div className="bg-carbon-05/80 border border-carbon-20/90 p-3.5 rounded-2xl col-span-2 sm:col-span-1 flex flex-col justify-center shadow-2xs">
            <span className="text-[10px] font-mono text-carbon-60 uppercase font-bold">#1 Predicted Hazard</span>
            <span className="text-sm font-black text-rose-600 truncate">{top3Hazards[0]?.hazardName || 'Monsoon Flood'}</span>
            <span className="text-[10px] text-carbon-60 font-mono">{top3Hazards[0]?.districtCount} Districts</span>
          </div>
        </div>
      </div>

      {/* Dynamic Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-carbon-05 p-2 rounded-2xl border border-carbon-20">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('top3')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 ${
              activeTab === 'top3'
                ? 'bg-nasa-red text-carbon-90 shadow-xs scale-[1.02]'
                : 'text-carbon-60 hover:text-carbon-90 hover:bg-carbon-10'
            }`}
          >
            <span className="flex items-center gap-1.5"><MaterialIcon name="severity" className="w-4 h-4 text-amber-600" /> Top 3 Predicted Hazards</span>
          </button>

          <button
            onClick={() => setActiveTab('divisions')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 ${
              activeTab === 'divisions'
                ? 'bg-nasa-red text-carbon-90 shadow-xs scale-[1.02]'
                : 'text-carbon-60 hover:text-carbon-90 hover:bg-carbon-10'
            }`}
          >
            <span>🗺️ Division Summaries ({divisionSummaries.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('all_hazards')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 ${
              activeTab === 'all_hazards'
                ? 'bg-nasa-red text-carbon-90 shadow-xs scale-[1.02]'
                : 'text-carbon-60 hover:text-carbon-90 hover:bg-carbon-10'
            }`}
          >
            <MaterialIcon name="analytics" className="w-4 h-4 inline-block mr-1" /><span>All Unique Hazards Breakdown ({hazardSummaries.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('formula')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 ${
              activeTab === 'formula'
                ? 'bg-nasa-red text-carbon-90 shadow-xs scale-[1.02]'
                : 'text-carbon-60 hover:text-carbon-90 hover:bg-carbon-10'
            }`}
          >
            <span>🧮 AI Formula Matrix</span>
          </button>
        </div>

        {(selectedHazardFilter || selectedDivisionFilter) && (
          <button
            onClick={() => {
              setSelectedHazardFilter(null);
              setSelectedDivisionFilter(null);
            }}
            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all"
          >
            <span>Clear Filters</span>
            <MaterialIcon name="close" className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* SECTION 1: TOP 3 PREDICTED HAZARDS (PODIUM CARDS) */}
      {(activeTab === 'top3' || activeTab === 'formula') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg sm:text-xl font-extrabold text-carbon-90 flex items-center gap-2">
              <span>Top 3 Predicted National Hazards</span>
              <span className="text-xs font-mono font-normal text-carbon-60">
                (Ranked by Composite Score = District Count × Average Severity Score)
              </span>
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {top3Hazards.map((hazard, index) => {
              const ranks = [
                { badge: '#1 Highest Threat', bg: 'bg-rose-50/60', border: 'border-rose-200', badgeColor: 'bg-rose-600 text-white' },
                { badge: '#2 Severe Risk', bg: 'bg-amber-50/60', border: 'border-amber-200', badgeColor: 'bg-amber-500 text-carbon-90' },
                { badge: '#3 Major Concern', bg: 'bg-sky-50/60', border: 'border-sky-200', badgeColor: 'bg-sky-500 text-carbon-90' }
              ];
              const rankInfo = ranks[index] || ranks[2];
              const isSelected = selectedHazardFilter === hazard.hazardName;

              return (
                <div
                  key={hazard.hazardName}
                  onClick={() => setSelectedHazardFilter(isSelected ? null : hazard.hazardName)}
                  className={`cursor-pointer ${rankInfo.bg} border ${
                    isSelected ? 'border-2 border-carbon-90 ring-2 ring-carbon-90/10' : rankInfo.border
                  } rounded-3xl p-6 shadow-xs transition-all duration-200 hover:scale-[1.01] flex flex-col justify-between space-y-5 relative overflow-hidden`}
                >
                  {/* Top Badge */}
                  <div className="flex items-center justify-between">
                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${rankInfo.badgeColor} shadow-xs`}>
                      {rankInfo.badge}
                    </span>
                    <MaterialIcon name="{hazard.icon}" className="w-4 h-4 inline-block mr-1" />
                  </div>

                  {/* Hazard Title & Formula Value */}
                  <div className="space-y-1">
                    <h4 className="text-xl font-black text-carbon-90">{hazard.hazardName}</h4>
                    <div className="text-xs font-mono text-carbon-60 flex items-center gap-2">
                      <span>Composite Index:</span>
                      <strong className="text-sky-700 font-bold text-sm">
                        {hazard.compositeScore.toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  {/* Formula Variables Breakdown Box */}
                  <div className="bg-white/80 p-3.5 rounded-2xl border border-carbon-20 space-y-2 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-carbon-60">District Count:</span>
                      <span className="text-carbon-90 font-bold">{hazard.districtCount} Districts</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-carbon-60">Avg Severity Score:</span>
                      <span className="text-amber-600 font-bold">
                        {(hazard.avgSeverity * 100).toFixed(1)}% ({hazard.avgSeverity.toFixed(2)})
                      </span>
                    </div>

                    {/* Progress Bar for Avg Severity */}
                    <div className="w-full bg-carbon-10 rounded-full h-2 overflow-hidden border border-carbon-20">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(hazard.avgSeverity * 100, 100)}%`,
                          backgroundColor: hazard.color
                        }}
                      ></div>
                    </div>

                    <div className="pt-1.5 border-t border-carbon-20 flex items-center justify-between text-[11px]">
                      <span className="text-carbon-60">High Risk Proportion:</span>
                      <span className="text-rose-600 font-bold">
                        {hazard.highRiskCount} High / {hazard.districtCount}
                      </span>
                    </div>
                  </div>

                  {/* Impacted Crops & Divisions */}
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-carbon-60 text-[10px] uppercase font-mono block">Primary Crops Impacted</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {hazard.impactedCrops.map((crop, i) => (
                          <span key={i} className="px-2 py-0.5 bg-carbon-10 border border-carbon-20 rounded-md text-carbon-70 text-[11px]">
                            {crop}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-carbon-20 flex items-center justify-between text-carbon-60">
                      <span>Divisions: {hazard.affectedDivisions.slice(0, 3).join(', ')}</span>
                      <span className="text-sky-700 text-[11px] font-bold underline">
                        {isSelected ? 'Filtered' : 'Click to Filter'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 2: DIVISION SUMMARIES */}
      {(activeTab === 'divisions' || activeTab === 'formula' || activeTab === 'top3') && (
        <div className="space-y-4 pt-4 border-t border-carbon-20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-lg sm:text-xl font-extrabold text-carbon-90 flex items-center gap-2">
                <span>Division Summaries</span>
                <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-xs font-mono font-bold">
                  {divisionSummaries.length} divisions
                </span>
              </h3>
              <p className="text-xs text-carbon-60 font-mono mt-0.5">
                Divisions listed alphabetically. Counts and mean district severity are descriptive summaries.
              </p>
            </div>

            {selectedDivisionFilter && (
              <span className="text-xs font-mono text-sky-800 bg-sky-50 px-3 py-1 rounded-lg border border-sky-200">
                Filtered by: {selectedDivisionFilter}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {divisionSummaries.map((item) => {
              const isSelected = selectedDivisionFilter === item.division.id || selectedDivisionFilter === item.division.name;
              const severityPct = (item.avgSeverity * 100).toFixed(0);

              return (
                <div
                  key={item.division.id}
                  onClick={() => {
                    const nameToSet = isSelected ? null : item.division.name;
                    setSelectedDivisionFilter(nameToSet);
                    if (onSelectDivision && nameToSet) onSelectDivision(item.division.name);
                  }}
                  className={`cursor-pointer bg-white border ${
                    isSelected ? 'border-2 border-sky-600 ring-2 ring-sky-600/20' : 'border-carbon-20 hover:border-carbon-30'
                  } rounded-2xl p-4 transition-all duration-200 hover:scale-[1.01] flex flex-col justify-between space-y-3 relative overflow-hidden shadow-xs`}
                >
                  {/* Division Name & Primary Hazard */}
                  <div>
                    <h4 className="text-base font-black text-carbon-90">{item.division.name}</h4>
                    <p className="text-xs text-carbon-60 font-mono mt-0.5 truncate">
                      Primary Threat: <strong className="text-amber-600">{item.primaryHazard}</strong>
                    </p>
                  </div>

                  {/* Severity & High Risk District Progress */}
                  <div className="space-y-1.5 font-mono text-xs bg-carbon-05 p-2.5 rounded-xl border border-carbon-20">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-carbon-60">Avg District Severity:</span>
                      <span className="text-carbon-90 font-bold">{severityPct}%</span>
                    </div>

                    <div className="w-full bg-carbon-20 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          item.avgSeverity > 0.75 ? 'bg-rose-500' : item.avgSeverity > 0.6 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${severityPct}%` }}
                      ></div>
                    </div>

                    <div className="flex justify-between items-center text-[11px] pt-1 border-t border-carbon-20">
                      <span className="text-carbon-60">High Risk Districts:</span>
                      <span className="text-rose-600 font-bold">{item.highRiskDistrictCount} / {item.districtCount}</span>
                    </div>
                  </div>

                  {/* Action Link */}
                  <div className="flex items-center justify-between text-[11px] font-mono text-carbon-60 pt-1">
                    <span>{item.districtCount} Total Districts</span>
                    <span className="text-sky-700 font-bold underline">
                      {isSelected ? 'Selected' : 'Filter Region'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 3: ALL UNIQUE HAZARDS BREAKDOWN TABLE & CHART */}
      {(activeTab === 'all_hazards' || activeTab === 'formula') && (
        <div className="space-y-6 pt-4 border-t border-carbon-20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg sm:text-xl font-extrabold text-carbon-90 flex items-center gap-2">
                <span>All Unique Hazards Telemetry Matrix</span>
                <span className="text-xs font-mono font-normal text-carbon-60">
                  ({hazardSummaries.length} Hazard Classes)
                </span>
              </h3>
              <p className="text-xs text-carbon-60 font-mono">
                Formula values: Unique Hazard Name + District Count + Average Severity Score
              </p>
            </div>
          </div>

          {/* Recharts Bar Chart of Unique Hazard Scores (presentation aggregation) */}
          <div className="bg-white border border-carbon-20 rounded-3xl p-5 shadow-xs space-y-3">
            <h4 className="text-xs font-mono font-bold text-sky-800 uppercase tracking-wider">
              National Composite Hazard Score Distribution (District Count × Avg Severity Score)
            </h4>

            <p className="text-[11px] text-carbon-60 leading-relaxed">
              Presentation aggregation of the two values this matrix already prints: the district count
              multiplied by the mean of the per-district severity shown on the map.
            </p>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hazardSummaries} margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d1d1d1" />
                  <XAxis
                    dataKey="hazardName"
                    stroke="#77777a"
                    fontSize={11}
                    tick={{ fill: '#444447' }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                  />
                  <YAxis stroke="#77777a" fontSize={11} tick={{ fill: '#444447' }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as HazardSummary;
                        return (
                          <div className="bg-white border border-carbon-20 p-3 rounded-xl text-xs font-mono space-y-1 shadow-md">
                            <p className="font-bold text-carbon-90 flex items-center gap-2">
                              <span>{data.icon}</span>
                              <span>{data.hazardName}</span>
                            </p>
                            <p className="text-sky-700">District Count: {data.districtCount}</p>
                            <p className="text-amber-600">Avg Severity: {(data.avgSeverity * 100).toFixed(1)}%</p>
                            <p className="text-rose-600 font-bold">Composite Index: {data.compositeScore.toFixed(2)}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="compositeScore" radius={[8, 8, 0, 0]}>
                    {hazardSummaries.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detailed Table Grid */}
          <div className="overflow-x-auto rounded-2xl border border-carbon-20 bg-white">
            <table className="w-full text-left font-sans text-xs">
              <thead className="bg-carbon-05 text-carbon-60 font-mono uppercase text-[10px] tracking-wider border-b border-carbon-20">
                {/* Repeated Emergency Protocol Header Row on Every Printed Page */}
                <tr className="print-table-emergency-header">
                  <th colSpan={8} className="emergency-protocol-title">
                    🚨 NATIONAL EMERGENCY PROTOCOL & HAZARD DISTRIBUTION SUMMARY (SOD 2019)
                  </th>
                </tr>
                <tr>
                  <th className="p-3.5">Rank & Unique Hazard</th>
                  <th className="p-3.5">District Count</th>
                  <th className="p-3.5">% of Bangladesh</th>
                  <th className="p-3.5">Avg Severity Score</th>
                  <th className="p-3.5">Composite Score</th>
                  <th className="p-3.5">High Risk Districts</th>
                  <th className="p-3.5">Main Crops</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon-20 text-carbon-70">
                {hazardSummaries.map((hazard, i) => {
                  const pctNation = ((hazard.districtCount / totalDistricts) * 100).toFixed(1);
                  const isSelected = selectedHazardFilter === hazard.hazardName;

                  return (
                    <tr
                      key={hazard.hazardName}
                      className={`hover:bg-carbon-05 transition-colors ${
                        isSelected ? 'bg-sky-50 font-bold' : ''
                      }`}
                    >
                      <td className="p-3.5 flex items-center gap-2.5 font-bold text-carbon-90">
                        <span className="w-6 h-6 rounded-lg bg-carbon-10 border border-carbon-20 font-mono text-[11px] flex items-center justify-center text-carbon-70 shrink-0">
                          #{i + 1}
                        </span>
                        <MaterialIcon name="{hazard.icon}" className="w-4 h-4 inline-block mr-1" />
                        <span>{hazard.hazardName}</span>
                      </td>

                      <td className="p-3.5 font-mono text-sky-700 font-bold">
                        {hazard.districtCount} Districts
                      </td>

                      <td className="p-3.5 font-mono text-carbon-60">
                        {pctNation}%
                      </td>

                      <td className="p-3.5 font-mono">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-amber-600">
                            {(hazard.avgSeverity * 100).toFixed(1)}%
                          </span>
                          <div className="w-16 bg-carbon-10 h-1.5 rounded-full overflow-hidden border border-carbon-20">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${hazard.avgSeverity * 100}%`, backgroundColor: hazard.color }}
                            ></div>
                          </div>
                        </div>
                      </td>

                      <td className="p-3.5 font-mono font-black text-rose-600 text-sm">
                        {hazard.compositeScore.toFixed(2)}
                      </td>

                      <td className="p-3.5 font-mono text-rose-700">
                        {hazard.highRiskCount} High Risk
                      </td>

                      <td className="p-3.5 text-carbon-60 truncate max-w-[180px]">
                        {hazard.impactedCrops.join(', ')}
                      </td>

                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => setSelectedHazardFilter(isSelected ? null : hazard.hazardName)}
                          className={`px-3 py-1.5 rounded-xl font-mono text-[11px] font-bold border transition-all ${
                            isSelected
                              ? 'bg-rose-600 text-white border-rose-500'
                              : 'bg-carbon-05 text-sky-800 border-carbon-20 hover:bg-carbon-10'
                          }`}
                        >
                          {isSelected ? 'Remove Filter' : 'Filter Districts'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 4: FORMULA EXPLANATION MATRIX */}
      {(activeTab === 'formula' || activeTab === 'top3') && (
        <div className="bg-carbon-05 border border-carbon-20 rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-xs font-mono text-sky-800 uppercase font-extrabold tracking-wider">
            <span>🧮 AI Mathematical Prediction Mechanics</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
            <div className="bg-white p-4 rounded-2xl border border-carbon-20 space-y-2 shadow-xs">
              <span className="text-carbon-60 text-[10px] uppercase block font-bold">Variable 1</span>
              <h5 className="text-carbon-90 font-black text-sm">{`{unique_hazard_name}`}</h5>
              <p className="text-carbon-60 text-[11px] leading-relaxed">
                Identifies distinct weather hazard categories (e.g. Flash Flood, Monsoon Flood, Drought, Tropical Cyclone, Cold Wave, Severe Storm) derived from satellite satellite signal & thermal rasters.
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-carbon-20 space-y-2 shadow-xs">
              <span className="text-carbon-60 text-[10px] uppercase block font-bold">Variable 2</span>
              <h5 className="text-carbon-90 font-black text-sm">{`{district_counts_for_each_unique_hazard}`}</h5>
              <p className="text-carbon-60 text-[11px] leading-relaxed">
                Quantifies national spatial spread by counting the number of administrative districts prone to or actively affected by each specific hazard type out of 64 districts.
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-carbon-20 space-y-2 shadow-xs">
              <span className="text-carbon-60 text-[10px] uppercase block font-bold">Variable 3</span>
              <h5 className="text-carbon-90 font-black text-sm">{`{districts_average_severity_score}`}</h5>
              <p className="text-carbon-60 text-[11px] leading-relaxed">
                Computes the mathematical mean of continuous multi-spectral severity indices (range 0-1) across all districts belonging to each unique hazard class.
              </p>
            </div>
          </div>

          {/* Same quantity as the chart above, stated as the Top-3 ranking rule.
              Classified identically (ADR 0012): a presentation aggregation of the
              district count and the mean of the published per-district severity —
              no weights, no thresholds, no clusters. This panel also renders on the
              `top3` tab, so it is the disclosure that stands next to the
              "Composite Index" figure on each Top-3 card. The embargo gate fails
              the build if the phrase below loses its label. */}
          <div className="bg-sky-50 border border-sky-200 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono text-sky-900">
            <div>
              <span className="font-bold text-carbon-90 block">Predicted Top 3 Hazards Formula:</span>
              <span>Composite Risk Index = Hazard District Count × Average Severity Score</span>
              <span className="block mt-1.5 text-[11px] font-sans text-sky-900/80 leading-relaxed">
                Presentation aggregation — a district count multiplied by the mean of the per-district
                severity published on this page. It is not HazardNet&apos;s derived severity index, which is
                withheld from public surfaces.
              </span>
            </div>
            <div className="px-3 py-1.5 bg-white border border-sky-300 rounded-xl text-emerald-700 font-bold shrink-0 shadow-xs">
              Method: District Count x Mean Anchored Severity (BD thresholds)
            </div>
          </div>
        </div>
      )}

      {/* FILTERED DISTRICTS RESULTS LIST (IF FILTERED) */}
      {(selectedHazardFilter || selectedDivisionFilter) && (
        <div className="bg-white border border-sky-200 rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-black text-carbon-90 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-ping"></span>
              <span>Matching Districts ({filteredDistricts.length} Found)</span>
              {selectedHazardFilter && (
                <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded text-xs font-mono">
                  Hazard: {selectedHazardFilter}
                </span>
              )}
              {selectedDivisionFilter && (
                <span className="px-2 py-0.5 bg-sky-100 text-sky-800 rounded text-xs font-mono">
                  Division: {selectedDivisionFilter}
                </span>
              )}
            </h4>

            <button
              onClick={() => {
                setSelectedHazardFilter(null);
                setSelectedDivisionFilter(null);
              }}
              className="text-xs font-mono text-carbon-60 hover:text-carbon-90 underline"
            >
              Clear Filter
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredDistricts.map((d) => (
              <div
                key={d.id}
                onClick={() => onSelectDistrict && onSelectDistrict(d)}
                className="bg-carbon-05 border border-carbon-20 hover:border-sky-500 p-3.5 rounded-2xl cursor-pointer transition-all hover:scale-[1.02] space-y-2 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <h5 className="font-extrabold text-carbon-90 text-sm">{d.name}</h5>
                  <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded ${
                    d.risk === 'High' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                    d.risk === 'Moderate' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                    'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}>
                    {d.risk} Risk
                  </span>
                </div>

                <div className="font-mono text-[11px] text-carbon-60 space-y-0.5">
                  <p>Division: <strong className="text-carbon-80">{d.division}</strong></p>
                  <p>Hazard: <strong className="text-amber-600">{d.hazardType}</strong></p>
                  <p>Severity: <strong className="text-rose-600">{((d.severity || 0.5) * 100).toFixed(0)}%</strong></p>
                </div>

                <div className="pt-2 border-t border-carbon-20 flex items-center justify-between text-[10px] font-mono text-sky-700">
                  <span>Crop: {d.mainCrop}</span>
                  <span className="font-bold underline">Select District →</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default NationalOverview;
