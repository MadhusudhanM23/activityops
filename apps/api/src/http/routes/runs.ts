import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { row, rows } from '../../db/query.js';
import { getAttempt, recordOverride } from '../../domain/attempts.js';
import { DomainError, ERR } from '../../domain/errors.js';
import { transitionIncident } from '../../domain/incidents.js';
import { approveRun, cancelRun, getIntegrationState, readiness } from '../../domain/runs.js';
import { cancelCheckAttempt, recordDecision, startCheck } from '../../domain/workflow.js';
import { REVIEW_TEMPLATE_ID } from '../../seed/reviewMode.js';
import { EVIDENCE_LABEL, listAudit, listRuns, presentIncidents, presentRun } from '../present.js';
import { type AppContext, actor, requireLiveRun, requireReadable, tx } from '../context.js';

const runParam = z.object({ runId: z.string().min(1) });
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

export function runRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db } = ctx;

  // ---- read models -------------------------------------------------------

  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'activityops-api',
    integrationState: getIntegrationState(db),
  }));

  app.get('/api/meta', async (request) => ({
    evidenceLabel: EVIDENCE_LABEL,
    integrationState: getIntegrationState(db),
    timing: {
      ...ctx.settings.timing,
      // Day-1 T5 could not be run (device offline), so these are not measured values.
      measured: false,
    },
    user: request.session?.user ?? null,
  }));

  // The recorded template backs Review Mode only and is never offered for live runs.
  app.get('/api/templates', async () =>
    rows(
      db,
      `SELECT t.id, t.name, t.trigger_type AS triggerType, COUNT(c.id) AS checkCount
         FROM verification_template t LEFT JOIN verification_check c ON c.template_id = t.id
        WHERE t.enabled = 1 AND t.id <> ? GROUP BY t.id ORDER BY t.name`,
      REVIEW_TEMPLATE_ID,
    ),
  );

  app.get('/api/devices', async () =>
    rows(db, 'SELECT id, label, status, last_status_at AS lastStatusAt FROM device ORDER BY label'),
  );

  /** Anonymous visitors see Review Mode only; live runs need a session. */
  app.get('/api/runs', async (request) => {
    const all = listRuns(db, ctx.now());
    return request.session ? all : all.filter((run) => run.dataMode === 'RECORDED_DEMO');
  });

  app.get('/api/runs/:runId', async (request) => {
    const { runId } = runParam.parse(request.params);
    requireReadable(db, request, runId);
    return presentRun(db, runId, ctx.now());
  });

  app.get('/api/runs/:runId/audit', async (request) => {
    const { runId } = runParam.parse(request.params);
    requireReadable(db, request, runId);
    return listAudit(db, runId);
  });

  app.get('/api/runs/:runId/readiness', async (request) => {
    const { runId } = runParam.parse(request.params);
    requireReadable(db, request, runId);
    return readiness(db, runId, ctx.now());
  });

  app.get('/api/incidents', async (request) => {
    const openOnly = (request.query as Record<string, string>)['open'] === 'true';
    return presentIncidents(db, { openOnly });
  });

  // ---- run lifecycle -----------------------------------------------------

  app.post('/api/runs', async (request, reply) => {
    const { templateId } = createRunBody.parse(request.body);
    const template =
      templateId === REVIEW_TEMPLATE_ID
        ? undefined
        : row<{ id: string }>(db, 'SELECT id FROM verification_template WHERE id = ? AND enabled = 1', templateId);
    if (!template) throw new DomainError(ERR.NOT_FOUND, `No template ${templateId}`);
    const id = randomUUID();
    db.prepare('INSERT INTO verification_run (id, template_id, operator_id) VALUES (?, ?, ?)').run(
      id,
      templateId,
      actor(request),
    );
    reply.status(201);
    return presentRun(db, id, ctx.now());
  });

  app.post('/api/runs/:runId/approve', async (request) => {
    const { runId } = runParam.parse(request.params);
    requireLiveRun(db, runId);
    tx(db, () => approveRun(db, runId, actor(request), ctx.now()));
    return presentRun(db, runId, ctx.now());
  });

  app.post('/api/runs/:runId/cancel', async (request) => {
    const { runId } = runParam.parse(request.params);
    requireLiveRun(db, runId);
    tx(db, () => cancelRun(db, runId, actor(request), ctx.now()));
    return presentRun(db, runId, ctx.now());
  });

  // ---- check workflow ----------------------------------------------------

  app.post('/api/runs/:runId/checks/:checkId/start', async (request) => {
    const { runId, checkId } = checkParams.parse(request.params);
    requireLiveRun(db, runId);
    tx(db, () =>
      startCheck(db, {
        runId,
        checkId,
        actor: actor(request),
        now: ctx.now(),
        skewSeconds: ctx.settings.timing.clockSkewAllowanceSeconds,
      }),
    );
    return presentRun(db, runId, ctx.now());
  });

  app.post('/api/attempts/:attemptId/decision', async (request) => {
    const { attemptId } = attemptParam.parse(request.params);
    const body = decisionBody.parse(request.body);
    const attempt = getAttempt(db, attemptId);
    requireLiveRun(db, attempt.run_id);
    tx(db, () =>
      recordDecision(db, {
        attemptId,
        decision: body.decision,
        reason: body.reason,
        actor: actor(request),
        now: ctx.now(),
      }),
    );
    return presentRun(db, attempt.run_id, ctx.now());
  });

  app.post('/api/attempts/:attemptId/cancel', async (request) => {
    const { attemptId } = attemptParam.parse(request.params);
    const attempt = getAttempt(db, attemptId);
    requireLiveRun(db, attempt.run_id);
    tx(db, () => cancelCheckAttempt(db, attemptId, actor(request), ctx.now()));
    return presentRun(db, attempt.run_id, ctx.now());
  });

  app.post('/api/runs/:runId/checks/:checkId/override', async (request) => {
    const { runId, checkId } = checkParams.parse(request.params);
    const { reason } = reasonBody.parse(request.body);
    requireLiveRun(db, runId);
    tx(db, () => recordOverride(db, { runId, checkId, approver: actor(request), reason, now: ctx.now() }));
    return presentRun(db, runId, ctx.now());
  });

  // ---- incidents ---------------------------------------------------------

  app.post('/api/incidents/:incidentId/transition', async (request) => {
    const { incidentId } = incidentParam.parse(request.params);
    const body = transitionBody.parse(request.body);
    const owner = row<{ run_id: string | null }>(db, 'SELECT run_id FROM incident WHERE id = ?', incidentId);
    if (!owner) throw new DomainError(ERR.NOT_FOUND, `No incident ${incidentId}`);
    // The recorded demo run is immutable in full, incidents included (D-031).
    if (owner.run_id) requireLiveRun(db, owner.run_id);
    return tx(db, () =>
      transitionIncident(db, {
        incidentId,
        to: body.to,
        reason: body.reason,
        actor: actor(request),
        now: ctx.now(),
      }),
    );
  });
}
