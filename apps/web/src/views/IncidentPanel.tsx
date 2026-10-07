import { useState } from 'react';
import type { Incident, Run } from '../types.js';
import { api } from '../api.js';
import { Badge, Button, Card, formatTime, sentence } from '../ui.js';
import { ReasonForm } from './ReasonForm.js';

/**
 * Incident lifecycle (spec sec. 13).
 *
 * RECHECKING and READY_TO_RESOLVE are driven by attempts, so they are not offered
 * as buttons. RESOLVED is offered only from READY_TO_RESOLVE and is labelled as
 * an approval - a person's decision, never something the system or the AI does.
 */

const SEVERITY_TONE = { BLOCKER: 'amber', HIGH: 'red', MEDIUM: 'sky', LOW: 'slate' } as const;

const MANUAL_TRANSITIONS: Record<string, string> = {
  ACKNOWLEDGED: 'Acknowledge',
  ACTION_REQUIRED: 'Mark action required',
  RESOLVED: 'Approve resolution',
  DISMISSED: 'Dismiss',
};

function IncidentItem({
  incident,
  readOnly,
  busy,
  perform,
}: {
  incident: Incident;
  readOnly: boolean;
  busy: boolean;
  perform: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [dismissing, setDismissing] = useState(false);
  const closed = incident.status === 'RESOLVED' || incident.status === 'DISMISSED';
  const actions = incident.allowedTransitions.filter((to) => to in MANUAL_TRANSITIONS);

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={SEVERITY_TONE[incident.severity]}>{incident.severity}</Badge>
        <Badge tone={closed ? 'slate' : 'violet'}>{incident.status.replaceAll('_', ' ')}</Badge>
        <span className="text-sm font-medium text-slate-900">{incident.checkLabel}</span>
      </div>
      <p className="mt-1 text-sm text-slate-700">{incident.reason}</p>
      {incident.resolvedBy && (
        <p className="mt-1 text-xs text-emerald-800">
          Resolution approved by {incident.resolvedBy} at {formatTime(incident.resolvedAt)}
        </p>
      )}
      {incident.dismissedReason && (
        <p className="mt-1 text-xs text-slate-600">
          Dismissed: {sentence(incident.dismissedReason)} Dismissal does not erase the failed attempt.
        </p>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-semibold text-slate-600">Lifecycle ({incident.actions.length})</summary>
        <ol className="mt-1 space-y-0.5 border-l-2 border-slate-200 pl-3 text-xs text-slate-600">
          {incident.actions.map((action, index) => (
            <li key={`${action.createdAt}-${index}`}>
              <span className="font-semibold text-slate-800">{action.action.replaceAll('_', ' ')}</span> ·{' '}
              {formatTime(action.createdAt)} · {action.actor === 'system' ? 'system (driven by an attempt)' : action.actor}
              {action.reason && <> · {action.reason}</>}
            </li>
          ))}
        </ol>
      </details>

      {!readOnly && !closed && actions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {actions.map((to) =>
            to === 'DISMISSED' ? (
              <Button key={to} variant="ghost" disabled={busy} onClick={() => setDismissing(true)}>
                Dismiss
              </Button>
            ) : (
              <Button
                key={to}
                variant={to === 'RESOLVED' ? 'success' : 'secondary'}
                disabled={busy}
                onClick={() => perform(() => api.transitionIncident(incident.id, to))}
              >
                {MANUAL_TRANSITIONS[to]}
              </Button>
            ),
          )}
        </div>
      )}

      {dismissing && (
        <ReasonForm
          label="Why dismiss this incident?"
          placeholder="Dismissal is recorded and does not clear the failed check"
          submitLabel="Dismiss incident"
          busy={busy}
          onCancel={() => setDismissing(false)}
          onSubmit={(reason) => {
            setDismissing(false);
            void perform(() => api.transitionIncident(incident.id, 'DISMISSED', reason));
          }}
        />
      )}
    </li>
  );
}

export function IncidentPanel({
  run,
  busy,
  perform,
}: {
  run: Run;
  busy: boolean;
  perform: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const readOnly = run.dataMode === 'RECORDED_DEMO';
  return (
    <Card className="p-4">
      <h2 className="text-base font-semibold text-slate-900">Incidents</h2>
      {run.incidents.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">No incidents on this run.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {run.incidents.map((incident) => (
            <IncidentItem key={incident.id} incident={incident} readOnly={readOnly} busy={busy} perform={perform} />
          ))}
        </ul>
      )}
    </Card>
  );
}
