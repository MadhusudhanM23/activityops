import type { AuditEntry, Meta, RingStatus, Run, RunSummary, SyncSummary, Template } from './types.js';

/**
 * Typed client for the ActivityOps API.
 *
 * Nothing here ever stores a Ring token: the connect call sends it once over the
 * same-origin HTTPS connection and the server keeps it in memory. No
 * localStorage, no URL parameters (spec sec. 4, 19, 24).
 */

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
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as
    | { error?: string; message?: string }
    | null;
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

export const api = {
  meta: () => request<Meta>('GET', '/api/meta'),
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
      { token },
    ),
  ringDisconnect: () => request<RingStatus>('POST', '/api/ring/disconnect'),
};
