import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { row } from './db/query.js';
import { openDatabase } from './db.js';
import { getAttempt, latestAttempt, recordOverride, eligibleWindow } from './domain/attempts.js';
import { DomainError, ERR } from './domain/errors.js';
import { transitionIncident } from './domain/incidents.js';
import { approveRun, cancelRun, getIntegrationState, readiness, setIntegrationState } from './domain/runs.js';
import {
  autoClaimEvidence,
  cancelCheckAttempt,
  raiseCoverageIncidents,
  recordDecision,
  startCheck,
} from './domain/workflow.js';
import { errorHandler } from './http/errors.js';
import { EVIDENCE_LABEL, listAudit, listRuns, presentIncidents, presentRun } from './http/present.js';
import { RingClient } from './ring/client.js';
import { discoverDevices } from './ring/discovery.js';
import { RingError } from './ring/errors.js';
import { normalizeDeviceStatus } from './ring/normalize.js';
import { recordCoverage, syncDeviceHistory } from './ring/sync.js';
import { RingTokenStore, readJwtExpiry } from './ring/tokenStore.js';

export interface AppDeps {
  db: DatabaseSync;
  tokenStore: RingTokenStore;
  ringClient: RingClient;
  now: () => Date;
  /**
   * Who is acting. Phase 6 replaces this with the authenticated session user;
   * until then a single demo identity is used, which is why the UI never claims
   * two-person control (spec sec. 14).
   */
  actorOf: (request: FastifyRequest) => string;
}

function defaultDeps(overrides: Partial<AppDeps>): AppDeps {
  const db = overrides.db ?? openDatabase(config.NODE_ENV === 'test' ? ':memory:' : config.DATABASE_PATH);
  migrate(db);
  const tokenStore = overrides.tokenStore ?? new RingTokenStore();
  return {
    db,
    tokenStore,
    ringClient:
      overrides.ringClient ??
      new RingClient({ baseUrl: config.RING_API_BASE_URL ?? 'https://api.amazonvision.com', tokenProvider: tokenStore }),
    now: overrides.now ?? (() => new Date()),
    actorOf: overrides.actorOf ?? (() => config.DEMO_ACTOR),
  };
}

const idParam = z.object({ runId: z.string().min(1) });
const checkParams = z.object({ runId: z.string().min(1), checkId: z.string().min(1) });
const attemptParam = z.object({ attemptId: z.string().min(1) });
const incidentParam = z.object({ incidentId: z.string().min(1) });

const decisionBody = z.object({
  decision: z.enum(['PASS', 'FAIL']),
  reason: z.string().max(1000).optional(),
});
const reasonBody = z.object({ reason: z.string().trim().min(1).max(1000) });
const transitionBody = z.object({
  to: z.enum(['ACKNOWLEDGED', 'ACTION_REQUIRED', 'RECHECKING', 'READY_TO_RESOLVE', 'RESOLVED', 'DISMISSED']),
  reason: z.string().max(1000).optional(),
});
const createRunBody = z.object({ templateId: z.string().min(1) });
// Bounded so a pasted payload cannot be used to exhaust memory; JWTs are well under this.
const connectBody = z.object({ token: z.string().trim().min(20).max(8192) });

