/**
 * The traffic-light advisory card — one district, one decision, three colours.
 *
 * This is the *farmer-facing* register of the advisory: a tier word, the hazard, how sure
 * the pipeline is, when it is about, and a button that reads it out. It is deliberately not
 * a smaller copy of `district/AdvisorySignalCard` (the technical card, which exists to show
 * the four severity tracks to someone auditing the model). Both belong in the product; they
 * address different readers, and the mistake this card exists to fix is asking the second
 * reader to do the first reader's work.
 *
 * Three rules it holds to, each of which is a way of not misleading someone:
 *
 *   1. **The tier is the headline, never the decimal.** `final_severity: 0.87` is not a
 *      decision; SEVERE is. The number is still rendered, but as metadata under the tier.
 *   2. **A baseline is not an absence.** A district with nothing above the watch threshold
 *      renders as NORMAL with the run's timestamp — a definite reading — rather than as
 *      blank space. `state="unread"` is the other case and it never claims NORMAL: an
 *      unfetched forecast is not a quiet one, and the two must not look alike.
 *   3. **Colour is never alone.** Every state carries a word, and an icon, and a shape; the
 *      accent is the tier's published token, not a hex chosen here. `.ap-sev-*` and
 *      `APPLE_SEVERITY` are the only source of that colour, via `AlertLevelBadge`.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Volume2, VolumeX } from 'lucide-react';
import { AlertLevelBadge, levelTokens } from './AlertLevelBadge';
import MaterialIcon from '../MaterialIcon';
import { Button } from '../apple/primitives';
import { useI18n } from '../../hooks/useI18n';
import { hazardLabel, useHazardIcon } from '../../hooks/useHazardLabel';
import {
  advisoryTierOf,
  confidenceBin,
  type AdvisoryTier,
  type ForecastRow,
} from '../../lib/forecasts';
import { actionKeysFor } from '../../lib/advisoryActions';
import { cancelSpeech, speak, speechSupported } from '../../lib/tts';

/**
 * What the card is describing.
 *
 *   `advisory` — a row was read and it carries a tier.
 *   `baseline` — the artifact was read and this district is below the watch threshold.
 *   `unread`   — the artifact could not be read. Never rendered as `baseline`.
 */
export type TrafficLightState = 'advisory' | 'baseline' | 'unread';

export interface TrafficLightAlertCardProps {
  districtName: string;
  /** Bengali district name when the caller has one; it becomes the primary label for `bn`. */
  districtNameBn?: string;
  /** The advisory row. Required for `advisory`, ignored otherwise. */
  row?: ForecastRow | null;
  state?: TrafficLightState;
  /** ISO timestamp of the run being described. Shown on the baseline card. */
  asOf?: string;
  className?: string;
}

