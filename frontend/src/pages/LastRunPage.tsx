/**
 * `/last-run` — the run card the front door's hero used to carry, on a page of its own.
 *
 * Relocated on 2026-10-05: the hero keeps one claim, one action and the links beside them,
 * and points here for the evidence. Everything this page states comes from the artifacts the
 * deployment ships — `/data/freshness.json` for coverage, source ages and the run's own honesty
 * notes, the alert snapshot for what that run published or withheld. An unreadable value stays
 * unreadable: it renders as an em dash or as the sentence that says the file could not be read,
 * never as a zero.
 *
 * The prose (h1, standfirst, sections) is the `/last-run` entry in `src/content/site-routes.json`,
 * rendered by `ArticlePage` — and the card itself is slotted directly under the header, the same
 * arrangement `/status` uses for its freshness panel.
 */

import React, { useEffect, useState } from 'react';
import ArticlePage from '../components/ArticlePage';
import RunVisual from '../components/frontdoor/RunVisual';
import { useAlertsData } from '../hooks/useAlertsData';
import { FRESHNESS_URL, parseFreshness, type FreshnessArtifact } from '../lib/freshness';

/**
 * One fetch, no retries, no polling: the card states what the deployment ships at the moment
 * of this read. A failure is left as a failure — an unread artifact is a fact too, and
 * `RunVisual` has its own sentence for it.
 */
function useFreshnessArtifact(): { freshness: FreshnessArtifact | null; loading: boolean } {
  const [freshness, setFreshness] = useState<FreshnessArtifact | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(FRESHNESS_URL, { cache: 'no-cache' });
        const payload = await response.json();
        const parsed = parseFreshness(payload);
        if (!cancelled && parsed) setFreshness(parsed);
      } catch {
        /* unreadable stays null — the card says so instead of dressing the gap as a number */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { freshness, loading };
}

export const LastRunPage: React.FC = () => {
  const { freshness, loading } = useFreshnessArtifact();
  const { alerts, counts, notPublished } = useAlertsData();

  /**
   * The same null discipline the front door applies: `published` is null, not 0, when the
   * alert artifact itself was unreadable — "0 alerts" and "we could not read the file" are
   * different facts, and on a hazard page the second must never be dressed as the first.
   */
  const alertsReadable = counts !== null || alerts.length > 0;
  const published = alertsReadable ? alerts.length : null;
  const withheld = counts?.not_published ?? notPublished ?? null;

  return (
    <ArticlePage
      path="/last-run"
      introSlot={
        <RunVisual freshness={freshness} loading={loading} published={published} withheld={withheld} />
      }
    />
  );
};

export default LastRunPage;
