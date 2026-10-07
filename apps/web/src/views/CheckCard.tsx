import { useState } from 'react';
import type { Attempt, Check, Run, SyncSummary } from '../types.js';
import { api } from '../api.js';
import { Badge, Button, Card, cx, formatTime, sentence } from '../ui.js';
import { EvidenceCard } from './EvidenceCard.js';
import { ReasonForm } from './ReasonForm.js';

const PLAYGROUND_URL = import.meta.env.VITE_RING_PLAYGROUND_URL ?? 'https://developer.ring.com/';

const ATTEMPT_TONE: Record<Attempt['status'], string> = {
  IN_PROGRESS: 'text-sky-800 bg-sky-50 ring-sky-200',
  PASS: 'text-emerald-800 bg-emerald-50 ring-emerald-200',
  FAIL: 'text-red-800 bg-red-50 ring-red-200',
  // Visually distinct from PASS on purpose (spec sec. 13).
  OVERRIDDEN: 'text-fuchsia-800 bg-fuchsia-50 ring-fuchsia-300',
  CANCELLED: 'text-slate-500 bg-slate-50 ring-slate-200',
};

function deviceLine(check: Check) {
  if (!check.device) return null;
  const { status, label, lastStatusAt } = check.device;
  const text =
    status === 'AVAILABLE'
      ? 'Ring reported the device online'
      : status === 'UNAVAILABLE'
        ? 'Ring reported the device offline'
        : 'Device status not yet reported';
  return (
    <p className="text-xs text-slate-600">
      <span className="font-medium text-slate-800">{label}</span> ·{' '}
      <span className={cx(status === 'UNAVAILABLE' && 'font-semibold text-amber-800')}>{text}</span>
      {lastStatusAt && <span className="text-slate-500"> ({formatTime(lastStatusAt)})</span>}
    </p>
  );
}

function syncMessage(sync: SyncSummary, attempt: Attempt | null): string {
  if (sync.sessionClaimed) return 'Ring session observed during this check window and bound to this attempt.';
  if (sync.deviceStatus === 'UNAVAILABLE') return 'Ring reports this device offline. The check is blocked until it returns.';
  if (sync.coversWindow) {
    return 'The window has closed and a complete history sync found no qualifying session.';
  }
  return `No qualifying session observed yet (${sync.eventsSeen} record(s) checked). This is not evidence of a problem - start or finish the live view, then sync again before ${formatTime(attempt?.eligibleEnd)}.`;
}

