/**
 * The five-second answer, as the first thing the front door says.
 *
 * The landing page's problem was never a lack of information; it was that a reader had to
 * assemble the answer from a count strip, a coverage figure, a timestamp and a paragraph
 * about publication gates. A union chairman on a 3G connection gives the page about five
 * seconds. This component spends them on one sentence.
 *
 * The hard part is not the design, it is the honesty. Apple's *responsibility* principle
 * says a safety surface must not overstate what it knows, and on a hazard platform the
 * dangerous direction is always the reassuring one: "no alert published" is a statement
 * about the publisher, not about the weather, and the repository says so in as many words
 * (`LiveStatusStrip`, `packages/core/src/alertPolicy.ts`).
 *
 * So there are exactly three answers, and the component cannot produce a fourth:
 *
 *   `unknown`  — the artifact could not be read. States that plainly, and says the situation
 *                is unknown rather than safe. This is the state the old page rendered as a
 *                paragraph, and the state most likely to be read as "nothing to worry about".
 *   `active`   — alerts are published above the watch threshold. Names the count and the worst
 *                level, and links to them.
 *   `quiet`    — nothing is published above the watch threshold *in this run*. Says that, and
 *                does not claim every district is safe, because the run also withholds rows
 *                pending review and that is not the same statement.
 *
 * Colour is a secondary carrier throughout: the state word is in the sentence, the icon is
 * decorative, and the sentence alone is enough to act on — which is what a screen reader,
 * a monochrome print and a colour-blind reader all get.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { AlertLevelBadge } from '../alerts/AlertLevelBadge';
import MaterialIcon from '../MaterialIcon';
import { useI18n } from '../../hooks/useI18n';

export type VerdictState = 'unknown' | 'active' | 'quiet';

/**
 * What the header shows. `reading` is not a fourth answer to the question — it is the
 * absence of one, and it exists so the first paint of the page does not flash "nothing is
 * published" before the artifact has been looked at. That flash is the same class of mistake
 * as rendering an unread file as safe, one frame long.
 */
export type VerdictDisplay = VerdictState | 'reading';

export interface StatusVerdictProps {
  /** Published alerts above the watch threshold. */
  published: number;
  /** The worst level among them, when there is one. */
  worstLevel?: string | null;
  /** Rows the run assessed. `null` when the artifact could not be read. */
  assessed: number | null;
  /** Rows assessed but withheld from publication pending review. */
  withheld: number | null;
  /** True while the artifact is still being read. */
  loading: boolean;
  /** True when the artifact could not be read at all. */
  unread: boolean;
  /** The run's own timestamp, when it has one. */
  generatedAt?: string | null;
  className?: string;
}

const ICONS: Record<VerdictDisplay, string> = {
  reading: 'autorenew',
  unknown: 'help_outline',
  active: 'warning',
  quiet: 'check_circle',
};

export const StatusVerdict: React.FC<StatusVerdictProps> = ({
  published,
  worstLevel = null,
  assessed,
  withheld,
  loading,
  unread,
  generatedAt = null,
  className = '',
}) => {
  const { t, formatNumber, formatDate } = useI18n();

  const display: VerdictDisplay = loading ? 'reading' : unread ? 'unknown' : published > 0 ? 'active' : 'quiet';

  const asOf = generatedAt ? formatDate(generatedAt) : null;
  const body =
    display === 'reading'
      ? t('verdict.reading')
      : display === 'unknown'
        ? t('verdict.unknown.body')
        : display === 'active'
          ? t('verdict.active.body', { count: formatNumber(published) })
          : t('verdict.quiet.body');

  // The quiet state carries the run's arithmetic underneath, because "nothing published"
  // and "nothing looked at" must not read the same. The active state does not need it.
  const detail =
    display === 'quiet' && (assessed != null || withheld != null)
      ? t('verdict.quiet.detail', {
          assessed: assessed != null ? formatNumber(assessed) : '—',
          withheld: withheld != null ? formatNumber(withheld) : '—',
        })
      : null;

  /* The timestamp belongs to a *reading*. It is withheld while reading and while the file is
     unreadable, because a stamp beside an unknown state implies the state came from that run —
     and withheld when there is nothing to put it next to, so no empty line is rendered. */
  const supportLine =
    display === 'quiet'
      ? [detail, asOf ? t('verdict.asOf', { time: asOf }) : null].filter(Boolean).join(' · ')
      : display === 'active' && asOf
        ? t('verdict.asOf', { time: asOf })
        : null;

  return (
    <div
      data-testid="status-verdict"
      data-state={display}
      /* NOT a live region, deliberately. This renders inside `LiveStatusStrip`, which already
         owns `role="status" aria-live="polite"`, and nesting two live regions makes a screen
         reader announce the same change twice. One live region per surface: the strip is the
         announcer, this is content inside it. The colour and the word still carry the state. */
      className={`border-b border-carbon-20 px-4 py-4 lg:px-6 ${
        display === 'unknown' ? 'bg-carbon-05' : 'bg-white'
      } ${className}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <MaterialIcon name={ICONS[display]} className="text-xl text-carbon-70" aria-hidden="true" />
        <p className="ap-body-strong flex-1 min-w-[16rem]" data-testid="verdict-body">
          {display === 'unknown' ? (
            <span className="text-carbon-90">
              <strong className="font-bold">{t('verdict.unknown.lead')}</strong> {body}
            </span>
          ) : (
            <>
              {/* `reading` has a single-line key (`verdict.reading`), not a lead/body pair —
                  requesting `.lead` on it used to print the raw key into the strip. */}
              <strong className="font-bold">
                {display === 'reading' ? t('verdict.reading') : t(`verdict.${display}.lead`)}
              </strong>{' '}
              {display === 'reading' ? null : body}
            </>
          )}
        </p>

        {display === 'active' && worstLevel && (
          <AlertLevelBadge
            level={worstLevel}
            label={t(`alerts.level.${worstLevel}`)}
            description={t(`alerts.level.${worstLevel}.desc`)}
            srPrefix={t('alerts.levelLabel')}
          />
        )}

        {display === 'active' && (
          <Link
            to="/alerts"
            className="ap-link inline-flex min-h-[44px] items-center font-bold underline underline-offset-4"
          >
            {t('verdict.active.link')}
          </Link>
        )}

        {display === 'unknown' && (
          <Link
            to="/status"
            className="ap-link inline-flex min-h-[44px] items-center font-bold underline underline-offset-4"
          >
            {t('verdict.unknown.link')}
          </Link>
        )}
      </div>

      {supportLine && (
        <p className="ap-caption mt-1.5 pl-[2.1rem] text-carbon-60" data-testid="verdict-detail">
          {supportLine}
        </p>
      )}
    </div>
  );
};

export default StatusVerdict;
