/** Mirrors the server read models in apps/api/src/http/present.ts. */

export type RunStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'NOT_READY'
  | 'READY_TO_APPROVE'
  | 'READY'
  | 'CANCELLED';

export type IntegrationState = 'HEALTHY' | 'RECONNECT_REQUIRED';

export interface ReadinessReason {
  code: string;
  checkId?: string;
  incidentId?: string;
  message: string;
}

export interface Readiness {
  status: RunStatus;
  integrationState: IntegrationState;
  reasons: ReadinessReason[];
}

export interface Evidence {
  label: string;
  providerEventRef: string;
  sessionStartAt: string;
  sessionEndAt: string | null;
  isSimulated: boolean;
  claimedAt: string;
  limits: string[];
}

export interface Attempt {
  id: string;
  attemptNumber: number;
  status: 'IN_PROGRESS' | 'PASS' | 'FAIL' | 'OVERRIDDEN' | 'CANCELLED';
  statusLabel: string;
  reason: string | null;
  armedAt: string | null;
  eligibleStart: string | null;
  eligibleEnd: string | null;
  windowSeconds: number | null;
  attestedBy: string | null;
  attestedAt: string | null;
  createdAt: string;
  supersedesAttemptId: string | null;
  override: { reason: string; approvedBy: string; approvedAt: string } | null;
  evidence: Evidence | null;
}

export interface Check {
  id: string;
  label: string;
  requirementType: 'RING_REQUIRED' | 'NON_RING';
  required: boolean;
  sessionWindowSeconds: number;
  device: { id: string; label: string; status: string; lastStatusAt: string | null } | null;
  attempts: Attempt[];
  latestAttempt: Attempt | null;
  openIncidentId: string | null;
}

export interface Incident {
  id: string;
  checkId: string;
  checkLabel: string;
  severity: 'BLOCKER' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: string;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  dismissedReason: string | null;
  allowedTransitions: string[];
  actions: { action: string; reason: string | null; actor: string; createdAt: string }[];
}

export interface Run {
  id: string;
  templateName: string;
  triggerType: string;
  dataMode: 'LIVE' | 'RECORDED_DEMO';
  dataModeLabel: string;
  captureDate: string | null;
  startedAt: string | null;
  approvedAt: string | null;
  approvalActor: string | null;
  cancelledAt: string | null;
  readiness: Readiness;
  checks: Check[];
  incidents: Incident[];
}

export interface RunSummary {
  id: string;
  templateName: string;
  triggerType: string;
  dataMode: 'LIVE' | 'RECORDED_DEMO';
  dataModeLabel: string;
  startedAt: string | null;
  status: RunStatus;
  integrationState: IntegrationState;
}

export interface Template {
  id: string;
  name: string;
  triggerType: string;
  checkCount: number;
}

export interface RingStatus {
  connected: boolean;
  expiresAt: string | null;
  connectedAt: string | null;
  secondsRemaining: number | null;
  integrationState: IntegrationState;
}

export interface Meta {
  evidenceLabel: string;
  integrationState: IntegrationState;
  timing: {
    clockSkewAllowanceSeconds: number;
    sessionWindowSeconds: number;
    demoSessionWindowSeconds: number;
    postWindowObservationMarginSeconds: number;
    measured: boolean;
  };
  actor: string;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  metadata: Record<string, unknown> | null;
}

export interface SyncSummary {
  pagesFetched: number;
  eventsSeen: number;
  eligibleEventsStored: number;
  stopReason: string;
  coversWindow: boolean;
  sessionClaimed: boolean;
  deviceStatus: string;
}
