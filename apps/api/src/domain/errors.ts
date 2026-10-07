/** Domain rule violations. These are 4xx conditions, not bugs. */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const ERR = {
  /** PASS attempted on a RING_REQUIRED check with no qualifying claimed evidence (sec. 12). */
  RING_EVIDENCE_REQUIRED: 'RING_EVIDENCE_REQUIRED',
  /** The attempt has already been attested; attempts are immutable (sec. 7). */
  ATTEMPT_NOT_OPEN: 'ATTEMPT_NOT_OPEN',
  /** A second open attempt for the same check would make "latest" ambiguous. */
  ATTEMPT_ALREADY_OPEN: 'ATTEMPT_ALREADY_OPEN',
  /** The event is already claimed by another attempt (sec. 8.8). */
  EVENT_ALREADY_CLAIMED: 'EVENT_ALREADY_CLAIMED',
  /** The event is bound to a different device than the check requires (sec. 8.6). */
  EVENT_DEVICE_MISMATCH: 'EVENT_DEVICE_MISMATCH',
  /** Not an on_demand record (sec. 8.7). */
  EVENT_TYPE_NOT_ELIGIBLE: 'EVENT_TYPE_NOT_ELIGIBLE',
  /** Event start falls outside the attempt's eligible window (sec. 8.4). */
  EVENT_OUTSIDE_WINDOW: 'EVENT_OUTSIDE_WINDOW',
  /** Quarantined by the media-side-effect rule (sec. 8.9). */
  EVENT_AMBIGUOUS: 'EVENT_AMBIGUOUS',
  /** An override needs an approver and a mandatory reason (sec. 13). */
  OVERRIDE_REASON_REQUIRED: 'OVERRIDE_REASON_REQUIRED',
  /** Resolution requires a human approver (sec. 13/14). */
  RESOLUTION_APPROVER_REQUIRED: 'RESOLUTION_APPROVER_REQUIRED',
  /** Illegal incident lifecycle transition (sec. 13). */
  INVALID_INCIDENT_TRANSITION: 'INVALID_INCIDENT_TRANSITION',
  /** The run is terminal (READY or CANCELLED). */
  RUN_TERMINAL: 'RUN_TERMINAL',
  /** Approval attempted while the run is not READY_TO_APPROVE. */
  RUN_NOT_APPROVABLE: 'RUN_NOT_APPROVABLE',
  /** A supplied Ring token is already past its exp claim. */
  RING_TOKEN_EXPIRED: 'RING_TOKEN_EXPIRED',
  NOT_FOUND: 'NOT_FOUND',
} as const;
