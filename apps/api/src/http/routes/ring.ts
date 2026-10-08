import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { row } from '../../db/query.js';
import { eligibleWindow, latestAttempt } from '../../domain/attempts.js';
import { writeAudit } from '../../domain/audit.js';
import { DomainError, ERR } from '../../domain/errors.js';
import { getIntegrationState, setIntegrationState } from '../../domain/runs.js';
import { autoClaimEvidence, raiseCoverageIncidents } from '../../domain/workflow.js';
import { discoverDevices } from '../../ring/discovery.js';
import { RingError } from '../../ring/errors.js';
import { normalizeDeviceStatus } from '../../ring/normalize.js';
import { recordCoverage, syncDeviceHistory, type SyncOptions } from '../../ring/sync.js';
import { readJwtExpiry } from '../../ring/tokenStore.js';
import { RATE_RULES } from '../../security/rateLimit.js';
import { presentRun } from '../present.js';
import { type AppContext, actor, noteIntegrationFailure, requireLiveRun, tx, withinLimit } from '../context.js';

const checkParams = z.object({ runId: z.string().min(1), checkId: z.string().min(1) });

const connectBody = z.object({
  // Bounded so a pasted payload cannot be used to exhaust memory; JWTs are well under this.
  token: z.string().trim().min(20).max(8192),
  // Spec sec. 16: the data-practices notice is shown before any Ring data is processed.
  noticeAcknowledged: z.literal(true, {
    errorMap: () => ({ message: 'The data-practices notice must be acknowledged before connecting Ring.' }),
  }),
});

export function ringRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, tokenStore, ringClient } = ctx;

  app.get('/api/ring/status', async () => ({
    ...tokenStore.status(ctx.now()),
    integrationState: getIntegrationState(db),
  }));

  /**
   * Accepts a judge's own short-lived Playground token (spec sec. 19).
   * The token goes to memory only and is never echoed, logged or persisted.
   */
  app.post('/api/ring/connect', async (request, reply) => {
    if (!withinLimit(ctx, request, reply, 'ringConnect', RATE_RULES.ringConnect)) return reply;
    const { token } = connectBody.parse(request.body);
    const now = ctx.now();

    const expiresAt = readJwtExpiry(token);
    if (expiresAt && expiresAt.getTime() <= now.getTime()) {
      throw new DomainError(ERR.RING_TOKEN_EXPIRED, 'That token has already expired. Generate a new one in the Playground.');
    }

    writeAudit(db, {
      actor: actor(request),
      action: 'ACKNOWLEDGE_DATA_NOTICE',
      entityType: 'session',
      entityId: actor(request),
      at: now,
    });
    tokenStore.set(token, now, expiresAt);

    try {
      const discovery = await discoverDevices(db, ringClient, now, ctx.settings.timing.demoSessionWindowSeconds);
      setIntegrationState(db, 'HEALTHY', null, now);
      writeAudit(db, {
        actor: actor(request),
        action: 'RING_CONNECT',
        entityType: 'integration',
        entityId: 'ring',
        at: now,
        metadata: { devicesDiscovered: discovery.devices.length },
      });
      return {
        ring: tokenStore.status(now),
        devicesDiscovered: discovery.devices.length,
        templateId: discovery.templateId,
        devices: discovery.devices.map((d) => ({ label: d.label, status: d.status, lastStatusAt: d.lastStatusAt })),
      };
    } catch (error) {
      // A token Ring rejects is not kept.
      if (error instanceof RingError && error.kind === 'RECONNECT_REQUIRED') tokenStore.clear();
      noteIntegrationFailure(ctx, error);
      throw error;
    }
  });

  app.post('/api/ring/disconnect', async (request) => {
    // Resolve the actor before any side effect, so a request that somehow lacks a
    // session fails before it can change anything.
    const who = actor(request);
    tokenStore.clear();
    writeAudit(db, {
      actor: who,
      action: 'RING_DISCONNECT',
      entityType: 'integration',
      entityId: 'ring',
      at: ctx.now(),
    });
    return tokenStore.status(ctx.now());
  });

  /**
   * Ring evidence sync for one armed check (spec sec. 9, 12).
   *
   * Never calls a media endpoint. Any Ring failure raises the RECONNECT_REQUIRED
   * overlay and is rethrown; it never touches attempts, incidents or coverage.
   */
  app.post('/api/runs/:runId/checks/:checkId/sync', async (request, reply) => {
    if (!withinLimit(ctx, request, reply, 'ringSync', RATE_RULES.ringSync)) return reply;
    const { runId, checkId } = checkParams.parse(request.params);
    requireLiveRun(db, runId);

    const check = row<{ requirement_type: string; device_id: string | null; provider_device_id: string | null }>(
      db,
      `SELECT c.requirement_type, c.device_id, d.provider_device_id
         FROM verification_check c LEFT JOIN device d ON d.id = c.device_id WHERE c.id = ?`,
      checkId,
    );
    if (!check) throw new DomainError(ERR.NOT_FOUND, `No check ${checkId}`);
    const { device_id: deviceId, provider_device_id: providerDeviceId } = check;
    if (check.requirement_type !== 'RING_REQUIRED' || !deviceId || !providerDeviceId) {
      throw new DomainError(ERR.EVENT_DEVICE_MISMATCH, 'This check does not use Ring evidence.');
    }

    const attempt = latestAttempt(db, runId, checkId);
    const window = attempt ? eligibleWindow(attempt) : null;
    if (!attempt || attempt.status !== 'IN_PROGRESS' || !window) {
      throw new DomainError(ERR.ATTEMPT_NOT_OPEN, 'Start the Ring check before syncing its history.');
    }

    const now = ctx.now();
    const options: SyncOptions = {
      providerDeviceId,
      deviceId,
      windowStart: window.start,
      windowEnd: window.end,
      pageCap: ctx.settings.timing.historyPageCap,
      observationMarginSeconds: ctx.settings.timing.postWindowObservationMarginSeconds,
      now,
    };

    let statusUpdate: ReturnType<typeof normalizeDeviceStatus>;
    let syncResult: Awaited<ReturnType<typeof syncDeviceHistory>>;
    try {
      const status = await ringClient.get(ringClient.deviceStatusPath(providerDeviceId));
      statusUpdate = normalizeDeviceStatus(status.body);
      syncResult = await syncDeviceHistory(db, ringClient, options);
    } catch (error) {
      noteIntegrationFailure(ctx, error);
      throw error;
    }

    const claimedEventId = tx(db, () => {
      db.prepare('UPDATE device SET status = ?, last_status_at = ? WHERE id = ?').run(
        statusUpdate.status,
        statusUpdate.lastStatusAt ?? now.toISOString(),
        deviceId,
      );
      setIntegrationState(db, 'HEALTHY', null, now);
      const claimed = autoClaimEvidence(db, attempt.id, actor(request), now);
      if (!claimed) recordCoverage(db, attempt.id, options, syncResult);
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
}
