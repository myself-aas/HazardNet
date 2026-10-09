import React from 'react';
import { MapPin, Compass } from 'lucide-react';

import { useDistrictBrief } from './DistrictBriefContext';

/**
 * The outlook for this district, read only from the published forecast record.
 * Everything here is either a served value or an explicit absence.
 */
export const DistrictOutlookCard: React.FC = () => {
  const { data, district, peakSeverityInfo, metadata } = useDistrictBrief();

  return (
    <section aria-labelledby="district-outlook-heading" className="bg-white border border-carbon-20 rounded-xl p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center gap-2 screen-only">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-carbon-10 border border-carbon-20 text-carbon-70 text-xs font-mono">
          <MapPin className="w-3 h-3 text-carbon-60" />
          {data.division} Division
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-carbon-10 border border-carbon-20 text-carbon-70 text-xs font-mono">
          <Compass className="w-3 h-3 text-carbon-60" />
          {district.lat.toFixed(3)}°N, {district.lng.toFixed(3)}°E
        </span>
      </div>

      <div>
        <h2 id="district-outlook-heading" className="text-lg font-bold text-carbon-90 tracking-tight">
          Outlook for {data.districtName}
        </h2>
        {peakSeverityInfo ? (
          <p className="mt-1 text-sm text-carbon-70 max-w-prose">
            The highest published severity for this district is{' '}
            <strong className="text-carbon-90">{Math.round(peakSeverityInfo.peakScore * 100)}%</strong> for{' '}
            <strong className="text-carbon-90">{peakSeverityInfo.hazard}</strong> on{' '}
            <strong className="text-carbon-90">{peakSeverityInfo.peakDate}</strong>, from the run dated{' '}
            {metadata.predictionDate ?? 'not available'}.
          </p>
        ) : (
          <p className="mt-1 text-sm text-carbon-70 max-w-prose">
            This district has no published record in the current forecast run. Nothing is estimated in its place.
          </p>
        )}
      </div>

      {peakSeverityInfo && (
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="rounded-lg bg-carbon-05 border border-carbon-20 p-4">
            <dt className="text-xs font-mono font-bold uppercase text-carbon-60">Peak severity</dt>
            <dd className="mt-1 text-2xl font-black font-mono text-carbon-90">{Math.round(peakSeverityInfo.peakScore * 100)}%</dd>
          </div>
          <div className="rounded-lg bg-carbon-05 border border-carbon-20 p-4">
            <dt className="text-xs font-mono font-bold uppercase text-carbon-60">Confidence score</dt>
            <dd className="mt-1 text-2xl font-black font-mono text-carbon-90">{Math.round(peakSeverityInfo.confidence * 100)}%</dd>
            <dd className="mt-1 text-xs text-carbon-60">Uncalibrated model softmax. Not a probability.</dd>
          </div>
          <div className="rounded-lg bg-carbon-05 border border-carbon-20 p-4">
            <dt className="text-xs font-mono font-bold uppercase text-carbon-60">Forecast run</dt>
            <dd className="mt-1 text-base font-bold font-mono text-carbon-90">{metadata.predictionDate ?? 'Not available'}</dd>
            <dd className="mt-1 text-xs text-carbon-60">{metadata.source ? `Source: ${metadata.source}` : 'Source not available'}</dd>
          </div>
        </dl>
      )}

      <p className="text-xs text-carbon-60 border-t border-carbon-20 pt-3">
        HazardNet is not an official warning service. Official warnings come from BMD and FFWC. For emergencies, call 999.
      </p>
    </section>
  );
};

export default DistrictOutlookCard;
