/**
 * Data credits for the forecast records, as one block a page can place under its figures.
 *
 * Names come from `lib/dataCredits.ts` so every page states the same citation. The BibTeX is
 * the one the dataset owner supplied, shown verbatim and copyable; it is not rebuilt here.
 */

import React from 'react';
import { activeCredits, KAGGLE_BIBTEX } from '../lib/dataCredits';

interface Props {
  /** Credit ids from DATA_CREDITS to list, in display order. */
  ids: string[];
  /** Show the BibTeX entry (only the Kaggle forecast sources have one). */
  showBibtex?: boolean;
  className?: string;
}

export const DataCreditLines: React.FC<Props> = ({ ids, showBibtex = false, className = '' }) => {
  const credits = activeCredits(ids);
  if (credits.length === 0) return null;
  return (
    <section
      aria-labelledby="data-credit-heading"
      className={`rounded-xl border border-carbon-20 bg-white p-4 text-xs text-carbon-70 ${className}`}
    >
      <h2 id="data-credit-heading" className="text-sm font-bold text-carbon-90">
        Data credit
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        {credits.map((credit) => (
          <li key={credit.id}>
            {credit.label}{' '}
            <a
              href={credit.href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted underline-offset-2 hover:text-amber-800"
            >
              Source and terms
            </a>
            {credit.licence ? <span className="text-carbon-60"> · Licence: {credit.licence}</span> : null}
          </li>
        ))}
      </ul>
      {showBibtex ? (
        <details className="mt-3">
          <summary className="min-h-[44px] cursor-pointer font-semibold text-carbon-80">BibTeX</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre rounded-lg bg-carbon-05 p-3 font-mono text-[12px] leading-relaxed text-carbon-90">
            {KAGGLE_BIBTEX}
          </pre>
        </details>
      ) : null}
    </section>
  );
};

export default DataCreditLines;
