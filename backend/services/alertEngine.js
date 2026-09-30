/**
 * alertEngine.js — Alert Engine service facade (TASK-009 / PRD REQ-002 / TRD §6.1, §7.4).
 *
 * Exposes the full alert lifecycle state machine, HITL review actions, optimistic
 * locking, and audit trail orchestration.
 */

import {
  runAlertEngine,
  reviewAlert,
  getAlertStore,
  resetAlertStore,
  listAlerts,
  previewAssessments,
  alertFromDocument,
  alertIdFor,
  alertKeyFor,
  getAlertRunState,
  setAlertRunState,
  stateCounts,
} from '../alerts/service.js';
import {
  ALERT_STATES,
  TERMINAL_STATES,
  evaluateTransition,
  applyTransition,
  isDutyOfficer,
  canAutoPublish,
  buildEvidenceSnapshot,
  toPublishRecord,
  describeTransitions,
} from '../alerts/lifecycle.js';
import { getPolicy, describePolicy, ALERT_LEVELS } from '../alerts/policy.js';
import { buildEvidenceCard, alertsToCsv, buildReportMarkdown } from '../alerts/report.js';

export {
  // Primary engine & review workflows
  runAlertEngine,
  reviewAlert,
  listAlerts,
  previewAssessments,
  getAlertStore,
  resetAlertStore,
  alertFromDocument,
  alertIdFor,
  alertKeyFor,
  getAlertRunState,
  setAlertRunState,
  stateCounts,

  // Lifecycle & State Machine
  ALERT_STATES,
  TERMINAL_STATES,
  evaluateTransition,
  applyTransition,
  isDutyOfficer,
  canAutoPublish,
  buildEvidenceSnapshot,
  toPublishRecord,
  describeTransitions,

  // Policy & reporting
  getPolicy,
  describePolicy,
  ALERT_LEVELS,
  buildEvidenceCard,
  alertsToCsv,
  buildReportMarkdown,
};
