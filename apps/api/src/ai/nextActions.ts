import type { RunView } from '../http/present.js';

/**
 * "What should I do next?" (spec v7 sec. 17).
 *
 * The spec requires *configured* operational next actions, never fabricated
 * claims - so this is a fixed mapping from deterministic readiness reasons to
 * actions, with no model involved. The AI may repeat these; it may not invent
 * others.
 */

export interface NextAction {
  code: string;
  checkId: string | null;
  action: string;
}

export function nextActions(run: RunView): NextAction[] {
  const label = (checkId?: string) => run.checks.find((c) => c.id === checkId)?.label ?? 'this check';
  const status = run.readiness.status;

  if (status === 'CANCELLED') return [{ code: 'RUN_CANCELLED', checkId: null, action: 'This run is cancelled. Start a new run if the checks still need doing.' }];
  if (status === 'READY') return [{ code: 'RUN_APPROVED', checkId: null, action: 'Nothing further on this run. Hand over to the next shift.' }];

  const actions: NextAction[] = run.readiness.reasons.map((reason) => {
    const checkId = reason.checkId ?? null;
    switch (reason.code) {
      case 'NO_ATTEMPTS_STARTED':
        return { code: reason.code, checkId, action: 'Start the first check.' };
      case 'REQUIRED_CHECK_FAILED':
        return {
          code: reason.code,
          checkId,
          action: `Fix the problem found on "${label(reason.checkId)}", then start a recheck. If an exception is justified, an approver can record an override with a reason - it will show as OVERRIDDEN, not PASS.`,
        };
      case 'REQUIRED_DEVICE_UNAVAILABLE':
        return {
          code: reason.code,
          checkId,
          action: `Bring the Ring device for "${label(reason.checkId)}" back online, then sync again or start a new attempt. Resolve or dismiss the BLOCKER incident with a reason once it is dealt with.`,
        };
      case 'COVERED_WINDOW_NO_SESSION':
        return {
          code: reason.code,
          checkId,
          action: `The window for "${label(reason.checkId)}" closed with no Ring session observed. Start a recheck and open Ring live view within the new window.`,
        };
      case 'RING_EVIDENCE_MISSING':
        return {
          code: reason.code,
          checkId,
          action: `Open Ring live view for "${label(reason.checkId)}", then sync Ring history so the session is bound before recording PASS.`,
        };
      case 'REQUIRED_CHECK_INCOMPLETE':
        return { code: reason.code, checkId, action: `Complete "${label(reason.checkId)}" and record PASS or FAIL.` };
      case 'BLOCKING_INCIDENT_OPEN':
        return { code: reason.code, checkId, action: `Work the open incident on "${label(reason.checkId)}" through to resolution, or dismiss it with a reason.` };
      case 'INTEGRATION_RECONNECT_REQUIRED':
        return { code: reason.code, checkId, action: 'Reconnect Ring with a fresh Playground token, then sync again. Nothing about the site has changed.' };
      case 'ALL_REQUIRED_CHECKS_SATISFIED':
        return { code: reason.code, checkId, action: 'Every required check is satisfied. Record approval to mark the run ready.' };
      default:
        return { code: reason.code, checkId, action: reason.message };
    }
  });

  // One action per check is enough: an open incident on a failed check is the same job.
  const seen = new Set<string>();
  return actions.filter((a) => {
    if (!a.checkId) return true;
    if (seen.has(a.checkId)) return false;
    seen.add(a.checkId);
    return true;
  });
}
