/**
 * The public projection of a stored alert — one implementation, three runtimes.
 *
 * §1.6 requires the reviewer's identity to be *stored* on an alert; publishing a
 * volunteer's email to the open internet is a different act. This projection keeps the
 * decision, the timestamp and the reason (which is what makes an alert auditable) and
 * drops the contact details and the raw assessment log.
 *
 * WHY THIS FILE EXISTS. Until 2026-10-26 the projection was written twice on purpose:
 * `backend/routes/alerts.js` (Express) and `serverless/v1/alerts/index.js` (Node
 * functions), with a comment in the second explaining that importing the first "would
 * drag multer and the route graph into this cold start". Both copies were correct, and
 * both had to be edited together. Adding a third copy for Cloudflare Pages Functions —
 * which cannot import either of them for a different reason (no Node, no `fs`) — would
 * have made a security-relevant redaction rule exist in three places, one of which is
 * deployed on a different runtime with a different build step.
 *
 * So the rule lives here instead: dependency-free, no `fs`, no `process`, no Express.
 * Express imports it, the Node function imports it, `functions/api/v1/alerts/` imports
 * it, and `__tests__/pagesAlerts.test.js` runs the Node handler and the edge handler
 * over the same rows and compares the projections field by field.
 *
 * KEEP THIS MODULE PLATFORM-NEUTRAL. It is bundled into a Worker.
 */

/** Redact an actor string: keep the pipeline's own name and non-address identifiers. */
export function redactActor(actor) {
  if (!actor) return actor;
  const value = String(actor);
  if (value === 'alert-pipeline') return value;
  if (value.includes('@')) return 'reviewer (contact redacted)';
  return value;
}

/** Reviewer e-mail wording, identical on every runtime (it is a user-visible string). */
export const REVIEWER_CONTACT_REDACTED = 'reviewer email is available to duty officers only';

/**
 * Project one stored alert for a public reader.
 *
 * `includeReviewerContact` is true only for an authenticated duty officer. The edge
 * routes never set it: the web client has no credentials to present, and an
 * unauthenticated caller is exactly who this projection is for.
 */
export function publicAlertView(alert, { includeReviewerContact = false } = {}) {
  const view = { ...alert };
  delete view.assessment;
  if (!includeReviewerContact) {
    view.history = (alert.history || []).map((entry) => ({
      at: entry.at,
      from: entry.from,
      to: entry.to,
      level: entry.level,
      automatic: entry.actor === 'alert-pipeline',
      actor: redactActor(entry.actor),
      reason: entry.reason,
      rejection_reason: entry.rejection_reason,
    }));
    if (view.review) view.review = { ...view.review, reviewer: redactActor(view.review.reviewer) };
    if (view.published) {
      view.published = {
        ...view.published,
        reviewer: redactActor(view.published.reviewer),
        contact_redacted: REVIEWER_CONTACT_REDACTED,
      };
    }
  }
  return view;
}
