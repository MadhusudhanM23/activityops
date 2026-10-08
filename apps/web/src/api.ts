import type {
  AiAnswer,
  AiNote,
  AuditEntry,
  Meta,
  PrivacyNotice,
  RingStatus,
  Run,
  RunSummary,
  SessionInfo,
  SyncSummary,
  Template,
} from './types.js';

/**
 * Typed client for the ActivityOps API.
 *
 * - The session lives in an httpOnly cookie the page cannot read.
 * - The CSRF token is held in this module's memory only and sent as a header on
 *   every state-changing request. It is re-fetched from /api/session on load.
 * - Nothing here ever stores a Ring token: connect sends it once and the server
 *   keeps it in memory. No localStorage, no URL parameters (spec sec. 4, 19, 24).
 */

let csrfToken: string | null = null;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the failure is the Ring integration, not the operator's action. */
  get isIntegration(): boolean {
    return this.code.startsWith('RING_');
  }

  get needsSignIn(): boolean {
    return this.status === 401 && this.code === 'AUTH_REQUIRED';
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error ?? 'ERROR',
      data?.message ?? `Request failed with status ${response.status}`,
      data,
    );
  }
  return data as T;
}

function remember(session: SessionInfo): SessionInfo {
  csrfToken = session.csrfToken;
  return session;
}

export const api = {
  session: () => request<SessionInfo>('GET', '/api/session').then(remember),
  login: (username: string, password: string) =>
    request<SessionInfo>('POST', '/api/session/login', { username, password }).then(remember),
  logout: async () => {
    await request<unknown>('POST', '/api/session/logout');
    csrfToken = null;
  },

  meta: () => request<Meta>('GET', '/api/meta'),
  privacy: () => request<PrivacyNotice>('GET', '/api/privacy'),
  runs: () => request<RunSummary[]>('GET', '/api/runs'),
  run: (id: string) => request<Run>('GET', `/api/runs/${encodeURIComponent(id)}`),
  audit: (id: string) => request<AuditEntry[]>('GET', `/api/runs/${encodeURIComponent(id)}/audit`),
  templates: () => request<Template[]>('GET', '/api/templates'),
  createRun: (templateId: string) => request<Run>('POST', '/api/runs', { templateId }),

  startCheck: (runId: string, checkId: string) =>
    request<Run>('POST', `/api/runs/${encodeURIComponent(runId)}/checks/${encodeURIComponent(checkId)}/start`),
  syncCheck: (runId: string, checkId: string) =>
    request<{ sync: SyncSummary; run: Run }>(
      'POST',
      `/api/runs/${encodeURIComponent(runId)}/checks/${encodeURIComponent(checkId)}/sync`,
    ),
  decide: (attemptId: string, decision: 'PASS' | 'FAIL', reason?: string) =>
    request<Run>('POST', `/api/attempts/${encodeURIComponent(attemptId)}/decision`, { decision, reason }),
  cancelAttempt: (attemptId: string) =>
    request<Run>('POST', `/api/attempts/${encodeURIComponent(attemptId)}/cancel`),
  override: (runId: string, checkId: string, reason: string) =>
    request<Run>(
      'POST',
      `/api/runs/${encodeURIComponent(runId)}/checks/${encodeURIComponent(checkId)}/override`,
      { reason },
    ),
  approve: (runId: string) => request<Run>('POST', `/api/runs/${encodeURIComponent(runId)}/approve`),
  cancelRun: (runId: string) => request<Run>('POST', `/api/runs/${encodeURIComponent(runId)}/cancel`),
  transitionIncident: (incidentId: string, to: string, reason?: string) =>
    request<unknown>('POST', `/api/incidents/${encodeURIComponent(incidentId)}/transition`, { to, reason }),

  ringStatus: () => request<RingStatus>('GET', '/api/ring/status'),
  ringConnect: (token: string) =>
    request<{ devicesDiscovered: number; templateId: string; devices: { label: string; status: string }[] }>(
      'POST',
      '/api/ring/connect',
      // The notice is acknowledged in the UI before this call is possible.
      { token, noticeAcknowledged: true },
    ),
  ringDisconnect: () => request<RingStatus>('POST', '/api/ring/disconnect'),

  aiNotes: (runId: string) => request<AiNote[]>('GET', `/api/runs/${encodeURIComponent(runId)}/ai`),
  ask: (runId: string, task: 'WHY_NOT_READY' | 'NEXT_ACTIONS' | 'HANDOVER' | 'INCIDENT_SUMMARY', incidentId?: string) =>
    request<AiAnswer>('POST', '/api/ai/ask', { runId, task, incidentId }),

  deleteAll: (confirm: string) =>
    request<{ deleted: boolean; ringDisconnected: boolean; recordedDemoRestored: boolean; deletedAt: string }>(
      'POST',
      '/api/data/delete-all',
      { confirm },
    ),
};
