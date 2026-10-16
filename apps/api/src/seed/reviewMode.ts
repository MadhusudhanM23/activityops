import type { DatabaseSync } from 'node:sqlite';
import { recordOverride } from '../domain/attempts.js';
import { transitionIncident, openIncidentForCheck } from '../domain/incidents.js';
import { approveRun, setIntegrationState } from '../domain/runs.js';
import { autoClaimEvidence, recordDecision, startCheck } from '../domain/workflow.js';
import { row } from '../db/query.js';
import { RECORDED_AI_NOTE } from './recordedAiNote.js';

/**
 * Judge Review Mode seed (spec v7 sec. 19).
 *
 * A complete recorded run a judge can inspect without a Ring token. Two rules
 * keep it honest:
 *
 * 1. It is built through the real workflow functions, so it passes the same
 *    immutability triggers, evidence gate and incident lifecycle as live data.
 *    Nothing here is hand-inserted state that the product could not produce.
 *
 * 2. The Ring evidence is the ONE on_demand record actually captured from the
 *    Ring Playground on 2026-10-07 (Day-1 T3), with its provider id replaced by a
 *    synthetic alias. Only one real session exists, so the fail -> recheck story
 *    runs on a non-Ring check rather than inventing a second Ring session.
 *
 * The run is stored with data_mode RECORDED_DEMO and is rendered under the
 * banner "RECORDED DEMO - Ring Playground capture: 2026-10-07". It must never be
 * described as live current Ring data.
 */

export const REVIEW_RUN_ID = 'run-recorded-demo-2026-10-07';
export const CAPTURE_DATE = '2026-10-07';
export const RECORDED_AI_NOTE_ID = 'ai-recorded-demo-handover';

const SITE = 'site-recorded-demo';
const DEVICE = 'device-recorded-demo';
/** Backs the recorded run only. Never offered for, or accepted by, new live runs. */
export const REVIEW_TEMPLATE_ID = 'template-recorded-opening';
const TEMPLATE = REVIEW_TEMPLATE_ID;
const CHECK_RING = 'check-recorded-entrance';
const CHECK_ALARM = 'check-recorded-alarm';
const CHECK_FLOAT = 'check-recorded-float';
const CHECK_NOTES = 'check-recorded-notes';
const EVENT = 'ring-event-recorded-capture';

/** Timestamps from the real capture: on_demand start/end in epoch milliseconds. */
const CAPTURED_START_MS = 1791372135600; // 2026-10-07T11:22:15.600Z
const CAPTURED_END_MS = 1791372885600; // 2026-10-07T11:34:45.600Z

const OPERATOR = 'demo.operator';
const t = (hhmmss: string) => new Date(`${CAPTURE_DATE}T${hhmmss}.000Z`);

