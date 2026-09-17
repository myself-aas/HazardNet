/**
 * The §1.7 disclaimer and the emergency numbers, as one component (Phase 5).
 *
 * PRODUCT_SPEC §1.7 requires the disclaimer on **every public surface, including SMS
 * and exports**. On the web that means: the alert list, the alert detail/evidence
 * card, the district page, and anything printed or exported to PDF. One component
 * means one wording — the wording the backend also carries — instead of four copies
 * that drift.
 *
 * The emergency numbers are rendered as `tel:` links because the reader who needs
 * them is on a phone, sometimes in a hurry, sometimes in the dark. The *text* still
 * contains the digits, so a printed sheet or a screenshot is just as useful.
 *
 * `lang` is set on the English body when the page is Bengali: the disclaimer is
 * canonical English text that must match the API and the spec byte-for-byte, and
 * marking it `lang="en"` is how a screen reader pronounces it correctly instead of
 * reading English words with a Bengali voice.
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { ALERT_DISCLAIMER, EMERGENCY_NUMBERS } from '../../lib/legal';
import { useI18n } from '../../hooks/useI18n';

export interface DisclaimerProps {
  /** `inline` for a paragraph, `banner` for the alert page header, `print` for exports. */
  variant?: 'inline' | 'banner' | 'print';
  /** Override the server-supplied text (defaults to the canonical §1.7 constant). */
  text?: string | null;
  className?: string;
  /** Render the emergency numbers as call links (off in print/PDF). */
  showNumbers?: boolean;
}

export const Disclaimer: React.FC<DisclaimerProps> = ({
  variant = 'inline',
  text,
  className = '',
  showNumbers,
}) => {
  const { language, t } = useI18n();
  const body = text && text.trim().length > 0 ? text : ALERT_DISCLAIMER;
  const withNumbers = showNumbers ?? variant !== 'print';
  const heading = t('common.disclaimer');
  const bodyLang = language === 'bn' ? 'en' : undefined;

  if (variant === 'print') {
    return (
      <div className={`text-[10px] leading-snug text-slate-600 ${className}`} data-testid="disclaimer-print">
        <p className="font-bold uppercase tracking-wide text-slate-700">{heading}</p>
        <p lang={bodyLang}>{body}</p>
      </div>
    );
  }

  const shell = variant === 'banner'
    ? 'rounded-2xl border border-amber-300 bg-amber-50 p-3 sm:p-4'
    : 'rounded-xl border border-slate-200 bg-slate-50 p-3';

  // `role="note"` rather than `<aside>`: a complementary landmark must be top-level, and
  // the evidence card (a region) legitimately contains this. axe-core flags the nested
  // landmark, and a note is the more accurate role for a disclaimer anyway — it is
  // supporting information, not a navigable section of the page.
  return (
    <div role="note" className={`${shell} ${className}`} aria-label={heading} data-testid="disclaimer">
      <div className="flex items-start gap-2">
        <MaterialIcon name="info" className="text-amber-700 text-base mt-0.5" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900">{heading}</p>
          <p className="text-xs leading-relaxed text-slate-700" lang={bodyLang}>{body}</p>
          {withNumbers && (
            <ul className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5 text-[11px] font-semibold text-slate-800">
              {EMERGENCY_NUMBERS.map((entry) => (
                <li key={entry.number}>
                  <a
                    href={`tel:${entry.number}`}
                    className="underline decoration-dotted underline-offset-2 hover:text-amber-800"
                  >
                    <span className="font-bold">{entry.number}</span>
                    {variant === 'banner' ? ` — ${entry.label}` : ''}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default Disclaimer;
