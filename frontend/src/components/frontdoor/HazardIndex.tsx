/**
 * HazardIndex — the eight hazard classes as one static, type-led index.
 *
 * This replaces the retired `AppleHazardsBento` in the 2026-10-28 distill pass. The bento
 * carried two view modes, a horizontal shelf with scroll state, four quick-action cards that
 * repeated destinations already offered by the hero and status strip, bespoke SVG motifs,
 * English telemetry strings and card copy maintained apart from the methodology record.
 * None of that helped the front door's job: decide and act.
 *
 * The index keeps only what a reader needs to choose a class: its name in the active
 * language, the methodology file's own one-line summary, its active window, and a link to
 * the full class page. Every row is in normal page flow, so all eight classes are findable
 * without a mode switch, a horizontal scroll region or JavaScript state.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import MaterialIcon from '../MaterialIcon';
import { useI18n } from '../../hooks/useI18n';
import { hazardIcon, useHazardLabel } from '../../hooks/useHazardLabel';

export interface HazardIndexItem {
  slug: string;
  class: string;
  season: string;
  summary?: string;
}

interface HazardIndexProps {
  hazards: HazardIndexItem[];
}

export const HazardIndex: React.FC<HazardIndexProps> = ({ hazards }) => {
  const { language } = useI18n();
  const hazardLabel = useHazardLabel();
  const englishDataLang = language === 'bn' ? 'en' : undefined;

  return (
    <ul className="grid grid-cols-1 border-t border-carbon-20 md:grid-cols-2 md:gap-x-8">
      {hazards.map((hazard) => (
        <li key={hazard.slug} className="min-w-0 border-b border-carbon-20">
          <Link
            to={`/hazards/${hazard.slug}`}
            className="group flex min-h-[44px] items-start gap-2.5 px-1 py-3.5 transition-colors hover:bg-carbon-05 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary focus-visible:outline-offset-2 sm:gap-3 sm:px-2 sm:py-4"
          >
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-carbon-05 text-carbon-70 sm:h-10 sm:w-10"
            >
              <MaterialIcon name={hazardIcon(hazard.class)} className="text-lg sm:text-xl" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-ap-headline-sm font-bold text-carbon-90 group-hover:text-ap-link">
                {hazardLabel(hazard.class)}
              </span>
              {hazard.summary && (
                <span
                  lang={englishDataLang}
                  className="mt-1 block break-words text-sm leading-[1.55] text-carbon-70"
                >
                  {hazard.summary}
                </span>
              )}
              <span className="mt-1 block break-words text-sm leading-[1.55] text-carbon-60 sm:text-xs sm:leading-[1.5]">
                <span className="font-semibold">
                  {language === 'bn' ? 'সক্রিয় মৌসুম' : 'Active window'}:{' '}
                </span>
                <span lang={englishDataLang}>{hazard.season}</span>
              </span>
            </span>
            <MaterialIcon
              name="arrow_forward"
              aria-hidden="true"
              className="mt-1 shrink-0 text-base text-carbon-40 transition-transform group-hover:translate-x-0.5 group-hover:text-ap-link"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
};

export default HazardIndex;
