import React from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { Download, TrendingUp } from 'lucide-react';

import { useDistrictBrief } from './DistrictBriefContext';
import { AdvisorySignalCard } from './AdvisorySignalCard';
import { CardStackRows } from '../ui/CardStackTable';


/** Stored 7/15-day forecast table (text equivalent of the outlook chart). */
export const DistrictForecastRecords: React.FC = () => {
  const {
    districtId,
    data,
    district,
    climaticEventsData,
    peakSeverityInfo,
    riskStyles,
    navigate,
    saved,
    copiedAlert,
    districtDropdownOpen,
    searchDistrict,
    filteredDistricts,
    setDistrictDropdownOpen,
    setSearchDistrict,
    handleToggleSave,
    handleShareAlert,
    handlePrintBrief,
    handleDownloadReport,
    loadingForecastTable,
    chartData,
    activeTableHorizon,
    setActiveTableHorizon,
    districtForecasts7D,
    districtForecasts15D,
    handleDownloadTableCsv,
    scrollToSection,
    activeSection,
    processedUpazilas,
    upazilaViewMode,
    setUpazilaViewMode,
    upazilaSearch,
    setUpazilaSearch,
    upazilaFilter,
    setUpazilaFilter,
    upazilaSortBy,
    setUpazilaSortBy,
    trendViewMode,
    setTrendViewMode,
    hazardTrendData,
    showLiveAiAdvisory,
    setShowLiveAiAdvisory,
    weather,
    dispatchStatus,
    handleTriggerDispatch,
    dispatchLogs,
    eventHazardFilter,
    setEventHazardFilter,
    expandedHistoricalEventId,
    setExpandedHistoricalEventId,
  } = useDistrictBrief();

  // One binding for both branches: the phone cards and the table must never read
  // different horizons.
  const activeRows = activeTableHorizon === '7_days' ? districtForecasts7D : districtForecasts15D;

  return (
    <>
      {/* USER-FRIENDLY TABLE: PIPELINE CSV FORECAST OUTPUT (7 & 15 DAYS) */}
      <section className="bg-white border border-carbon-20 p-4 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-carbon-20 pb-4">
          <div>
            <div className="text-xs font-mono font-bold text-amber-600 uppercase tracking-wider">
              Published Forecast Records • District Telemetry Feed
            </div>
            <h2 className="text-xl font-black text-carbon-black tracking-tight">
              7-Day & 15-Day Forecast Records ({data.districtName})
            </h2>
          </div>
          {/* `flex-wrap`: the two horizon toggles plus "Download CSV" are ~357px, which is a
              37px document overflow at 320px. They wrap rather than widen the page. */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTableHorizon('7_days')}
              className={`min-h-[44px] px-4 py-2 text-sm font-semibold cursor-pointer touch-manipulation ${
                activeTableHorizon === '7_days'
                  ? 'bg-nasa-blue text-white'
                  : 'bg-carbon-10 hover:bg-carbon-20 text-carbon-70'
              }`}
            >
              7-Day Forecast ({districtForecasts7D.length})
            </button>
            <button
              onClick={() => setActiveTableHorizon('15_days')}
              className={`min-h-[44px] px-4 py-2 text-sm font-semibold cursor-pointer touch-manipulation ${
                activeTableHorizon === '15_days'
                  ? 'bg-nasa-blue text-white'
                  : 'bg-carbon-10 hover:bg-carbon-20 text-carbon-70'
              }`}
            >
              15-Day Forecast ({districtForecasts15D.length})
            </button>
            <button
              onClick={handleDownloadTableCsv}
              title="Download specific 7 and 15-day hazard intelligence records as CSV"
              className="inline-flex min-h-[44px] items-center gap-1.5 px-3.5 py-2 bg-nasa-blue text-white font-semibold text-sm cursor-pointer ml-1 touch-manipulation"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV</span>
            </button>
          </div>
        </div>

        {/* Advisory signal: the published tier, the four severity tracks and the top-3
            distribution. These are the columns the daily advisory CSV emits that the table
            below used to drop on the floor. */}
        <AdvisorySignalCard
          rows={activeTableHorizon === '7_days' ? districtForecasts7D : districtForecasts15D}
          horizon={activeTableHorizon}
          districtName={data.districtName}
        />

        {/* Trend Analysis Line Chart */}
        {!loadingForecastTable && chartData.length > 0 && (
          <div className="bg-carbon-05 border border-carbon-20/80 p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-mono font-bold text-carbon-70 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-amber-600" />
                <span>Hazard Progression Trend ({activeTableHorizon === '7_days' ? '7-Day' : '15-Day'} Horizon)</span>
              </div>
              <div className="text-xs font-mono text-carbon-60">
                Severity Index (%) vs Target Date
              </div>
            </div>
            <div className="h-56 sm:h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="date" stroke="#6e6e73" fontSize={12} tickLine={false} />
                  <YAxis stroke="#6e6e73" fontSize={12} domain={[0, 100]} tickLine={false} unit="%" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1d1d1f', borderColor: '#333333', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                    formatter={(value: any, name: any) => [`${value}%`, name === 'physicsSeverity' ? 'Physics Severity' : name === 'modelSeverity' ? 'Model Severity' : 'Confidence']}
                  />
                  <Line type="monotone" dataKey="physicsSeverity" name="physicsSeverity" stroke="#c01f1f" strokeWidth={3} dot={{ r: 4, fill: '#c01f1f' }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="modelSeverity" name="modelSeverity" stroke="#0066cc" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3, fill: '#0066cc' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {loadingForecastTable ? (
          <div className="py-12 text-center text-carbon-60 font-mono text-sm animate-pulse">
            Loading pipeline CSV forecast logs for {data.districtName}...
          </div>
        ) : (
          <>
            {/* Phone: one card per forecast row. The table below carries twelve columns, which
                at 390px was a horizontal scroll of two screens; the card names every figure. */}
            {activeRows.length === 0 ? (
              <p className="border border-carbon-20/90 p-6 text-sm text-carbon-60 md:hidden">
                The latest pipeline run did not emit a {activeTableHorizon === '7_days' ? '7-day' : '15-day'} record for {data.districtName}.
              </p>
            ) : (
              <CardStackRows
                rows={activeRows.map((row, idx) => ({
                  key: idx,
                  heading: row.target_date,
                  fields: [
                    { label: 'Prediction', value: row.prediction_date },
                    { label: 'Hazard Type', value: row.hazard_type },
                    { label: 'Tier', value: row.advisory_tier || '-' },
                    { label: 'Physics Sev.', value: `${Math.round((row.physics_severity ?? row.severity_score) * 100)}%` },
                    { label: 'CNN Sev.', value: row.model_severity !== undefined ? `${Math.round(row.model_severity * 100)}%` : `${Math.round(row.severity_score * 100)}%` },
                    { label: 'Final Sev.', value: row.final_severity !== undefined ? `${Math.round(row.final_severity * 100)}%` : '-' },
                    { label: 'Confidence', value: `${Math.round(row.confidence * 100)}%` },
                    { label: 'Temp (Min/Max)', value: row.temperature_min !== undefined && row.temperature_max !== undefined
                        ? `${row.temperature_min}°C / ${row.temperature_max}°C`
                        : row.temperature_mean !== undefined ? `${row.temperature_mean}°C` : '-' },
                    { label: 'Precip.', value: row.precipitation_mm !== undefined ? `${row.precipitation_mm} mm` : '-' },
                    { label: 'Wind Max', value: row.wind_max_kmh !== undefined ? `${row.wind_max_kmh} km/h` : '-' },
                    { label: 'Top-3 %', value: [row.prob_top1, row.prob_top2, row.prob_top3]
                        .map((p) => (p === undefined ? '-' : `${Math.round(p * 100)}`))
                        .join(' / ') },
                  ],
                }))}
              />
            )}
          <div className="hidden overflow-x-auto border border-carbon-20/90 md:block">
            <table className="w-full text-left border-collapse text-xs font-sans">
              <thead>
                <tr className="bg-carbon-90 text-white font-bold text-xs uppercase tracking-wider font-mono">
                  <th className="px-3.5 py-3">Target Date</th>
                  <th className="px-3.5 py-3">Prediction</th>
                  <th className="px-3.5 py-3">Hazard Type</th>
                  <th className="px-3.5 py-3">Tier</th>
                  <th className="px-3.5 py-3">Physics Sev.</th>
                  <th className="px-3.5 py-3">CNN Sev.</th>
                  <th className="px-3.5 py-3">Final Sev.</th>
                  <th className="px-3.5 py-3">Confidence</th>
                  <th className="px-3.5 py-3">Temp (Min/Max)</th>
                  <th className="px-3.5 py-3">Precip.</th>
                  <th className="px-3.5 py-3">Wind Max</th>
                  <th className="px-3.5 py-3">Top-3 %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon-10">
                {activeRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="p-8 text-center text-carbon-60 font-sans text-sm">
                      The latest pipeline run did not emit a {activeTableHorizon === '7_days' ? '7-day' : '15-day'} record for {data.districtName}.
                      {(activeTableHorizon === '7_days' ? districtForecasts15D : districtForecasts7D).length > 0
                        ? ` The ${activeTableHorizon === '7_days' ? '15-day' : '7-day'} horizon has records. Switch tabs above.`
                        : ' Check back after the next scheduled forecast refresh.'}
                    </td>
                  </tr>
                ) : (
                  activeRows.map((row, idx) => (
                    <tr key={idx} className={`transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-carbon-05/80'} hover:bg-amber-50/40`}>
                      <td className="px-3.5 py-3 font-mono font-bold text-carbon-90 whitespace-nowrap">{row.target_date}</td>
                      <td className="px-3.5 py-3 font-mono text-carbon-60 whitespace-nowrap">{row.prediction_date}</td>
                      <td className="px-3.5 py-3 font-semibold text-carbon-80">{row.hazard_type}</td>
                      {/* The tier the advisory published. `advisoryTierOf` falls back to the
                          severity bin only when the row carries no tier at all, so a
                          published WATCH is never re-labelled WARNING by the client. */}
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        {row.advisory_tier ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-black border ${
                            row.advisory_tier === 'SEVERE' ? 'bg-red-100 text-red-800 border-red-300' :
                            row.advisory_tier === 'WARNING' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                            row.advisory_tier === 'WATCH' ? 'bg-sky-100 text-sky-800 border-sky-300' :
                            'bg-carbon-10 text-carbon-80 border-carbon-20'
                          }`} title="Published by the advisory pipeline">
                            {row.advisory_tier}
                          </span>
                        ) : (
                          <span className="text-carbon-40" title="This row predates the advisory tier column">—</span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 font-mono font-bold whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-black ${
                          (row.physics_severity ?? row.severity_score) >= 0.67 ? 'bg-red-100 text-red-800' :
                          (row.physics_severity ?? row.severity_score) >= 0.34 ? 'bg-amber-100 text-amber-800' :
                          'bg-carbon-10 text-carbon-80'
                        }`}>
                          {Math.round((row.physics_severity ?? row.severity_score) * 100)}%
                        </span>
                      </td>
                      <td className="px-3.5 py-3 font-mono text-carbon-70 whitespace-nowrap">
                        {row.model_severity !== undefined ? `${Math.round(row.model_severity * 100)}%` : `${Math.round(row.severity_score * 100)}%`}
                      </td>
                      {/* `final_severity` is the blended score the tier is cut from; it is
                          not always equal to either track above. */}
                      <td className="px-3.5 py-3 font-mono text-carbon-80 whitespace-nowrap">
                        {row.final_severity !== undefined ? `${Math.round(row.final_severity * 100)}%` : '—'}
                      </td>
                      <td className="px-3.5 py-3 font-mono font-bold text-carbon-90 whitespace-nowrap">{Math.round(row.confidence * 100)}%</td>
                      <td className="px-3.5 py-3 font-mono text-carbon-70 whitespace-nowrap">
                        {row.temperature_min !== undefined && row.temperature_max !== undefined
                          ? `${row.temperature_min}°C / ${row.temperature_max}°C`
                          : row.temperature_mean !== undefined
                          ? `${row.temperature_mean}°C`
                          : '—'}
                      </td>
                      <td className="px-3.5 py-3 font-mono text-carbon-70 whitespace-nowrap">
                        {row.precipitation_mm !== undefined ? `${row.precipitation_mm} mm` : '—'}
                      </td>
                      <td className="px-3.5 py-3 font-mono text-carbon-70 whitespace-nowrap">
                        {row.wind_max_kmh !== undefined ? `${row.wind_max_kmh} km/h` : '—'}
                      </td>
                      {/* The model's ranked hazard probabilities, as published. */}
                      <td className="px-3.5 py-3 font-mono text-carbon-60 whitespace-nowrap">
                        {row.prob_top1 !== undefined
                          ? [row.prob_top1, row.prob_top2, row.prob_top3]
                              .map((p) => (p === undefined ? '—' : `${Math.round(p * 100)}`))
                              .join(' / ')
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
    </>
  );
};
