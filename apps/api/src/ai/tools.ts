import type { DatabaseSync } from 'node:sqlite';
import { presentRun, type CheckView, type RunView } from '../http/present.js';
import { rows } from '../db/query.js';
import { untrusted } from './untrusted.js';
import { nextActions } from './nextActions.js';

/**
 * The AI copilot's tools (spec v7 sec. 17, "Agent tooling").
 *
 * Every tool is READ-ONLY. There is deliberately no tool that can pass a check,
 * resolve an incident, change readiness, delete data or alter Ring evidence, so
 * no prompt - injected or otherwise - can make the agent do any of those things.
 *
 * Tools are also scoped to the single run the request is about. The model can
 * read that run and nothing else (least privilege), and it never receives the
 * Ring token, raw provider payloads, or full provider ids.
 */

export interface ToolContext {
  db: DatabaseSync;
  runId: string;
  now: Date;
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the tool input, in the shape model tool-use APIs expect. */
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

type ToolInput = Record<string, unknown>;

interface Tool extends ToolSpec {
  run: (ctx: ToolContext, input: ToolInput) => unknown;
}

function checkSummary(check: CheckView) {
  const latest = check.latestAttempt;
  return {
    checkId: check.id,
    label: untrusted(check.label),
    requiresRingEvidence: check.requirementType === 'RING_REQUIRED',
    required: check.required,
    latestStatus: latest?.status ?? 'NOT_STARTED',
    attempts: check.attempts.length,
    ringSessionObserved: Boolean(latest?.evidence),
    operatorNote: untrusted(latest?.reason),
    hasOpenIncident: check.openIncidentId !== null,
  };
}

function runFor(ctx: ToolContext): RunView {
  return presentRun(ctx.db, ctx.runId, ctx.now);
}

const EMPTY_INPUT = { type: 'object' as const, properties: {} };

const TOOLS: Tool[] = [
  {
    name: 'getVerificationRun',
    description: 'The run being discussed: checklist name, type, whether it is live or a recorded demo, readiness status and timestamps.',
    inputSchema: EMPTY_INPUT,
    run: (ctx) => {
      const run = runFor(ctx);
      return {
        runId: run.id,
        checklist: untrusted(run.templateName),
        type: run.triggerType,
        dataMode: run.dataModeLabel,
        readiness: run.readiness.status,
        integrationState: run.readiness.integrationState,
        startedAt: run.startedAt,
        approvedAt: run.approvedAt,
        approvedBy: run.approvalActor,
        cancelledAt: run.cancelledAt,
        checkCount: run.checks.length,
        openIncidentCount: run.incidents.filter((i) => !['RESOLVED', 'DISMISSED'].includes(i.status)).length,
      };
    },
  },
  {
    name: 'getReadinessState',
    description: 'The deterministic readiness result and its ordered reasons. This is computed by the system; it is authoritative and must be reported as-is.',
    inputSchema: EMPTY_INPUT,
    run: (ctx) => {
      const run = runFor(ctx);
      return {
        status: run.readiness.status,
        integrationState: run.readiness.integrationState,
        reasons: run.readiness.reasons.map((r) => ({ code: r.code, checkId: r.checkId ?? null, message: untrusted(r.message) })),
      };
    },
  },
  {
    name: 'getBlockingChecks',
    description: 'Required checks that are currently preventing readiness, with the reason for each.',
    inputSchema: EMPTY_INPUT,
    run: (ctx) => {
      const run = runFor(ctx);
      const blocking = new Set(run.readiness.reasons.map((r) => r.checkId).filter(Boolean));
      return run.checks.filter((c) => blocking.has(c.id)).map(checkSummary);
    },
  },
  {
    name: 'getRequiredChecks',
    description: 'Every required check on the run and its latest status.',
    inputSchema: EMPTY_INPUT,
    run: (ctx) => runFor(ctx).checks.filter((c) => c.required).map(checkSummary),
  },
  {
    name: 'getRecentChecks',
    description: 'Every check on the run (required and optional) with its latest status and attempt count.',
    inputSchema: EMPTY_INPUT,
    run: (ctx) => runFor(ctx).checks.map(checkSummary),
  },
  {
    name: 'getVerificationHistory',
    description: 'All attempts for one check, oldest first. Failed attempts are never overwritten by rechecks.',
    inputSchema: {
      type: 'object',
      properties: { checkId: { type: 'string', description: 'A checkId returned by another tool' } },
      required: ['checkId'],
    },
    run: (ctx, input) => {
      const check = runFor(ctx).checks.find((c) => c.id === input['checkId']);
      if (!check) return { error: 'No such check on this run.' };
      return {
        label: untrusted(check.label),
        attempts: check.attempts.map((a) => ({
          attemptNumber: a.attemptNumber,
          status: a.status,
          statusLabel: a.statusLabel,
          operatorNote: untrusted(a.reason),
          attestedBy: a.attestedBy,
          attestedAt: a.attestedAt,
          supersedesPreviousAttempt: a.supersedesAttemptId !== null,
          override: a.override ? { approvedBy: a.override.approvedBy, reason: untrusted(a.override.reason) } : null,
          // Evidence is described with its fixed label and limits, never paraphrased.
          ringEvidence: a.evidence
            ? { label: a.evidence.label, sessionStartAt: a.evidence.sessionStartAt, simulated: a.evidence.isSimulated, doesNotEstablish: a.evidence.limits }
            : null,
        })),
      };
    },
  },
  {
    name: 'getOpenIncidents',
    description: 'Incidents on this run that are not resolved or dismissed.',
    inputSchema: EMPTY_INPUT,
    run: (ctx) =>
      runFor(ctx)
        .incidents.filter((i) => !['RESOLVED', 'DISMISSED'].includes(i.status))
        .map((i) => ({ incidentId: i.id, check: untrusted(i.checkLabel), severity: i.severity, status: i.status, reason: untrusted(i.reason), openedAt: i.createdAt })),
  },
  {
    name: 'getIncident',
    description: 'One incident on this run, with its full lifecycle.',
    inputSchema: {
      type: 'object',
      properties: { incidentId: { type: 'string', description: 'An incidentId returned by another tool' } },
      required: ['incidentId'],
    },
    run: (ctx, input) => {
      const incident = runFor(ctx).incidents.find((i) => i.id === input['incidentId']);
      if (!incident) return { error: 'No such incident on this run.' };
      return {
        check: untrusted(incident.checkLabel),
        severity: incident.severity,
        status: incident.status,
        reason: untrusted(incident.reason),
        resolvedBy: incident.resolvedBy,
        dismissedReason: untrusted(incident.dismissedReason),
        lifecycle: incident.actions.map((a) => ({
          step: a.action,
          at: a.createdAt,
          by: a.actor === 'system' ? 'system (driven by an attempt)' : a.actor,
          note: untrusted(a.reason),
        })),
      };
    },
  },
  {
    name: 'getDeviceStatus',
    description: 'Ring devices used by this run and whether Ring last reported them online. "Online" says nothing about the site itself.',
    inputSchema: EMPTY_INPUT,
    run: (ctx) =>
      rows<{ label: string; status: string; last_status_at: string | null }>(
        ctx.db,
        `SELECT DISTINCT d.label, d.status, d.last_status_at FROM device d
           JOIN verification_check c ON c.device_id = d.id
           JOIN verification_run r ON r.template_id = c.template_id
          WHERE r.id = ?`,
        ctx.runId,
      ).map((d) => ({ device: untrusted(d.label), ringReported: d.status, reportedAt: d.last_status_at })),
  },
  {
    name: 'getNextActions',
    description: 'The configured next operational actions for this run, derived deterministically from readiness. Report these; do not invent others.',
    inputSchema: EMPTY_INPUT,
    run: (ctx) => nextActions(runFor(ctx)).map((a) => ({ ...a, action: untrusted(a.action) })),
  },
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

export const TOOL_SPECS: ToolSpec[] = TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

export type ToolOutcome = { ok: true; result: unknown } | { ok: false; error: string };

/** Runs an allowlisted tool. Anything else - including any write-sounding name - is refused. */
export function runTool(ctx: ToolContext, name: string, input: unknown): ToolOutcome {
  const tool = BY_NAME.get(name);
  if (!tool) return { ok: false, error: `Tool "${name}" is not available. Only read-only tools exist.` };
  const args = input && typeof input === 'object' && !Array.isArray(input) ? (input as ToolInput) : {};
  try {
    return { ok: true, result: tool.run(ctx, args) };
  } catch {
    return { ok: false, error: 'The tool could not read that data.' };
  }
}
