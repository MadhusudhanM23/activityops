/** Domain vocabulary. Spec v7 sec. 6, 7, 11, 13. */

export type RequirementType = 'RING_REQUIRED' | 'NON_RING';

export type AttemptStatus = 'IN_PROGRESS' | 'PASS' | 'FAIL' | 'OVERRIDDEN' | 'CANCELLED';

export type RunStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'NOT_READY'
  | 'READY_TO_APPROVE'
  | 'READY'
  | 'CANCELLED';

/**
 * Observed separately from run status. RECONNECT_REQUIRED blocks promotion to
 * READY_TO_APPROVE but never creates BLOCKED or a coverage incident (sec. 10/11).
 */
export type IntegrationState = 'HEALTHY' | 'RECONNECT_REQUIRED';

export type DeviceStatus = 'UNKNOWN' | 'AVAILABLE' | 'UNAVAILABLE';

export type IncidentSeverity = 'BLOCKER' | 'HIGH' | 'MEDIUM' | 'LOW';

export type IncidentStatus =
  | 'OPEN'
  | 'ACKNOWLEDGED'
  | 'ACTION_REQUIRED'
  | 'RECHECKING'
  | 'READY_TO_RESOLVE'
  | 'RESOLVED'
  | 'DISMISSED';

/** Severities that prevent promotion to READY_TO_APPROVE (sec. 13). */
export const BLOCKING_SEVERITIES: readonly IncidentSeverity[] = ['BLOCKER', 'HIGH'];

/** Incident states that still count as open for the one-open-incident rule. */
export const OPEN_INCIDENT_STATUSES: readonly IncidentStatus[] = [
  'OPEN',
  'ACKNOWLEDGED',
  'ACTION_REQUIRED',
  'RECHECKING',
  'READY_TO_RESOLVE',
];

/**
 * Why a Ring-backed check cannot be satisfied. Kept distinct so the UI and the
 * AI explanation can never collapse an integration problem into site evidence.
 */
export type BlockerCause =
  | 'DEVICE_UNAVAILABLE' // sec. 10 Case A - confirmed offline
  | 'COVERED_WINDOW_NO_SESSION'; // sec. 10 Case B - expired + covered sync + nothing found