export function CheckCard({
  run,
  check,
  busy,
  perform,
}: {
  run: Run;
  check: Check;
  busy: boolean;
  perform: (action: () => Promise<Run>) => Promise<void>;
}) {
  const [form, setForm] = useState<null | 'fail' | 'override'>(null);
  const [sync, setSync] = useState<SyncSummary | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const latest = check.latestAttempt;
  const readOnly = run.dataMode === 'RECORDED_DEMO' || Boolean(run.approvedAt) || Boolean(run.cancelledAt);
  const isRing = check.requirementType === 'RING_REQUIRED';
  const open = latest?.status === 'IN_PROGRESS' ? latest : null;
  const canStart = !readOnly && !open && latest?.status !== 'PASS' && latest?.status !== 'OVERRIDDEN';
  const isRecheck = canStart && latest?.status === 'FAIL';
  const passBlocked = isRing && open !== null && !open.evidence;

  return (
    <Card className="p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h3 className="font-semibold text-slate-900">{check.label}</h3>
          <div className="flex flex-wrap gap-1.5">
            {isRing ? <Badge tone="sky">Ring evidence required</Badge> : <Badge>Manual check</Badge>}
            <Badge tone={check.required ? 'slate' : 'teal'}>{check.required ? 'Required' : 'Optional'}</Badge>
            {check.openIncidentId && <Badge tone="red">Open incident</Badge>}
          </div>
          {deviceLine(check)}
        </div>
        {latest && (
          <span className={cx('rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset', ATTEMPT_TONE[latest.status])}>
            #{latest.attemptNumber} · {latest.statusLabel}
          </span>
        )}
      </header>

      {latest?.reason && (
        <p className="mt-2 text-sm text-slate-700">
          <span className="text-slate-500">Operator note: </span>
          {latest.reason}
        </p>
      )}

      {latest?.override && (
        <p className="mt-2 rounded-md bg-fuchsia-50 p-2 text-sm text-fuchsia-900 ring-1 ring-fuchsia-200">
          <span className="font-semibold">OVERRIDDEN</span> by {latest.override.approvedBy} at{' '}
          {formatTime(latest.override.approvedAt)}. Reason: {sentence(latest.override.reason)}{' '}
          <span className="font-medium">This is an approved exception, not a PASS.</span>
        </p>
      )}

      {open && isRing && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-700 ring-1 ring-slate-200">
          Check window: <span className="font-medium">{formatTime(open.eligibleStart)}</span> to{' '}
          <span className="font-medium">{formatTime(open.eligibleEnd)}</span> ({open.windowSeconds}s from arming, with a
          small clock-skew allowance). Only a session that starts inside this window, on this device, can count.
        </div>
      )}

      {latest?.evidence && (
        <div className="mt-3">
          <EvidenceCard evidence={latest.evidence} attemptNumber={latest.attemptNumber} />
        </div>
      )}

      {sync && (
        <p role="status" className="mt-3 rounded-md bg-white p-2 text-xs text-slate-700 ring-1 ring-slate-200">
          {syncMessage(sync, open)}
        </p>
      )}

      {!readOnly && (
        <div className="mt-3 flex flex-wrap gap-2">
          {canStart && (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => perform(() => api.startCheck(run.id, check.id))}
            >
              {isRecheck ? `Start recheck (attempt #${(latest?.attemptNumber ?? 0) + 1})` : isRing ? 'Start Ring check' : 'Start check'}
            </Button>
          )}

          {open && isRing && (
            <>
              <a
                href={PLAYGROUND_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[40px] items-center rounded-lg px-3 py-2 text-sm font-medium text-sky-800 ring-1 ring-inset ring-sky-300 hover:bg-sky-50"
              >
                Open Ring live view (Playground, new tab)
              </a>
              <Button
                disabled={busy}
                onClick={() =>
                  perform(async () => {
                    const result = await api.syncCheck(run.id, check.id);
                    setSync(result.sync);
                    return result.run;
                  })
                }
              >
                Sync Ring history
              </Button>
            </>
          )}

          {open && (
            <>
              <Button
                variant="success"
                disabled={busy || passBlocked}
                title={passBlocked ? 'A Ring session must be observed in this window first' : undefined}
                onClick={() => perform(() => api.decide(open.id, 'PASS'))}
              >
                Record PASS
              </Button>
              <Button variant="danger" disabled={busy} onClick={() => setForm('fail')}>
                Record FAIL
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => perform(() => api.cancelAttempt(open.id))}>
                Cancel attempt
              </Button>
            </>
          )}

          {latest?.status === 'FAIL' && !open && (
            <Button variant="ghost" disabled={busy} onClick={() => setForm('override')}>
              Approver override
            </Button>
          )}
        </div>
      )}

      {passBlocked && (
        <p className="mt-2 text-xs text-slate-600">
          PASS unlocks once a Ring session is observed in this window. FAIL can be recorded at any time.
        </p>
      )}

      {form === 'fail' && open && (
        <ReasonForm
          label="What failed?"
          placeholder="Describe what you found"
          submitLabel="Record FAIL"
          variant="danger"
          busy={busy}
          onCancel={() => setForm(null)}
          onSubmit={(reason) => {
            setForm(null);
            void perform(() => api.decide(open.id, 'FAIL', reason));
          }}
        />
      )}

      {form === 'override' && (
        <ReasonForm
          label="Why is an exception justified?"
          placeholder="Recorded with your identity and shown as OVERRIDDEN, never as PASS"
          submitLabel="Record override"
          busy={busy}
          onCancel={() => setForm(null)}
          onSubmit={(reason) => {
            setForm(null);
            void perform(() => api.override(run.id, check.id, reason));
          }}
        />
      )}

      {check.attempts.length > 1 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setHistoryOpen((value) => !value)}
            className="text-xs font-semibold text-slate-600 underline-offset-2 hover:underline"
            aria-expanded={historyOpen}
          >
            {historyOpen ? 'Hide' : 'Show'} all {check.attempts.length} attempts
          </button>
          {historyOpen && (
            <ol className="mt-2 space-y-1.5 border-l-2 border-slate-200 pl-3">
              {check.attempts.map((attempt) => (
                <li key={attempt.id} className="text-xs text-slate-700">
                  <span className={cx('mr-1.5 rounded px-1.5 py-0.5 font-semibold ring-1 ring-inset', ATTEMPT_TONE[attempt.status])}>
                    #{attempt.attemptNumber} {attempt.statusLabel}
                  </span>
                  {formatTime(attempt.attestedAt ?? attempt.createdAt)}
                  {attempt.attestedBy && <> · {attempt.attestedBy}</>}
                  {attempt.reason && <> · “{attempt.reason}”</>}
                  {attempt.supersedesAttemptId && <span className="text-slate-500"> · supersedes the previous attempt</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Card>
  );
}
