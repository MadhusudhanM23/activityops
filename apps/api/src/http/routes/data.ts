import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { deleteAllData } from '../../db/migrate.js';
import { writeAudit } from '../../domain/audit.js';
import { RATE_RULES } from '../../security/rateLimit.js';
import { seedReviewMode } from '../../seed/reviewMode.js';
import type { AiProvider } from '../../ai/runtime.js';
import { type AppContext, actor, withinLimit } from '../context.js';

export const DELETE_CONFIRMATION = 'DELETE ALL DATA';

const deleteBody = z.object({
  confirm: z.literal(DELETE_CONFIRMATION, { error: `Type ${DELETE_CONFIRMATION} to confirm.` }),
});

/**
 * The data-practices notice (spec v7 sec. 16), generated from this deployment's
 * real configuration so it cannot drift from what the system actually does.
 */
export function privacyNotice(aiEnabled: boolean, provider: AiProvider = 'bedrock') {
  return {
    title: 'How ActivityOps handles Ring data',
    sections: [
      {
        heading: 'What Ring data is collected',
        body: [
          'The devices on the connected Ring account, their names, and whether Ring reports them online.',
          'Event History records for a device while a check is running: the record type, its start and end time, and an opaque record id.',
          'No video, no snapshots, and no audio are requested or stored. The readiness workflow never calls Ring media endpoints.',
        ],
      },
      {
        heading: 'What is stored',
        body: [
          'Normalized facts only: record id, device id, record type, timestamps, whether it was produced in the Playground, and which check attempt it was bound to.',
          'Raw Ring responses are not stored. The Ring access token is held in server memory for the session only - never in the database, logs, the browser, or a URL.',
          'Operator decisions, reasons typed by operators, incidents, and an audit trail of who did what and when.',
        ],
      },
      {
        heading: 'Whether Ring-derived data is sent to Amazon Bedrock',
        body: aiEnabled && provider === 'google'
          ? [
              'No. The AI assistant on this deployment uses Google Gemini, not Amazon Bedrock, and it only drafts notes for the published recorded demo run. Live Ring-derived data is never sent to it.',
              'For the recorded demo run, Gemini receives the minimum stored facts needed through read-only tools - never video, images, or the Ring token. Google may use free-tier inputs to improve its products, which is why live data is excluded.',
              'Raw prompts are not stored. Generated notes you keep are stored and are covered by Delete All Data.',
            ]
          : aiEnabled && provider === 'local'
          ? [
              'No. The AI assistant on this deployment uses a model running on the same machine as ActivityOps (a local model served through an OpenAI-compatible endpoint, such as Ollama). Ring-derived data is not sent to Amazon Bedrock or to any other external AI service.',
              'The local model receives the minimum stored facts needed through read-only tools - never video, images, or the Ring token. It cannot pass a check, resolve an incident, change readiness, or delete data.',
              'Raw prompts are not stored. Generated notes you keep are stored and are covered by Delete All Data.',
            ]
          : aiEnabled
          ? [
              'Yes, when you ask the AI assistant for a handover note or an explanation. It receives the minimum stored facts needed through read-only tools - never video, images, or the Ring token.',
              'The AI explains recorded state. It cannot pass a check, resolve an incident, change readiness, or delete data.',
              'Raw prompts are not stored. Generated notes you keep are stored and are covered by Delete All Data.',
            ]
          : ['The AI assistant is not enabled on this deployment, so no Ring-derived data is sent to Amazon Bedrock.'],
      },
      {
        heading: 'Training',
        body: ['ActivityOps does not use Ring-derived data to train any model.'],
      },
      {
        heading: 'Retention and deletion',
        body: [
          'Data is kept until it is deleted. Delete All Data removes every run, check attempt, Ring-derived fact, incident, AI-generated note and audit entry, ends the Ring connection, and keeps only a single record that a deletion took place, by whom, and when.',
          'This hosted demo then restores its published recorded demo run, which contains no data of yours.',
        ],
      },
      {
        heading: 'Workplace monitoring',
        body: [
          'Live view involves cameras that may capture employees or members of the public. Before using ActivityOps at a real site, give the notice and obtain any consent that local law or your workplace policies require.',
          'ActivityOps records that a live-view session took place, not who appears in it or what was seen.',
        ],
      },
      {
        heading: 'Safety boundary',
        body: [
          'ActivityOps is an operations workflow tool. It is not a life-safety, emergency, medical, law-enforcement, or security-guarantee system.',
        ],
      },
    ],
  };
}

export function dataRoutes(app: FastifyInstance, ctx: AppContext, aiEnabled: boolean, provider: AiProvider = 'bedrock'): void {
  app.get('/api/privacy', async () => privacyNotice(aiEnabled, provider));

  /**
   * Delete All Data (spec sec. 16). Ends the Ring connection, drops every table,
   * rebuilds them empty, records the minimum deletion audit, then restores the
   * published recorded demo so Review Mode keeps working for other visitors.
   */
  app.post('/api/data/delete-all', async (request, reply) => {
    if (!withinLimit(ctx, request, reply, 'deleteAll', RATE_RULES.deleteAll)) return reply;
    deleteBody.parse(request.body);
    const who = actor(request);
    const now = ctx.now();

    ctx.tokenStore.clear();
    deleteAllData(ctx.db);
    writeAudit(ctx.db, {
      actor: who,
      action: 'DELETE',
      entityType: 'data',
      entityId: 'all',
      at: now,
      metadata: { scope: 'all-runs-evidence-incidents-ai-notes-audit', ringDisconnected: true },
    });
    const restored = seedReviewMode(
      ctx.db,
      ctx.settings.timing.demoSessionWindowSeconds,
      ctx.settings.timing.clockSkewAllowanceSeconds,
    );

    return { deleted: true, ringDisconnected: true, recordedDemoRestored: restored, deletedAt: now.toISOString() };
  });
}