export const TrafficLightAlertCard: React.FC<TrafficLightAlertCardProps> = ({
  districtName,
  districtNameBn,
  row = null,
  state,
  asOf,
  className = '',
}) => {
  const { t, language, isBengali, formatDate, formatNumber } = useI18n();
  const hazardIcon = useHazardIcon();
  const [speaking, setSpeaking] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);

  // Resolved after mount, never during render: the site is prerendered, and a browser with
  // speech support would otherwise hydrate a button the static HTML did not contain.
  useEffect(() => {
    setCanSpeak(speechSupported());
  }, []);

  const stop = useCallback(() => {
    cancelSpeech();
    setSpeaking(false);
  }, []);

  // Leaving the page mid-sentence should stop the sentence. A nav click that leaves a voice
  // reading a district nobody is looking at is worse than no feature.
  useEffect(() => () => cancelSpeech(), []);

  const resolvedState: TrafficLightState = state ?? (row ? 'advisory' : 'unread');
  const tier: AdvisoryTier | null = resolvedState === 'advisory' && row ? advisoryTierOf(row) : null;

  // A row the pipeline did not label shows the locally derived tier, and says so. Burying the
  // distinction would present a client-side threshold as the pipeline's judgement.
  const derived = resolvedState === 'advisory' && Boolean(row) && !row?.advisory_tier;

  const hazard = resolvedState === 'advisory' && row ? row.hazard_type : null;
  const horizonKey = row?.horizon ? `advisory.horizon.${row.horizon}` : null;
  const horizonLabel =
    resolvedState === 'advisory' && row
      ? horizonKey
        ? t(horizonKey)
        : row.horizon
      : '';

  const confidence =
    resolvedState === 'advisory' && row && Number.isFinite(row.confidence) ? row.confidence : null;
  const confidenceLabel = confidence === null ? '' : t(`confidence.${confidenceBin(confidence)}`);

  const accent = resolvedState === 'unread' ? undefined : levelTokens(tier ?? 'NORMAL').solid;

  // The instruction for the tier, and the protective action for this hazard. Composed from
  // two short lines (see lib/advisoryActions.ts) so a new class costs one string, not four.
  const action = actionKeysFor(tier, hazard);
  const advice = [t(action.tierKey), action.hazardKey ? t(action.hazardKey) : '']
    .filter(Boolean)
    .join(' ');

  const primaryName = isBengali ? (districtNameBn ?? districtName) : districtName;
  const secondaryName = isBengali ? districtName : districtNameBn;

  const onListen = useCallback(() => {
    if (speaking) {
      stop();
      return;
    }
    const sentence = [
      t('advisory.tts.sentence', {
        district: primaryName,
        hazard: hazard ? hazardLabel(hazard, language) : '',
        tier: t(`alerts.tier.${tier ?? 'NORMAL'}`),
        confidence: confidenceLabel,
        horizon: horizonLabel,
      }),
      // The advice is the part worth hearing: a listener who stops reading after the tier
      // still needs to know what to do, and it costs one sentence.
      advice ? t('advisory.tts.advice', { advice }) : '',
    ]
      .filter(Boolean)
      .join(' ');
    const started = speak(sentence, { language, onEnd: () => setSpeaking(false) });
    if (started) setSpeaking(true);
  }, [
    speaking,
    stop,
    t,
    primaryName,
    hazard,
    tier,
    confidenceLabel,
    horizonLabel,
    advice,
    language,
  ]);

  return (
    <article
      data-testid="traffic-light-card"
      data-state={resolvedState}
      data-tier={resolvedState === 'unread' ? undefined : (tier ?? 'NORMAL')}
      aria-labelledby={`advisory-card-${districtName.replace(/\s+/g, '-').toLowerCase()}`}
      className={`ap-card p-4 sm:p-5 ${className}`}
      style={
        accent
          ? { borderInlineStartColor: accent, borderInlineStartWidth: 5, borderInlineStartStyle: 'solid' }
          : { borderInlineStartColor: 'var(--ap-label-tertiary)', borderInlineStartWidth: 5, borderInlineStartStyle: 'dashed' }
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id={`advisory-card-${districtName.replace(/\s+/g, '-').toLowerCase()}`}
            className="ap-body-strong truncate"
          >
            <span lang={isBengali ? 'bn' : 'en'}>{primaryName}</span>
            {secondaryName && (
              <span className="ap-caption ml-2 font-normal text-carbon-60" lang={isBengali ? 'en' : 'bn'}>
                {secondaryName}
              </span>
            )}
          </h3>

          {hazard && (
            <p className="ap-caption mt-1 flex items-center gap-1.5">
              <MaterialIcon
                name={hazardIcon(hazard)}
                className="text-base text-carbon-70"
                aria-hidden="true"
              />
              <span lang={isBengali ? 'bn' : 'en'}>{hazardLabel(hazard, language)}</span>
              {/* The English class name is always available, because it is the one that
                  appears on the CSV, in the manuscript and on a duty officer's screen. */}
              {isBengali && (
                <span className="text-carbon-60" lang="en">
                  ({hazard})
                </span>
              )}
            </p>
          )}
        </div>

        {resolvedState === 'unread' ? (
          <span className="ap-caption inline-flex items-center gap-1.5 text-carbon-70" data-testid="tier-unread">
            <MaterialIcon name="help_outline" className="text-base" aria-hidden="true" />
            {t('common.notRead')}
          </span>
        ) : (
          <AlertLevelBadge
            level={tier ?? 'NORMAL'}
            label={t(`alerts.tier.${tier ?? 'NORMAL'}`)}
            srPrefix={t('advisory.card.tier')}
          />
        )}
      </div>

      {resolvedState === 'unread' && (
        <p className="ap-caption mt-3 text-carbon-70" data-testid="advisory-unread">
          {t('advisory.card.unread')}
        </p>
      )}

      {resolvedState === 'baseline' && (
        <p className="ap-caption mt-3 text-carbon-70" data-testid="advisory-baseline">
          <strong className="text-carbon-90">{t('advisory.card.baseline')}.</strong>{' '}
          {asOf ? t('advisory.card.baselineAsOf', { time: formatDate(asOf) }) : ''}
        </p>
      )}

      {resolvedState === 'advisory' && row && (
        <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <div className="flex items-center gap-1.5">
            <dt className="ap-fine-print text-carbon-60">{t('alerts.card.confidence')}</dt>
            <dd className="ap-caption font-semibold">
              {confidenceLabel}
              {confidence !== null && (
                <span className="ml-1.5 text-carbon-60">
                  {formatNumber(confidence, { style: 'percent', maximumFractionDigits: 0 })}
                </span>
              )}
            </dd>
          </div>
          {horizonLabel && (
            <div className="flex items-center gap-1.5">
              <dt className="ap-fine-print text-carbon-60">{t('alerts.card.horizon')}</dt>
              <dd className="ap-caption font-semibold">{horizonLabel}</dd>
            </div>
          )}
          {row.target_date && (
            <div className="flex items-center gap-1.5">
              <dt className="ap-fine-print text-carbon-60">{t('common.dataCutoff')}</dt>
              <dd className="ap-caption font-semibold">{formatDate(row.target_date)}</dd>
            </div>
          )}
        </dl>
      )}

      {resolvedState === 'advisory' && row?.physics_override && (
        <p className="ap-fine-print mt-3 inline-flex items-center gap-1.5 text-carbon-70">
          <MaterialIcon name="verified" className="text-base" aria-hidden="true" />
          {t('advisory.physicsOverride')}
        </p>
      )}

      {resolvedState !== 'unread' && (
        <div className="mt-4 border-t border-carbon-20 pt-3" data-testid="advisory-advice">
          <p className="ap-fine-print font-semibold uppercase tracking-wide text-carbon-60">
            {t('advisory.action.advice')}
          </p>
          <p className="ap-caption mt-1 text-carbon-90" lang={isBengali ? 'bn' : 'en'}>
            {advice}
          </p>
          {hazard && (
            <Link
              to="/advisories"
              className="ap-link ap-caption mt-1.5 inline-block font-semibold"
            >
              {t('advisory.action.fullProtocol')}
            </Link>
          )}
        </div>
      )}

      {derived && (
        <p className="ap-fine-print mt-2 text-carbon-60">{t('advisory.card.derivedNote')}</p>
      )}

      {canSpeak && resolvedState !== 'unread' && (
        <div className="mt-4">
          <Button
            intent="secondary"
            size="sm"
            onClick={onListen}
            aria-label={speaking ? t('advisory.card.stop') : t('advisory.card.spoken')}
          >
            {speaking ? (
              <VolumeX className="mr-1.5 h-4 w-4" aria-hidden="true" />
            ) : (
              <Volume2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
            )}
            {speaking ? t('advisory.card.stop') : t('advisory.card.listen')}
          </Button>
        </div>
      )}
    </article>
  );
};

export default TrafficLightAlertCard;
