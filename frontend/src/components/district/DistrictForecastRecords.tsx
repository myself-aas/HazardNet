import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Download, TrendingUp } from 'lucide-react';

import { useI18n } from '../../hooks/useI18n';
import { useDistrictBrief } from './DistrictBriefContext';
import { AdvisorySignalCard } from './AdvisorySignalCard';
import { CardStackRows } from '../ui/CardStackTable';

/** Stored 7/15-day forecast table (text equivalent of the outlook chart). */
export const DistrictForecastRecords: React.FC = () => {
  const { formatDate, formatNumber } = useI18n();
  const fmt1 = (val: number) => formatNumber(val, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  const {
    districtId,
    data,
    district,
    climaticEventsData,
    peakSeverityInfo,
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
    loadingForecastTable,
    chartData,
    activeTableHorizon,
    setActiveTableHorizon,
    districtForecasts7D,
    districtForecasts15D,
    handleDownloadTableCsv,
    scrollToSection,
    activeSection,
    trendViewMode,
    setTrendViewMode,
    hazardTrendData,
    showLiveAiAdvisory,
    setShowLiveAiAdvisory,
    weather,
    eventHazardFilter,
    setEventHazardFilter,
    expandedHistoricalEventId,
    setExpandedHistoricalEventId,
  } = useDistrictBrief();

  // One binding for both branches: the phone cards and the table must never read
  // different horizons.
  const activeRows = activeTableHorizon === '7_days' ? districtForecasts7D : districtForecasts15D;
  const maxActiveScore = activeRows.length > 0 ? Math.max(...activeRows.map((r) => r.severity_score)) : 0;
  const isPeakRow = (row: (typeof activeRows)[number]) =>
    row.is_peak_day ?? (maxActiveScore > 0 && row.severity_score === maxActiveScore);

  return (
    <>
      {/* USER-FRIENDLY TABLE: PIPELINE CSV FORECAST OUTPUT (7 & 15 DAYS) */}
      <section className="bg-white border border-carbon-20 rounded-xl p-4 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-carbon-20 pb-4">
          <div>
            <div className="text-xs font-mono font-bold text-amber-800 uppercase tracking-wider">
              Verified Pipeline Output
            </div>
            <h2 className="text-xl font-black text-carbon-90 tracking-tight">
              Forecast Timeline: {data.districtName}
            </h2>
          </div>
          {/* Horizon toggles plus Download CSV */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTableHorizon('7_days')}
              aria-pressed={activeTableHorizon === '7_days'}
              className={`min-h-[44px] px-4 py-2 text-sm font-semibold rounded-full cursor-pointer touch-manipulation transition-colors ${
                activeTableHorizon === '7_days'
                  ? 'bg-primary text-ap-action-fg'
                  : 'bg-carbon-10 hover:bg-carbon-20 text-carbon-80'
              }`}
            >
              7-Day Outlook ({districtForecasts7D.length})
            </button>
            <button
              onClick={() => setActiveTableHorizon('15_days')}
              aria-pressed={activeTableHorizon === '15_days'}
              className={`min-h-[44px] px-4 py-2 text-sm font-semibold rounded-full cursor-pointer touch-manipulation transition-colors ${
                activeTableHorizon === '15_days'
                  ? 'bg-primary text-ap-action-fg'
                  : 'bg-carbon-10 hover:bg-carbon-20 text-carbon-80'
              }`}
            >
              15-Day Outlook ({districtForecasts15D.length})
            </button>
            <button
              onClick={handleDownloadTableCsv}
              title="Download specific 7 and 15-day hazard intelligence records as CSV"
              aria-label="Download forecast records as CSV"
              className="inline-flex min-h-[44px] items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-ap-action-fg font-semibold text-sm cursor-pointer ml-1 touch-manipulation"
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
          <div className="rounded-xl bg-carbon-05 border border-carbon-20/80 p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-mono font-bold text-carbon-70 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-amber-700" />
                <span>Hazard Progression Trend ({activeTableHorizon === '7_days' ? '7-Day' : '15-Day'} Horizon)</span>
              </div>
              <div className="text-xs font-mono text-carbon-60">Severity Index (%) vs Target Date</div>
            </div>
            <div className="h-56 sm:h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="date" stroke="#6e6e73" fontSize={12} tickLine={false} />
                  <YAxis stroke="#6e6e73" fontSize={12} domain={[0, 100]} tickLine={false} unit="%" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1d1d1f',
                      borderColor: '#333333',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                    formatter={(value: any, name: any) => [
                      `${value}%`,
                      name === 'physicsSeverity'
                        ? 'Physics Severity'
                        : name === 'modelSeverity'
                          ? 'Model Severity'
                          : 'Confidence',
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="physicsSeverity"
                    name="physicsSeverity"
                    stroke="var(--ap-sev-very-high)"
                    strokeWidth={3}
                    dot={{ r: 4, fill: 'var(--ap-sev-very-high)' }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="modelSeverity"
                    name="modelSeverity"
                    stroke="var(--ap-link)"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 3, fill: 'var(--ap-link)' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {loadingForecastTable ? (
          <div className="py-12 text-center text-carbon-60 font-mono text-sm animate-pulse">
            Loading pipeline forecast records for {data.districtName}…
          </div>
        ) : (
          <>
            {/* Phone: one card per forecast row. The table below carries twelve columns, which
                at 390px was a horizontal scroll of two screens; the card names every figure. */}
            {activeRows.length === 0 ? (
              <p className="rounded-xl border border-carbon-20/90 p-6 text-sm text-carbon-60 md:hidden">
                The latest pipeline run did not emit a {activeTableHorizon === '7_days' ? '7-day' : '15-day'} record for{' '}
                {data.districtName}.
              </p>
            ) : (
              <CardStackRows
                rows={activeRows.map((row, idx) => {
                  const peak = isPeakRow(row);
                  return {
                    key: idx,
                    heading: `${row.forecast_day ? `Day ${row.forecast_day} · ` : ''}${formatDate(row.target_date)}${peak ? ' · PEAK SEVERE DATE' : ''}`,
                    fields: [
                      { label: 'Severity Index', value: `${formatNumber(Math.round(row.severity_score * 100))}/100` },
                      { label: 'Peak Severe Date', value: peak ? 'Yes (Peak)' : 'No' },
                      { label: 'Prediction Run', value: formatDate(row.prediction_date) },
                      { label: 'Hazard Type', value: row.hazard_type },
                      { label: 'Advisory Tier', value: row.advisory_tier || '-' },
                      {
                        label: 'Physics Baseline',
                        value: `${formatNumber(Math.round((row.physics_severity ?? row.severity_score) * 100))}%`,
                      },
                      {
                        label: 'Model Score',
                        value:
                          row.model_severity !== undefined
                            ? `${formatNumber(Math.round(row.model_severity * 100))}%`
                            : `${formatNumber(Math.round(row.severity_score * 100))}%`,
                      },
                      {
                        label: 'Blended Severity',
                        value: row.final_severity !== undefined ? `${formatNumber(Math.round(row.final_severity * 100))}%` : '-',
                      },
                      { label: 'Confidence', value: `${formatNumber(Math.round(row.confidence * 100))}%` },
                      {
                        label: 'Temp (Min/Max)',
                        value:
                          row.temperature_min !== undefined && row.temperature_max !== undefined
                            ? `${fmt1(row.temperature_min)}\u00A0°C / ${fmt1(row.temperature_max)}\u00A0°C`
                            : row.temperature_mean !== undefined
                              ? `${fmt1(row.temperature_mean)}\u00A0°C`
                              : '-',
                      },
                      {
                        label: 'Precip.',
                        value: row.precipitation_mm !== undefined ? `${fmt1(row.precipitation_mm)}\u00A0mm` : '-',
                      },
                      { label: 'Wind Max', value: row.wind_max_kmh !== undefined ? `${fmt1(row.wind_max_kmh)}\u00A0km/h` : '-' },
                      {
                        label: 'Top Hazard Classes',
                        value: [row.prob_top1, row.prob_top2, row.prob_top3]
                          .map((p) => (p === undefined ? '-' : `${formatNumber(Math.round(p * 100))}%`))
                          .join(' / '),
                      },
                    ],
                  };
                })}
              />
            )}
            <div className="rounded-xl hidden overflow-x-auto border border-carbon-20/90 md:block">
              <table className="w-full text-left border-collapse text-xs font-sans">
                <thead>
                  <tr className="bg-carbon-90 text-carbon-05 font-bold text-xs uppercase tracking-wider font-mono">
                    <th className="px-3.5 py-3">Target Date</th>
                    <th className="px-3.5 py-3">Severity Index</th>
                    <th className="px-3.5 py-3">Prediction</th>
                    <th className="px-3.5 py-3">Hazard Type</th>
                    <th className="px-3.5 py-3">Tier</th>
                    <th className="px-3.5 py-3">Physics Baseline</th>
                    <th className="px-3.5 py-3">Model Score</th>
                    <th className="px-3.5 py-3">Blended Sev.</th>
                    <th className="px-3.5 py-3">Confidence</th>
                    <th className="px-3.5 py-3">Temp (Min/Max)</th>
                    <th className="px-3.5 py-3">Precip.</th>
                    <th className="px-3.5 py-3">Wind Max</th>
                    <th className="px-3.5 py-3">Top Hazard Classes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon-10">
                  {activeRows.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="p-8 text-center text-carbon-60 font-sans text-sm">
                        The latest pipeline run did not emit a {activeTableHorizon === '7_days' ? '7-day' : '15-day'}{' '}
                        record for {data.districtName}.
                        {(activeTableHorizon === '7_days' ? districtForecasts15D : districtForecasts7D).length > 0
                          ? ` The ${activeTableHorizon === '7_days' ? '15-day' : '7-day'} horizon has records. Switch tabs above.`
                          : ' Check back after the next scheduled forecast refresh.'}
                      </td>
                    </tr>
                  ) : (
                    activeRows.map((row, idx) => {
                      const peak = isPeakRow(row);
                      return (
                        <tr
                          key={idx}
                          data-peak={peak ? 'true' : undefined}
                          className={`transition-colors ${
                            peak
                              ? 'bg-amber-50/90 font-semibold'
                              : idx % 2 === 0
                                ? 'bg-white'
                                : 'bg-carbon-05/80'
                          } hover:bg-amber-50/60`}
                        >
                          <td className="px-3.5 py-3 font-mono tabular-nums font-bold text-carbon-90 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {row.forecast_day !== undefined && (
                                <span className="text-carbon-60">D{formatNumber(row.forecast_day)}</span>
                              )}
                              <time dateTime={row.target_date}>{formatDate(row.target_date)}</time>
                              {peak && (
                                <span className="rounded border border-amber-400 bg-amber-100 px-1.5 py-0.5 text-xs font-black text-amber-950">
                                  PEAK
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3.5 py-3 font-mono tabular-nums font-black text-carbon-90 whitespace-nowrap">
                            {formatNumber(Math.round(row.severity_score * 100))}/100
                          </td>
                          <td className="px-3.5 py-3 font-mono tabular-nums text-carbon-60 whitespace-nowrap">
                            <time dateTime={row.prediction_date}>{formatDate(row.prediction_date)}</time>
                          </td>
                        <td className="px-3.5 py-3 font-semibold text-carbon-80">{row.hazard_type}</td>
                        {/* The tier the advisory published. `advisoryTierOf` falls back to the
                          severity bin only when the row carries no tier at all, so a
                          published WATCH is never re-labelled WARNING by the client. */}
                        <td className="px-3.5 py-3 whitespace-nowrap">
                          {row.advisory_tier ? (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-black border ${
                                row.advisory_tier === 'EXTREME'
                                  ? 'bg-rose-200 text-rose-950 border-rose-400'
                                  : row.advisory_tier === 'SEVERE'
                                    ? 'bg-red-100 text-red-800 border-red-300'
                                    : row.advisory_tier === 'WARNING'
                                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                                      : row.advisory_tier === 'WATCH'
                                        ? 'bg-sky-100 text-sky-800 border-sky-300'
                                        : 'bg-carbon-10 text-carbon-80 border-carbon-20'
                              }`}
                              title="Published by the advisory pipeline"
                            >
                              {row.advisory_tier}
                            </span>
                          ) : (
                            <span className="text-carbon-70" title="This row predates the advisory tier column">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-3 font-mono tabular-nums font-bold whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-black ${
                              (row.physics_severity ?? row.severity_score) >= 0.67
                                ? 'bg-red-100 text-red-800'
                                : (row.physics_severity ?? row.severity_score) >= 0.34
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-carbon-10 text-carbon-80'
                            }`}
                          >
                            {formatNumber(Math.round((row.physics_severity ?? row.severity_score) * 100))}%
                          </span>
                        </td>
                        <td className="px-3.5 py-3 font-mono tabular-nums text-carbon-70 whitespace-nowrap">
                          {row.model_severity !== undefined
                            ? `${formatNumber(Math.round(row.model_severity * 100))}%`
                            : `${formatNumber(Math.round(row.severity_score * 100))}%`}
                        </td>
                        {/* `final_severity` is the blended score the tier is cut from; it is
                          not always equal to either track above. */}
                        <td className="px-3.5 py-3 font-mono tabular-nums text-carbon-80 whitespace-nowrap">
                          {row.final_severity !== undefined ? `${formatNumber(Math.round(row.final_severity * 100))}%` : '—'}
                        </td>
                        <td className="px-3.5 py-3 font-mono tabular-nums font-bold text-carbon-90 whitespace-nowrap">
                          {formatNumber(Math.round(row.confidence * 100))}%
                        </td>
                        <td className="px-3.5 py-3 font-mono tabular-nums text-carbon-70 whitespace-nowrap">
                          {row.temperature_min !== undefined && row.temperature_max !== undefined
                            ? `${fmt1(row.temperature_min)}\u00A0°C / ${fmt1(row.temperature_max)}\u00A0°C`
                            : row.temperature_mean !== undefined
                              ? `${fmt1(row.temperature_mean)}\u00A0°C`
                              : '—'}
                        </td>
                        <td className="px-3.5 py-3 font-mono tabular-nums text-carbon-70 whitespace-nowrap">
                          {row.precipitation_mm !== undefined ? `${fmt1(row.precipitation_mm)}\u00A0mm` : '—'}
                        </td>
                        <td className="px-3.5 py-3 font-mono tabular-nums text-carbon-70 whitespace-nowrap">
                          {row.wind_max_kmh !== undefined ? `${fmt1(row.wind_max_kmh)}\u00A0km/h` : '—'}
                        </td>
                        {/* The model's ranked hazard probabilities, as published. */}
                        <td className="px-3.5 py-3 font-mono tabular-nums text-carbon-60 whitespace-nowrap">
                          {row.prob_top1 !== undefined
                            ? [row.prob_top1, row.prob_top2, row.prob_top3]
                                .map((p) => (p === undefined ? '—' : `${formatNumber(Math.round(p * 100))}%`))
                                .join(' / ')
                            : '—'}
                        </td>
                        </tr>
                      );
                    })
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