export function buildApp(overrides: Partial<AppDeps> = {}): FastifyInstance {
  const deps = defaultDeps(overrides);
  const { db, tokenStore, ringClient } = deps;

  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'silent' : 'info',
      // Request bodies are never logged: the connect route carries a Ring token.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
  });
  app.setErrorHandler(errorHandler);

  /** Wraps a write in a transaction so a failed step leaves no partial state. */
  function tx<T>(work: () => T): T {
    db.exec('BEGIN');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function noteIntegrationFailure(error: unknown): void {
    if (error instanceof RingError && error.setsReconnectOverlay) {
      // The detail is the error kind only - never a payload, never a token.
      setIntegrationState(db, 'RECONNECT_REQUIRED', error.kind, deps.now());
    }
  }

  function requireLiveRun(runId: string): void {
    const run = row<{ data_mode: string }>(db, 'SELECT data_mode FROM verification_run WHERE id = ?', runId);
    if (!run) throw new DomainError(ERR.NOT_FOUND, `No run ${runId}`);
    if (run.data_mode !== 'LIVE') {
      throw new DomainError(
        ERR.RUN_TERMINAL,
        'This is a recorded demo run. It is not connected to live Ring data and cannot be synced or changed.',
      );
    }
  }

  // ---- read models -------------------------------------------------------

  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'activityops-api',
    integrationState: getIntegrationState(db),
  }));

  app.get('/api/meta', async () => ({
    evidenceLabel: EVIDENCE_LABEL,
    integrationState: getIntegrationState(db),
    ring: tokenStore.status(deps.now()),
    timing: {
      clockSkewAllowanceSeconds: config.CLOCK_SKEW_ALLOWANCE_SECONDS,
      sessionWindowSeconds: config.SESSION_WINDOW_SECONDS,
      demoSessionWindowSeconds: config.DEMO_SESSION_WINDOW_SECONDS,
      postWindowObservationMarginSeconds: config.POST_WINDOW_OBSERVATION_MARGIN_SECONDS,
      // Day-1 T5 could not be run (device offline), so these are not measured values.
      measured: false,
    },
    actor: deps.actorOf({} as FastifyRequest),
  }));

  app.get('/api/templates', async () =>
    db
      .prepare(
        `SELECT t.id, t.name, t.trigger_type AS triggerType, COUNT(c.id) AS checkCount
           FROM verification_template t LEFT JOIN verification_check c ON c.template_id = t.id
          WHERE t.enabled = 1 GROUP BY t.id ORDER BY t.name`,
      )
      .all(),
  );

  app.get('/api/devices', async () =>
    db
      .prepare(
        'SELECT id, label, status, last_status_at AS lastStatusAt FROM device ORDER BY label',
      )
      .all(),
  );

  app.get('/api/runs', async () => listRuns(db, deps.now()));

  app.get('/api/runs/:runId', async (request) => {
    const { runId } = idParam.parse(request.params);
    return presentRun(db, runId, deps.now());
  });

  app.get('/api/runs/:runId/audit', async (request) => {
    const { runId } = idParam.parse(request.params);
    return listAudit(db, runId);
  });

  app.get('/api/incidents', async (request) => {
    const openOnly = (request.query as Record<string, string>)['open'] === 'true';
    return presentIncidents(db, { openOnly });
  });

  // ---- run lifecycle -----------------------------------------------------

  app.post('/api/runs', async (request, reply) => {
    const { templateId } = createRunBody.parse(request.body);
    const template = row<{ id: string }>(db, 'SELECT id FROM verification_template WHERE id = ? AND enabled = 1', templateId);
    if (!template) throw new DomainError(ERR.NOT_FOUND, `No template ${templateId}`);
    const id = randomUUID();
    db.prepare('INSERT INTO verification_run (id, template_id, operator_id) VALUES (?, ?, ?)').run(
      id,
      templateId,
      deps.actorOf(request),
    );
    reply.status(201);
    return presentRun(db, id, deps.now());
  });

  app.post('/api/runs/:runId/approve', async (request) => {
    const { runId } = idParam.parse(request.params);
    requireLiveRun(runId);
    tx(() => approveRun(db, runId, deps.actorOf(request), deps.now()));
    return presentRun(db, runId, deps.now());
  });

  app.post('/api/runs/:runId/cancel', async (request) => {
    const { runId } = idParam.parse(request.params);
    requireLiveRun(runId);
    tx(() => cancelRun(db, runId, deps.actorOf(request), deps.now()));
    return presentRun(db, runId, deps.now());
  });

  // ---- check workflow ----------------------------------------------------

  app.post('/api/runs/:runId/checks/:checkId/start', async (request) => {
    const { runId, checkId } = checkParams.parse(request.params);
    requireLiveRun(runId);
    tx(() =>
      startCheck(db, {
        runId,
        checkId,
        actor: deps.actorOf(request),
        now: deps.now(),
        skewSeconds: config.CLOCK_SKEW_ALLOWANCE_SECONDS,
      }),
    );
    return presentRun(db, runId, deps.now());
  });

  app.post('/api/attempts/:attemptId/decision', async (request) => {
    const { attemptId } = attemptParam.parse(request.params);
    const body = decisionBody.parse(request.body);
    const attempt = getAttempt(db, attemptId);
    requireLiveRun(attempt.run_id);
    tx(() =>
      recordDecision(db, {
        attemptId,
        decision: body.decision,
        reason: body.reason,
        actor: deps.actorOf(request),
        now: deps.now(),
      }),
    );
    return presentRun(db, attempt.run_id, deps.now());
  });

  app.post('/api/attempts/:attemptId/cancel', async (request) => {
    const { attemptId } = attemptParam.parse(request.params);
    const attempt = getAttempt(db, attemptId);
    requireLiveRun(attempt.run_id);
    tx(() => cancelCheckAttempt(db, attemptId, deps.actorOf(request), deps.now()));
    return presentRun(db, attempt.run_id, deps.now());
  });

  app.post('/api/runs/:runId/checks/:checkId/override', async (request) => {
    const { runId, checkId } = checkParams.parse(request.params);
    const { reason } = reasonBody.parse(request.body);
    requireLiveRun(runId);
    tx(() =>
      recordOverride(db, { runId, checkId, approver: deps.actorOf(request), reason, now: deps.now() }),
    );
    return presentRun(db, runId, deps.now());
  });

  /**
   * Ring evidence sync for one armed check (spec sec. 9, 12).
   *
   * Never calls a media endpoint. Any Ring failure raises the RECONNECT_REQUIRED
   * overlay and is rethrown; it never touches attempts, incidents or coverage.
   */
  app.post('/api/runs/:runId/checks/:checkId/sync', async (request) => {
    const { runId, checkId } = checkParams.parse(request.params);
    requireLiveRun(runId);

    const check = row<{ requirement_type: string; device_id: string | null; provider_device_id: string | null }>(
      db,
      `SELECT c.requirement_type, c.device_id, d.provider_device_id
         FROM verification_check c LEFT JOIN device d ON d.id = c.device_id WHERE c.id = ?`,
      checkId,
    );
    if (!check) throw new DomainError(ERR.NOT_FOUND, `No check ${checkId}`);
    if (check.requirement_type !== 'RING_REQUIRED' || !check.device_id || !check.provider_device_id) {
      throw new DomainError(ERR.EVENT_DEVICE_MISMATCH, 'This check does not use Ring evidence.');
    }

    const attempt = latestAttempt(db, runId, checkId);
    const window = attempt ? eligibleWindow(attempt) : null;
    if (!attempt || attempt.status !== 'IN_PROGRESS' || !window) {
      throw new DomainError(ERR.ATTEMPT_NOT_OPEN, 'Start the Ring check before syncing its history.');
    }

    const now = deps.now();
    let statusUpdate;
    let syncResult;
    try {
      const status = await ringClient.get(ringClient.deviceStatusPath(check.provider_device_id));
      statusUpdate = normalizeDeviceStatus(status.body);
      syncResult = await syncDeviceHistory(db, ringClient, {
        providerDeviceId: check.provider_device_id,
        deviceId: check.device_id,
        windowStart: window.start,
        windowEnd: window.end,
        pageCap: config.HISTORY_PAGE_CAP,
        observationMarginSeconds: config.POST_WINDOW_OBSERVATION_MARGIN_SECONDS,
        now,
      });
    } catch (error) {
      noteIntegrationFailure(error);
      throw error;
    }

    const claimedEventId = tx(() => {
      db.prepare('UPDATE device SET status = ?, last_status_at = ? WHERE id = ?').run(
        statusUpdate.status,
        statusUpdate.lastStatusAt ?? now.toISOString(),
        check.device_id,
      );
      setIntegrationState(db, 'HEALTHY', null, now);
      const claimed = autoClaimEvidence(db, attempt.id, deps.actorOf(request), now);
      if (!claimed) {
        recordCoverage(db, attempt.id, {
          providerDeviceId: check.provider_device_id!,
          deviceId: check.device_id!,
          windowStart: window.start,
          windowEnd: window.end,
          pageCap: config.HISTORY_PAGE_CAP,
          observationMarginSeconds: config.POST_WINDOW_OBSERVATION_MARGIN_SECONDS,
          now,
        }, syncResult);
      }
      raiseCoverageIncidents(db, runId, now);
      return claimed;
    });

    return {
      sync: {
        pagesFetched: syncResult.pagesFetched,
        eventsSeen: syncResult.eventsSeen,
        eligibleEventsStored: syncResult.eligibleEventsStored,
        stopReason: syncResult.stopReason,
        coversWindow: syncResult.coversWindow,
        sessionClaimed: claimedEventId !== null,
        deviceStatus: statusUpdate.status,
      },
      run: presentRun(db, runId, now),
    };
  });

  // ---- incidents ---------------------------------------------------------

  app.post('/api/incidents/:incidentId/transition', async (request) => {
    const { incidentId } = incidentParam.parse(request.params);
    const body = transitionBody.parse(request.body);
    const owner = row<{ run_id: string | null }>(db, 'SELECT run_id FROM incident WHERE id = ?', incidentId);
    if (!owner) throw new DomainError(ERR.NOT_FOUND, `No incident ${incidentId}`);
    // The recorded demo run is immutable in full, incidents included - not just in the UI.
    if (owner.run_id) requireLiveRun(owner.run_id);
    const incident = tx(() =>
      transitionIncident(db, {
        incidentId,
        to: body.to,
        reason: body.reason,
        actor: deps.actorOf(request),
        now: deps.now(),
      }),
    );
    return incident;
  });

  // ---- Live Test Mode: Ring connection -----------------------------------

  app.get('/api/ring/status', async () => ({
    ...tokenStore.status(deps.now()),
    integrationState: getIntegrationState(db),
  }));

  /**
   * Accepts a judge's own short-lived Playground token (spec sec. 19).
   * The token goes to memory only and is never echoed, logged or persisted.
   */
  app.post('/api/ring/connect', async (request) => {
    const { token } = connectBody.parse(request.body);
    const now = deps.now();
    const expiresAt = readJwtExpiry(token);
    if (expiresAt && expiresAt.getTime() <= now.getTime()) {
      throw new DomainError(ERR.RING_TOKEN_EXPIRED, 'That token has already expired. Generate a new one in the Playground.');
    }
    tokenStore.set(token, now, expiresAt);

    try {
      const discovery = await discoverDevices(db, ringClient, now, config.DEMO_SESSION_WINDOW_SECONDS);
      setIntegrationState(db, 'HEALTHY', null, now);
      return {
        ring: tokenStore.status(now),
        devicesDiscovered: discovery.devices.length,
        templateId: discovery.templateId,
        devices: discovery.devices.map((d) => ({ label: d.label, status: d.status, lastStatusAt: d.lastStatusAt })),
      };
    } catch (error) {
      // A token Ring rejects is not kept.
      if (error instanceof RingError && error.kind === 'RECONNECT_REQUIRED') tokenStore.clear();
      noteIntegrationFailure(error);
      throw error;
    }
  });

  app.post('/api/ring/disconnect', async () => {
    tokenStore.clear();
    return tokenStore.status(deps.now());
  });

  app.get('/api/runs/:runId/readiness', async (request) => {
    const { runId } = idParam.parse(request.params);
    return readiness(db, runId, deps.now());
  });

  app.addHook('onClose', async () => {
    if (!overrides.db) db.close();
  });

  return app;
}