export function seedReviewMode(db: DatabaseSync, demoWindowSeconds = 300, skewSeconds = 30): boolean {
  if (row(db, 'SELECT id FROM verification_run WHERE id = ?', REVIEW_RUN_ID)) return false;

  db.exec('BEGIN');
  try {
    db.prepare("INSERT INTO site (id, name, timezone) VALUES (?, 'Riverside Market (recorded demo)', 'UTC')").run(SITE);

    // The real Playground device, under a synthetic provider id.
    db.prepare(
      `INSERT INTO device (id, site_id, provider_device_id, label, required_for_open, status, last_status_at)
       VALUES (?, ?, 'recorded-demo-provider-device-0001', 'Playground Device (front entrance)', 1, 'AVAILABLE', ?)`,
    ).run(DEVICE, SITE, t('11:21:00').toISOString());

    db.prepare(
      "INSERT INTO verification_template (id, site_id, name, trigger_type) VALUES (?, ?, 'Opening readiness', 'OPENING')",
    ).run(TEMPLATE, SITE);

    const check = db.prepare(
      `INSERT INTO verification_check
         (id, template_id, device_id, label, requirement_type, required, session_window_seconds, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    check.run(CHECK_RING, TEMPLATE, DEVICE, 'Front entrance live-view walkthrough', 'RING_REQUIRED', 1, demoWindowSeconds, 1);
    check.run(CHECK_ALARM, TEMPLATE, null, 'Alarm panel disarmed and zones reviewed', 'NON_RING', 1, demoWindowSeconds, 2);
    check.run(CHECK_FLOAT, TEMPLATE, null, 'Cash counter float counted', 'NON_RING', 1, demoWindowSeconds, 3);
    check.run(CHECK_NOTES, TEMPLATE, null, 'Previous shift notes reviewed', 'NON_RING', 0, demoWindowSeconds, 4);

    db.prepare(
      `INSERT INTO verification_run (id, template_id, scheduled_context, operator_id, data_mode, capture_date)
       VALUES (?, ?, 'Opening - recorded walkthrough', ?, 'RECORDED_DEMO', ?)`,
    ).run(REVIEW_RUN_ID, TEMPLATE, OPERATOR, CAPTURE_DATE);

    // The captured provider record, normalized exactly as the live adapter would store it.
    db.prepare(
      `INSERT INTO ring_event
         (id, provider_event_id, device_id, event_type, start_at, end_at, is_simulated, is_ambiguous,
          normalized_facts, observed_at)
       VALUES (?, 'recorded-capture-event-0001', ?, 'on_demand', ?, ?, 1, 0, ?, ?)`,
    ).run(
      EVENT,
      DEVICE,
      new Date(CAPTURED_START_MS).toISOString(),
      new Date(CAPTURED_END_MS).toISOString(),
      JSON.stringify({
        source: 'Ring Developer Playground capture, Day-1 T3, 2026-10-07',
        startMs: CAPTURED_START_MS,
        endMs: CAPTURED_END_MS,
      }),
      t('11:23:52').toISOString(),
    );

    const base = { runId: REVIEW_RUN_ID, skewSeconds, windowSeconds: demoWindowSeconds };

    // 1. Ring-backed check: armed 11:21:50, captured session started 11:22:15.
    const ring = startCheck(db, { ...base, checkId: CHECK_RING, actor: OPERATOR, now: t('11:21:50') });
    autoClaimEvidence(db, ring.id, OPERATOR, t('11:24:00'));
    recordDecision(db, {
      attemptId: ring.id,
      decision: 'PASS',
      reason: 'Entrance shutters up, signage in place, walkway clear of deliveries.',
      actor: OPERATOR,
      now: t('11:24:30'),
    });

    // 2. Alarm panel: FAIL -> incident -> action -> recheck -> PASS -> human resolution.
    const alarm1 = startCheck(db, { ...base, checkId: CHECK_ALARM, actor: OPERATOR, now: t('11:25:00') });
    recordDecision(db, {
      attemptId: alarm1.id,
      decision: 'FAIL',
      reason: 'Panel showed a fault on zone 3 (stockroom door contact).',
      actor: OPERATOR,
      now: t('11:25:40'),
    });
    const incident = openIncidentForCheck(db, CHECK_ALARM);
    if (incident) {
      transitionIncident(db, { incidentId: incident.id, to: 'ACKNOWLEDGED', actor: OPERATOR, now: t('11:26:30') });
      transitionIncident(db, {
        incidentId: incident.id,
        to: 'ACTION_REQUIRED',
        actor: OPERATOR,
        reason: 'Reseat zone 3 door contact and clear the fault.',
        now: t('11:27:00'),
      });
    }
    const alarm2 = startCheck(db, { ...base, checkId: CHECK_ALARM, actor: OPERATOR, now: t('11:30:00') });
    recordDecision(db, {
      attemptId: alarm2.id,
      decision: 'PASS',
      reason: 'Contact reseated; zone 3 clear on panel; all zones reviewed.',
      actor: OPERATOR,
      now: t('11:31:10'),
    });
    if (incident) {
      transitionIncident(db, {
        incidentId: incident.id,
        to: 'RESOLVED',
        actor: OPERATOR,
        reason: 'Recheck attempt #2 passed; resolution approved.',
        now: t('11:32:00'),
      });
    }

    // 3. Cash float - straightforward PASS.
    const float = startCheck(db, { ...base, checkId: CHECK_FLOAT, actor: OPERATOR, now: t('11:26:00') });
    recordDecision(db, { attemptId: float.id, decision: 'PASS', actor: OPERATOR, now: t('11:26:20') });

    // 4. Optional check: FAIL, but optional, so it raises MEDIUM and does not block.
    //    Then an approver override, which is recorded as OVERRIDDEN - never as PASS.
    const notes = startCheck(db, { ...base, checkId: CHECK_NOTES, actor: OPERATOR, now: t('11:28:00') });
    recordDecision(db, {
      attemptId: notes.id,
      decision: 'FAIL',
      reason: 'Previous shift notes were not left in the handover book.',
      actor: OPERATOR,
      now: t('11:28:30'),
    });
    recordOverride(db, {
      runId: REVIEW_RUN_ID,
      checkId: CHECK_NOTES,
      approver: OPERATOR,
      reason: 'Night manager confirmed by phone that there were no incidents overnight; notes to follow.',
      now: t('11:29:00'),
    });
    const notesIncident = openIncidentForCheck(db, CHECK_NOTES);
    if (notesIncident) {
      transitionIncident(db, {
        incidentId: notesIncident.id,
        to: 'DISMISSED',
        actor: OPERATOR,
        reason: 'Covered by approver override; no further action.',
        now: t('11:29:30'),
      });
    }

    setIntegrationState(db, 'HEALTHY', null, t('11:33:00'));
    approveRun(db, REVIEW_RUN_ID, OPERATOR, t('11:33:30'));

    // A real, captured AI handover note (see recordedAiNote.ts), labelled as recorded.
    db.prepare(
      'INSERT INTO ai_interaction (id, run_id, type, tool_trace_summary, response, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      RECORDED_AI_NOTE_ID,
      REVIEW_RUN_ID,
      'HANDOVER',
      JSON.stringify({
        modelId: RECORDED_AI_NOTE.modelId,
        provider: RECORDED_AI_NOTE.provider,
        requestedBy: OPERATOR,
        recordedAt: RECORDED_AI_NOTE.capturedAt,
        trace: RECORDED_AI_NOTE.trace,
      }),
      RECORDED_AI_NOTE.text,
      RECORDED_AI_NOTE.capturedAt,
    );

    db.exec('COMMIT');
    return true;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
