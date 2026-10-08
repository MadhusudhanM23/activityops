import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rows } from '../../db/query.js';
import { runAgent, type ModelClient } from '../../ai/agent.js';
import { nextActions } from '../../ai/nextActions.js';
import { RATE_RULES } from '../../security/rateLimit.js';
import { presentRun } from '../present.js';
import { type AppContext, actor, requireReadable, withinLimit } from '../context.js';

/**
 * The operations copilot (spec v7 sec. 17).
 *
 * Four supported requests, chosen from a fixed list - there is no free-text
 * prompt. Two are deterministic by specification and never touch a model:
 *   WHY_NOT_READY - the readiness explanation, exactly as computed;
 *   NEXT_ACTIONS  - configured actions mapped from readiness.
 * Two need a model, and say so honestly when none is configured:
 *   HANDOVER, INCIDENT_SUMMARY.
 */

const askBody = z.object({
  runId: z.string().min(1),
  task: z.enum(['WHY_NOT_READY', 'NEXT_ACTIONS', 'HANDOVER', 'INCIDENT_SUMMARY']),
  incidentId: z.string().min(1).optional(),
});

const runParam = z.object({ runId: z.string().min(1) });

export function aiRoutes(app: FastifyInstance, ctx: AppContext, model: ModelClient | null): void {
  const { db } = ctx;

  app.post('/api/ai/ask', async (request, reply) => {
    if (!withinLimit(ctx, request, reply, 'ai', RATE_RULES.ai)) return reply;
    const body = askBody.parse(request.body);
    const who = actor(request);
    requireReadable(db, request, body.runId);
    const run = presentRun(db, body.runId, ctx.now());

    if (body.task === 'WHY_NOT_READY') {
      return {
        source: 'DETERMINISTIC',
        status: run.readiness.status,
        lines: run.readiness.reasons.map((r) => r.message),
        trace: [],
      };
    }
    if (body.task === 'NEXT_ACTIONS') {
      return { source: 'DETERMINISTIC', status: run.readiness.status, lines: nextActions(run).map((a) => a.action), trace: [] };
    }

    if (!model) {
      return reply.status(503).send({
        error: 'AI_NOT_CONFIGURED',
        message:
          'The AI assistant is not enabled on this deployment, so handover notes and incident summaries are unavailable. "Why are we not ready?" and "What should I do next?" still work - they are computed without AI.',
      });
    }

    if (body.task === 'INCIDENT_SUMMARY') {
      const incident = run.incidents.find((i) => i.id === body.incidentId);
      if (!incident) return reply.status(404).send({ error: 'NOT_FOUND', message: 'No such incident on this run.' });
    }

    const result = await runAgent(model, { db, runId: body.runId, now: ctx.now() }, body.task, {
      incidentId: body.incidentId,
      now: ctx.now,
    });

    // Only a completed note is kept (spec sec. 16: generated notes may be retained
    // as operational records; raw prompts never are). It is covered by Delete All Data.
    let savedId: string | null = null;
    if (result.status === 'COMPLETED') {
      savedId = randomUUID();
      db.prepare(
        'INSERT INTO ai_interaction (id, run_id, type, tool_trace_summary, response, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(
        savedId,
        body.runId,
        body.task,
        JSON.stringify({ modelId: result.modelId, requestedBy: who, trace: result.trace }),
        result.text,
        ctx.now().toISOString(),
      );
    }

    return { source: 'AI', savedId, ...result };
  });

  /** Saved AI notes for a run. Readable anonymously for the recorded demo, like the run itself. */
  app.get('/api/runs/:runId/ai', async (request) => {
    const { runId } = runParam.parse(request.params);
    requireReadable(db, request, runId);
    return rows<{ id: string; type: string; tool_trace_summary: string | null; response: string; created_at: string }>(
      db,
      'SELECT id, type, tool_trace_summary, response, created_at FROM ai_interaction WHERE run_id = ? ORDER BY created_at DESC',
      runId,
    ).map((note) => ({
      id: note.id,
      type: note.type,
      text: note.response,
      createdAt: note.created_at,
      ...(note.tool_trace_summary ? (JSON.parse(note.tool_trace_summary) as object) : {}),
    }));
  });
}
