/**
 * DistrictDetailPanel component (TASK-006, TRD §5.1, §7.3)
 *
 * Full field display for district advisory telemetry:
 * 1. District name, Division, Hazard Type, Advisory Tier badge, Target Date, Prediction Date.
 * 2. Dual-track severity display: Calibrated model severity, physics-track severity, and final fused severity score.
 * 3. Transparency badge ("Physics-grounded") when physics_override=true.
 * 4. Forecasted weather parameters: Max Temp (°C), Min Temp (°C), Precipitation (mm), Wind Speed (km/h).
 * 5. Confidence breakdown visualizer displaying top-3 hazard probabilities (prob_top1/2/3).
 * 6. Handles low confidence (< 0.40) by displaying the uncertainty advisory notice.
 */

import React from 'react';
import { APPLE_HAZARD_ALIASES, hazardPalette } from '@hazardnet/design-system';
import type { ForecastRow } from '../lib/forecasts';
import MaterialIcon from './MaterialIcon';
import AlertLevelBadge from './alerts/AlertLevelBadge';
import { useI18n } from '../hooks/useI18n';

export interface DistrictDetailPanelProps {
  forecast: ForecastRow;
  onClose?: () => void;
  className?: string;
  isModal?: boolean;
}

/**
 * Resolved from the one hazard palette rather than declared here. This map used
 * to be eight Tailwind defaults that disagreed with the two other copies of it
 * elsewhere in the app; APPLE_HAZARD is now the single source.
 */
export const HAZARD_COLOR_MAP: Record<string, string> = Object.fromEntries(
  Object.keys(APPLE_HAZARD_ALIASES).map((name) => [name, hazardPalette(name).text]),
);

