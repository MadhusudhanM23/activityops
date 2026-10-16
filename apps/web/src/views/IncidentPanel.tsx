import { useState } from 'react';
import { AlertOctagon, ChevronDown, Sparkles } from 'lucide-react';
import type { Incident, Run } from '../types.js';
import { api } from '../api.js';
import { Badge, Button, Card, CardHeader, EmptyState, cx, formatTime, sentence } from '../ui.js';
import { ReasonForm } from './ReasonForm.js';
import type { Perform } from './RunDetail.js';

/**
 * Incident lifecycle (spec sec. 13).
 *
 * RECHECKING and READY_TO_RESOLVE are driven by attempts, so they are not offered
 * as buttons. RESOLVED is offered only from READY_TO_RESOLVE and is labelled as
 * an approval - a person's decision, never something the system or the AI does.
 */

const SEVERITY_TONE = { BLOCKER: 'amber', HIGH: 'red', MEDIUM: 'sky', LOW: 'slate' } as const;

const MANUAL_TRANSITIONS: Record<string, { label: string; done: string }> = {
  ACKNOWLEDGED: { label: 'Acknowledge', done: 'Incident acknowledged' },
  ACTION_REQUIRED: { label: 'Mark action required', done: 'Incident marked action required' },
  RESOLVED: { label: 'Approve resolution', done: 'Resolution approved' },
  DISMISSED: { label: 'Dismiss', done: 'Incident dismissed' },
};

const STAGES = ['OPEN', 'ACKNOWLEDGED', 'ACTION_REQUIRED', 'RECHECKING', 'READY_TO_RESOLVE', 'RESOLVED'] as const;
const STAGE_LABEL: Record<(typeof STAGES)[number], string> = {
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  ACTION_REQUIRED: 'Action required',
  RECHECKING: 'Rechecking',
  READY_TO_RESOLVE: 'Ready to resolve',
  RESOLVED: 'Resolved',
};

