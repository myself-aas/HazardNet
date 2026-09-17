/**
 * `/status` — the public status page (Phase 7).
 *
 * The explanatory copy is the `/status` entry in `src/content/site-routes.json` (the same
 * copy the prerenderer writes into the static HTML); the live half is `FreshnessPanel`,
 * which reads `frontend/public/data/freshness.json`.
 *
 * The page is English-only on purpose and that is a documented decision, not an oversight:
 * everything it states comes from artifact keys and file paths written in English, and the
 * bilingual surface in this product is the alert UI a duty officer reads in the field
 * (`docs/ops/STATUS_PAGE.md`).
 */

import React from 'react';
import ArticlePage from '../components/ArticlePage';
import FreshnessPanel from '../components/status/FreshnessPanel';

export const StatusPage: React.FC = () => <ArticlePage path="/status" introSlot={<FreshnessPanel />} />;

export default StatusPage;