export const DistrictDetailPanel: React.FC<DistrictDetailPanelProps> = ({
  forecast,
  onClose,
  className = '',
  isModal = false,
}) => {
  const { isBengali, formatNumber, formatDate } = useI18n();

  const confidence = forecast.confidence ?? 0;
  const isUncertain = confidence < 0.40;
  const isPhysicsOverridden = Boolean(forecast.physics_override);

  const modelRaw = forecast.model_severity_raw;
  const modelCalibrated = forecast.model_severity ?? forecast.severity_score;
  const physicsSeverity = forecast.physics_severity ?? forecast.severity_score;
  const finalSeverity = forecast.final_severity ?? forecast.severity_score;

  const hazardColor = HAZARD_COLOR_MAP[forecast.hazard_type] || '#0066cc';

  return (
    <div
      role={isModal ? 'dialog' : 'region'}
      aria-label={`Advisory details for ${forecast.district_name}`}
      className={`bg-white text-carbon-90 rounded-lg sm:rounded-xl md:rounded-2xl border border-carbon-20 shadow-sm dark:shadow-lg overflow-hidden flex flex-col ${className}`}
      data-testid="district-detail-panel"
    >
      {/* ── 1. Header: District, Division, Dates, Close ── */}
      <div className="p-3 sm:p-4 md:p-5 border-b border-carbon-20 bg-carbon-05/50">
        <div className="flex items-start justify-between gap-2 sm:gap-3 md:gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h2 className="text-base sm:text-lg md:text-xl font-heading font-black tracking-tight text-carbon-90 dark:text-white truncate">
                {forecast.district_name}
              </h2>
              {forecast.division && (
                <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-carbon-10 text-xs font-semibold text-carbon-70 whitespace-nowrap">
                  {forecast.division}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 md:gap-3 mt-1 sm:mt-1.5 text-xs text-carbon-60 font-mono">
              {forecast.target_date && (
                <span className="truncate">
                  <strong>Valid:</strong> {formatDate(forecast.target_date)}
                </span>
              )}
              {forecast.prediction_date && (
                <span className="hidden sm:inline truncate">
                  <strong>Issued:</strong> {formatDate(forecast.prediction_date)}
                </span>
              )}
              {forecast.horizon && (
                <span className="px-1.5 py-0.5 rounded bg-carbon-10 text-xs whitespace-nowrap">
                  {forecast.horizon}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <AlertLevelBadge
              level={forecast.advisory_tier || 'NORMAL'}
              size="sm"
            />
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-carbon-60 hover:text-carbon-90 hover:bg-carbon-20 dark:hover:bg-carbon-70 transition-colors"
                aria-label="Close detail panel"
              >
                <MaterialIcon name="close" className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Primary Hazard & Physics Override Badge */}
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 mt-2 sm:mt-4 pt-2 sm:pt-3 border-t border-carbon-20/60">
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <span
              className="w-2.5 sm:w-3.5 h-2.5 sm:h-3.5 rounded-full shrink-0"
              style={{ backgroundColor: hazardColor }}
              aria-hidden="true"
            />
            <span className="font-heading font-bold text-xs sm:text-sm text-carbon-90 truncate">
              {isUncertain ? (
                <span className="text-amber-600">Uncertain</span>
              ) : (
                forecast.hazard_type
              )}
            </span>
          </div>

          {/* 3. Physics Override Transparency Badge (TASK-006) */}
          {isPhysicsOverridden && (
            <div
              className="inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-cyan-50 border border-cyan-300 text-cyan-800 text-xs font-semibold shadow-xs whitespace-nowrap"
              title="Physical constraints overrode neural predictions."
              data-testid="physics-override-badge"
            >
              <MaterialIcon name="shield" className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-cyan-600 shrink-0" />
              <span className="hidden sm:inline">Physics-grounded</span><span className="sm:hidden">Physics</span>
            </div>
          )}
        </div>
      </div>

      <div className="p-3 sm:p-4 md:p-5 space-y-3 sm:space-y-4 md:space-y-5 overflow-y-auto">
        {/* ── 6. Low Confidence Uncertainty Advisory Notice ── */}
        {isUncertain && (
          <div
            className="p-3 sm:p-4 rounded-lg sm:rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed space-y-1 sm:space-y-1.5"
            data-testid="uncertainty-advisory-notice"
          >
            <div className="flex items-start gap-2 font-bold text-xs sm:text-sm text-amber-800">
              <MaterialIcon name="warning" className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>Low Confidence ({formatNumber(Math.round(confidence * 100))}%)</span>
            </div>
            <p className="text-xs leading-relaxed">
              Out-of-distribution anomaly detected. Consult meteorological observations before taking action. This out-of-distribution signal indicates the forecast may not match familiar conditions.
            </p>
          </div>
        )}

        {/* ── 2. Dual-Track Severity Display ── */}
        <div className="p-3 sm:p-4 rounded-lg sm:rounded-xl bg-carbon-05 border border-carbon-20 space-y-2.5 sm:space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2">
            <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-carbon-70 flex items-center gap-1.5">
              <MaterialIcon name="speedometer" className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-carbon-50 shrink-0" />
              <span>Severity</span>
            </h3>
            <span className="font-mono text-xs font-bold text-carbon-60 self-start sm:self-auto">
              Fused: {formatNumber(Math.round(finalSeverity * 100))}%
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            {/* Calibrated Model Severity */}
            <div className="p-3 rounded-lg bg-white border border-carbon-20">
              <span className="text-xs font-mono text-carbon-60 uppercase block">
                Model Track (Calibrated)
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-lg font-mono font-bold text-indigo-600">
                  {formatNumber(Math.round(modelCalibrated * 100))}%
                </span>
                {modelRaw !== undefined && (
                  <span className="text-xs font-mono text-carbon-60">
                    Raw: {formatNumber(Math.round(modelRaw * 100))}%
                  </span>
                )}
              </div>
              <div className="w-full bg-carbon-10 h-1.5 rounded-full overflow-hidden mt-2">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, modelCalibrated * 100))}%` }}
                />
              </div>
            </div>

            {/* Physics Track Severity */}
            <div className="p-3 rounded-lg bg-white border border-carbon-20">
              <span className="text-xs font-mono text-carbon-60 uppercase block">
                Physics Track
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-lg font-mono font-bold text-cyan-600">
                  {formatNumber(Math.round(physicsSeverity * 100))}%
                </span>
                {isPhysicsOverridden && (
                  <span className="text-xs font-bold text-cyan-600 uppercase">
                    Override
                  </span>
                )}
              </div>
              <div className="w-full bg-carbon-10 h-1.5 rounded-full overflow-hidden mt-2">
                <div
                  className="bg-cyan-600 h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, physicsSeverity * 100))}%` }}
                />
              </div>
            </div>

            {/* Final Fused Severity */}
            <div className="p-3 rounded-lg bg-white border border-carbon-20 ring-1 ring-carbon-30">
              <span className="text-xs font-mono text-carbon-60 uppercase block">
                Final Fused Score
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-lg font-mono font-bold text-carbon-90 dark:text-white">
                  {formatNumber(Math.round(finalSeverity * 100))}%
                </span>
                <span className="text-xs font-bold uppercase text-carbon-60">
                  {finalSeverity >= 0.67 ? 'High' : finalSeverity >= 0.34 ? 'Moderate' : 'Low'}
                </span>
              </div>
              <div className="w-full bg-carbon-10 h-1.5 rounded-full overflow-hidden mt-2">
                <div
                  className={`h-full rounded-full transition-all ${
                    finalSeverity >= 0.67
                      ? 'bg-rose-600'
                      : finalSeverity >= 0.34
                      ? 'bg-amber-500'
                      : 'bg-emerald-600'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, finalSeverity * 100))}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── 4. Forecasted Weather Parameters ── */}
        <div className="space-y-2">
          <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-carbon-70 flex items-center gap-1.5">
            <MaterialIcon name="sensors" className="w-4 h-4 text-carbon-50" />
            <span>Forecasted Agrometeorological Parameters</span>
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Max Temp */}
            <div className="p-3 rounded-xl bg-carbon-05 border border-carbon-20 flex flex-col">
              <span className="text-xs font-mono text-carbon-60 uppercase">Max Temp</span>
              <span className="text-base font-mono font-bold text-rose-600 mt-1">
                {forecast.temperature_max !== undefined ? `${formatNumber(forecast.temperature_max)}°C` : '—'}
              </span>
            </div>

            {/* Min Temp */}
            <div className="p-3 rounded-xl bg-carbon-05 border border-carbon-20 flex flex-col">
              <span className="text-xs font-mono text-carbon-60 uppercase">Min Temp</span>
              <span className="text-base font-mono font-bold text-sky-600 mt-1">
                {forecast.temperature_min !== undefined ? `${formatNumber(forecast.temperature_min)}°C` : '—'}
              </span>
            </div>

            {/* Precipitation */}
            <div className="p-3 rounded-xl bg-carbon-05 border border-carbon-20 flex flex-col">
              <span className="text-xs font-mono text-carbon-60 uppercase">Precipitation</span>
              <span className="text-base font-mono font-bold text-blue-600 mt-1">
                {forecast.precipitation_mm !== undefined ? `${formatNumber(forecast.precipitation_mm)} mm` : '—'}
              </span>
            </div>

            {/* Wind Speed */}
            <div className="p-3 rounded-xl bg-carbon-05 border border-carbon-20 flex flex-col">
              <span className="text-xs font-mono text-carbon-60 uppercase">Wind Speed</span>
              <span className="text-base font-mono font-bold text-teal-600 mt-1">
                {forecast.wind_max_kmh !== undefined ? `${formatNumber(forecast.wind_max_kmh)} km/h` : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* ── 5. Confidence Breakdown Visualizer (Top-3 Probabilities) ── */}
        <div className="p-4 rounded-xl bg-carbon-05 border border-carbon-20 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-carbon-70 flex items-center gap-1.5">
              <MaterialIcon name="analytics" className="w-4 h-4 text-carbon-50" />
              <span>Hazard Probability Breakdown (Top-3)</span>
            </h3>
            <span className="font-mono text-xs font-bold text-emerald-600">
              Confidence: {formatNumber(Math.round(confidence * 100))}%
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {/* Top 1 */}
            <div>
              <div className="flex justify-between font-mono text-xs mb-1">
                <span className="font-semibold text-carbon-80">
                  1. {forecast.hazard_type} (Primary)
                </span>
                <span className="font-bold">
                  {forecast.prob_top1 !== undefined
                    ? `${formatNumber(Math.round(forecast.prob_top1 * 100))}%`
                    : `${formatNumber(Math.round(confidence * 100))}%`}
                </span>
              </div>
              <div className="w-full bg-carbon-10 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-600 h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(0, (forecast.prob_top1 ?? confidence) * 100)
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Top 2 */}
            {forecast.prob_top2 !== undefined && (
              <div>
                <div className="flex justify-between font-mono text-xs mb-1">
                  <span className="text-carbon-60">2. Competing Hazard Alternative</span>
                  <span className="font-bold text-carbon-70">
                    {formatNumber(Math.round(forecast.prob_top2 * 100))}%
                  </span>
                </div>
                <div className="w-full bg-carbon-10 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-carbon-40 h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, forecast.prob_top2 * 100))}%` }}
                  />
                </div>
              </div>
            )}

            {/* Top 3 */}
            {forecast.prob_top3 !== undefined && (
              <div>
                <div className="flex justify-between font-mono text-xs mb-1">
                  <span className="text-carbon-60">3. Background Hazard Residual</span>
                  <span className="font-bold text-carbon-70">
                    {formatNumber(Math.round(forecast.prob_top3 * 100))}%
                  </span>
                </div>
                <div className="w-full bg-carbon-10 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-carbon-30 h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, forecast.prob_top3 * 100))}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DistrictDetailPanel;