/** Where the incident is on its path. Stages it skipped are shown as passed. */
function LifecycleTrack({ status }: { status: string }) {
  const dismissed = status === 'DISMISSED';
  const current = STAGES.indexOf(status as (typeof STAGES)[number]);
  return (
    <ol className="mt-2.5 grid grid-cols-6 gap-0.5" aria-label={`Lifecycle stage: ${status.replaceAll('_', ' ').toLowerCase()}`}>
      {STAGES.map((stage, index) => {
        const reached = !dismissed && index <= current;
        const isCurrent = !dismissed && index === current;
        return (
          <li key={stage} className="flex flex-col items-center gap-1 text-center">
            <span
              className={cx(
                'h-1 w-full rounded-full',
                reached ? (status === 'RESOLVED' ? 'bg-emerald-500' : 'bg-violet-500') : 'bg-slate-200',
              )}
            />
            <span className={cx('text-[9px] font-medium leading-tight', isCurrent ? 'text-slate-900' : 'text-slate-400')}>
              {STAGE_LABEL[stage]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function IncidentItem({
  incident,
  runId,
  readOnly,
  signedIn,
  busy,
  perform,
}: {
  incident: Incident;
  runId: string;
  readOnly: boolean;
  signedIn: boolean;
  busy: boolean;
  perform: Perform;
}) {
  const [dismissing, setDismissing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const closed = incident.status === 'RESOLVED' || incident.status === 'DISMISSED';
  const actions = incident.allowedTransitions.filter((to) => to in MANUAL_TRANSITIONS);

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-1">
        <Badge tone={SEVERITY_TONE[incident.severity]}>{incident.severity}</Badge>
        <Badge tone={closed ? 'slate' : 'violet'}>{incident.status.replaceAll('_', ' ')}</Badge>
        {incident.carriedOver && (
          <Badge tone="amber" title="Raised during an earlier run of this check; it stays open until resolved">
            From an earlier run
          </Badge>
        )}
      </div>
      <p className="mt-1.5 text-xs font-semibold text-slate-900">{incident.checkLabel}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{incident.reason}</p>

      <LifecycleTrack status={incident.status} />

      {incident.resolvedBy && (
        <p className="mt-2 text-[11px] text-emerald-700">
          Resolution approved by {incident.resolvedBy} at {formatTime(incident.resolvedAt)}
        </p>
      )}
      {incident.dismissedReason && (
        <p className="mt-2 text-[11px] text-slate-600">
          Dismissed: {sentence(incident.dismissedReason)} Dismissal does not erase the failed attempt.
        </p>
      )}

      <button
        type="button"
        onClick={() => setHistoryOpen((value) => !value)}
        aria-expanded={historyOpen}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
      >
        Lifecycle ({incident.actions.length})
        <ChevronDown aria-hidden className={cx('h-3 w-3 transition', historyOpen && 'rotate-180')} />
      </button>
      {historyOpen && (
        <ol className="mt-1.5 space-y-1 border-l-2 border-slate-200 pl-3 text-[11px] text-slate-600">
          {incident.actions.map((action, index) => (
            <li key={`${action.createdAt}-${index}`}>
              <span className="font-semibold text-slate-800">{action.action.replaceAll('_', ' ')}</span> ·{' '}
              {formatTime(action.createdAt)} · {action.actor === 'system' ? 'system (driven by an attempt)' : action.actor}
              {action.reason && <> · {action.reason}</>}
            </li>
          ))}
        </ol>
      )}

      {signedIn && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            perform(async () => {
              // Read-only AI: drafts a summary from recorded facts; it cannot move the incident.
              const answer = await api.ask(runId, 'INCIDENT_SUMMARY', incident.id);
              if (answer.status !== 'COMPLETED') throw new Error(answer.text ?? 'The assistant did not produce a summary.');
              return answer;
            }, 'Incident summary drafted - see Operations copilot below')
          }
          className="ml-3 mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:text-violet-900 disabled:text-slate-400"
        >
          <Sparkles aria-hidden className="h-3 w-3 motion-safe:animate-twinkle" />
          Summarize with AI
        </button>
      )}

      {!readOnly && !closed && actions.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {actions.map((to) =>
            to === 'DISMISSED' ? (
              <Button key={to} variant="ghost" size="sm" disabled={busy} onClick={() => setDismissing(true)}>
                Dismiss
              </Button>
            ) : (
              <Button
                key={to}
                size="sm"
                variant={to === 'RESOLVED' ? 'success' : 'secondary'}
                disabled={busy}
                onClick={() => perform(() => api.transitionIncident(incident.id, to), MANUAL_TRANSITIONS[to]?.done)}
              >
                {MANUAL_TRANSITIONS[to]?.label}
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
            void perform(() => api.transitionIncident(incident.id, 'DISMISSED', reason), 'Incident dismissed');
          }}
        />
      )}
    </li>
  );
}

export function IncidentPanel({ run, signedIn, busy, perform }: { run: Run; signedIn: boolean; busy: boolean; perform: Perform }) {
  const readOnly = run.dataMode === 'RECORDED_DEMO';
  const open = run.incidents.filter((i) => i.status !== 'RESOLVED' && i.status !== 'DISMISSED').length;
  return (
    <Card className="p-4">
      <CardHeader
        icon={<AlertOctagon className="h-4 w-4" />}
        title="Incidents"
        right={run.incidents.length > 0 ? <Badge tone={open > 0 ? 'red' : 'slate'}>{open > 0 ? `${open} open` : 'All closed'}</Badge> : undefined}
      />
      {run.incidents.length === 0 ? (
        <EmptyState kind="calm" title="No incidents on this run." body="A FAIL opens one automatically; it is tracked until a person resolves or dismisses it." />
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {run.incidents.map((incident) => (
            <IncidentItem key={incident.id} incident={incident} runId={run.id} readOnly={readOnly} signedIn={signedIn} busy={busy} perform={perform} />
          ))}
        </ul>
      )}
    </Card>
  );
}
