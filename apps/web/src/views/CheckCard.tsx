import { useEffect, useRef, useState } from 'react';
import { Ban, Check as CheckIcon, Clock3, ExternalLink, Play, RefreshCw, RotateCcw, ShieldAlert, Timer, X } from 'lucide-react';
import type { Attempt, Check, Run, SyncSummary } from '../types.js';
import { api } from '../api.js';
import { useToast } from '../toast.js';
import { Badge, Button, Card, Hint, cx, formatTime, sentence } from '../ui.js';
import { EvidenceCard } from './EvidenceCard.js';
import { ReasonForm } from './ReasonForm.js';
import type { Perform } from './RunDetail.js';

// Verified 2026-10-12: the one-click token and "Simulate live view event" live on this page.
const PLAYGROUND_URL = import.meta.env.VITE_RING_PLAYGROUND_URL ?? 'https://developer.amazon.com/ring/console/playground';

const ATTEMPT_TONE: Record<Attempt['status'], string> = {
  IN_PROGRESS: 'text-brand-700 bg-brand-50 ring-brand-200',
  PASS: 'text-emerald-700 bg-emerald-50 ring-emerald-200',
  FAIL: 'text-red-700 bg-red-50 ring-red-200',
  // Visually distinct from PASS on purpose (spec sec. 13).
  OVERRIDDEN: 'text-fuchsia-700 bg-fuchsia-50 ring-fuchsia-200',
  CANCELLED: 'text-slate-500 bg-slate-50 ring-slate-200',
};

/** Live countdown to the end of a check window. */
export function WindowCountdown({ end }: { end: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, Math.round((Date.parse(end) - now) / 1000));
  if (left === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
        <Timer aria-hidden className="h-3.5 w-3.5" />
        Window closed - sync once more to finish the check
      </span>
    );
  }
  return (
    <span
      role="timer"
      className={cx(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        left < 60 ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-brand-50 text-brand-700 ring-brand-200',
      )}
    >
      <Timer aria-hidden className={cx('h-3.5 w-3.5', left < 60 && 'motion-safe:animate-signal')} />
      <span className="tabular-nums">
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      </span>
      left in check window
    </span>
  );
}

function StatusIcon({ attempt, index }: { attempt: Attempt | null; index: number }) {
  const base = 'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold';
  if (!attempt) return <span className={cx(base, 'bg-slate-100 text-slate-500')}>{index}</span>;
  switch (attempt.status) {
    case 'PASS':
      return <span className={cx(base, 'bg-emerald-500 text-white')}><CheckIcon aria-hidden className="h-4 w-4" /></span>;
    case 'FAIL':
      return <span className={cx(base, 'bg-red-500 text-white')}><X aria-hidden className="h-4 w-4" /></span>;
    case 'OVERRIDDEN':
      return <span className={cx(base, 'bg-fuchsia-500 text-white')}><ShieldAlert aria-hidden className="h-4 w-4" /></span>;
    case 'IN_PROGRESS':
      return <span className={cx(base, 'bg-brand-50 text-brand-600 ring-2 ring-brand-200')}><Clock3 aria-hidden className="h-3.5 w-3.5" /></span>;
    default:
      return <span className={cx(base, 'bg-slate-100 text-slate-400')}><Ban aria-hidden className="h-3.5 w-3.5" /></span>;
  }
}

/** The four steps of a Ring-backed check, so nobody has to guess the order. */
function RingStepper({ started, evidence }: { started: boolean; evidence: boolean }) {
  const steps = [
    { label: 'Start check', state: started ? 'done' : 'active' },
    { label: 'Trigger live view', state: evidence ? 'done' : started ? 'active' : 'todo' },
    { label: 'Sync history', state: evidence ? 'done' : started ? 'active' : 'todo' },
    { label: 'Record decision', state: evidence ? 'active' : 'todo' },
  ] as const;
  return (
    <ol className="mt-3 grid grid-cols-4 gap-1" aria-label="Ring check steps">
      {steps.map((step, index) => (
        <li key={step.label} className="relative flex flex-col items-center text-center">
          {index > 0 && (
            <span
              aria-hidden
              className={cx('absolute left-[-50%] right-1/2 top-2.5 h-0.5', step.state === 'todo' ? 'bg-slate-200' : 'bg-brand-300')}
            />
          )}
          <span
            className={cx(
              'relative z-10 grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold',
              step.state === 'done' && 'bg-brand-600 text-white',
              step.state === 'active' && 'bg-white text-brand-700 ring-2 ring-brand-500',
              step.state === 'todo' && 'bg-white text-slate-400 ring-1 ring-slate-300',
            )}
          >
            {step.state === 'done' ? <CheckIcon aria-hidden className="h-3 w-3" /> : index + 1}
          </span>
          <span className={cx('mt-1 text-[10px] font-medium leading-tight', step.state === 'todo' ? 'text-slate-400' : 'text-slate-700')}>
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

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
    <p className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
      <span
        aria-hidden
        className={cx('h-1.5 w-1.5 rounded-full', status === 'AVAILABLE' ? 'bg-emerald-500' : status === 'UNAVAILABLE' ? 'bg-amber-500' : 'bg-slate-300')}
      />
      <span className="font-medium text-slate-700">{label}</span> ·{' '}
      <span className={cx(status === 'UNAVAILABLE' && 'font-semibold text-amber-700')}>{text}</span>
      {lastStatusAt && <span className="text-slate-400">({formatTime(lastStatusAt)})</span>}
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

/** How often an armed Ring check polls Event History by itself. Ring sync is limited to 30/min. */
const AUTO_SYNC_MS = 15_000;
/** Keep polling briefly after the window closes, so the final sync covers it. */
const AFTER_WINDOW_MS = 90_000;

export function CheckCard({
  run,
  check,
  index,
  busy,
  perform,
  onRun,
}: {
  run: Run;
  check: Check;
  index: number;
  busy: boolean;
  perform: Perform;
  onRun: (run: Run) => void;
}) {
  const notify = useToast();
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
  const showStepper = isRing && !readOnly && (open !== null || canStart);

  // Auto-sync: while a Ring check waits for evidence, poll Event History so nobody has
  // to remember the Sync button. Paused while the tab is hidden or another action runs.
  const [lastAuto, setLastAuto] = useState<Date | null>(null);
  const [autoOn, setAutoOn] = useState(true);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const watching = isRing && !readOnly && open !== null && !open.evidence && autoOn;
  useEffect(() => setAutoOn(true), [open?.id]); // a recheck is a new attempt: watch again
  useEffect(() => {
    if (!watching || !open) return;
    const deadline = open.eligibleEnd ? Date.parse(open.eligibleEnd) + AFTER_WINDOW_MS : Infinity;
    let stopped = false;
    const timer = setInterval(async () => {
      if (stopped || busyRef.current || document.hidden) return;
      if (Date.now() > deadline) {
        setAutoOn(false);
        return;
      }
      try {
        const result = await api.syncCheck(run.id, check.id);
        if (stopped) return;
        setSync(result.sync);
        setLastAuto(new Date());
        onRun(result.run);
        if (result.sync.sessionClaimed) notify('Ring session found automatically', { body: 'Record PASS is unlocked.' });
        if (result.sync.sessionClaimed || result.sync.coversWindow) setAutoOn(false);
      } catch {
        // Errors are shown by a manual sync; auto-sync simply stops.
        setAutoOn(false);
      }
    }, AUTO_SYNC_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [watching, open?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className={cx('p-4 transition', open && 'ring-1 ring-brand-200')}>
      <header className="flex items-start gap-3">
        <StatusIcon attempt={latest} index={index} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-[13px] font-semibold leading-snug text-slate-900">{check.label}</h3>
            {latest && (
              <span className={cx('whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset', ATTEMPT_TONE[latest.status])}>
                #{latest.attemptNumber} · {latest.statusLabel}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {isRing ? <Badge tone="sky">Ring evidence required</Badge> : <Badge>Manual check</Badge>}
            <Badge tone={check.required ? 'slate' : 'teal'}>{check.required ? 'Required' : 'Optional'}</Badge>
            {check.openIncidentId && <Badge tone="red">Open incident</Badge>}
            {isRing && (
              <Hint text="PASS stays locked until a Ring live-view session is observed on this device inside the check window. FAIL is always allowed." />
            )}
          </div>
          <div className="mt-1">{deviceLine(check)}</div>
        </div>
      </header>

      {showStepper && <RingStepper started={open !== null} evidence={Boolean(open?.evidence)} />}

      {latest?.reason && (
        <p className="mt-3 text-xs text-slate-700">
          <span className="text-slate-400">Operator note: </span>
          {latest.reason}
        </p>
      )}

      {latest?.override && (
        <p className="mt-3 rounded-lg bg-fuchsia-50 px-3 py-2 text-xs text-fuchsia-900 ring-1 ring-fuchsia-200">
          <span className="font-semibold">OVERRIDDEN</span> by {latest.override.approvedBy} at{' '}
          {formatTime(latest.override.approvedAt)}. Reason: {sentence(latest.override.reason)}{' '}
          <span className="font-medium">This is an approved exception, not a PASS.</span>
        </p>
      )}

      {open && isRing && !open.evidence && (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-800">Now trigger a live-view session, then sync</p>
            {open.eligibleEnd && <WindowCountdown end={open.eligibleEnd} />}
          </div>
          <p className="text-xs leading-relaxed text-slate-600">
            In the Ring Developer Playground, open <span className="font-medium">Simulate live view event</span> and pick any
            event (or start live view on a real device). ActivityOps checks Ring history by itself - or press{' '}
            <span className="font-medium">Sync Ring history</span> to check now.
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-brand-700">
            <RefreshCw aria-hidden className={cx('h-3 w-3', watching && 'motion-safe:animate-spin [animation-duration:3s]')} />
            {watching
              ? `Checking Ring history automatically every ${AUTO_SYNC_MS / 1000} s${lastAuto ? ` · last checked ${lastAuto.toLocaleTimeString()}` : ''}`
              : 'Automatic checking stopped - use Sync Ring history.'}
          </p>
          <p className="text-[11px] text-slate-500">
            Check window: <span className="font-medium text-slate-700">{formatTime(open.eligibleStart)}</span> to{' '}
            <span className="font-medium text-slate-700">{formatTime(open.eligibleEnd)}</span> ({open.windowSeconds}s from
            arming, with a small clock-skew allowance). Only a session that starts inside this window, on this device, can
            count.
          </p>
        </div>
      )}

      {latest?.evidence && (
        <div className="mt-3">
          <EvidenceCard evidence={latest.evidence} attemptNumber={latest.attemptNumber} />
        </div>
      )}

      {sync && (
        <p
          role="status"
          className={cx(
            'mt-3 rounded-lg px-3 py-2 text-xs ring-1',
            sync.sessionClaimed ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-white text-slate-700 ring-slate-200',
          )}
        >
          {syncMessage(sync, open)}
        </p>
      )}

      {!readOnly && (canStart || open || latest?.status === 'FAIL') && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canStart && (
            <Button
              variant="brand"
              disabled={busy}
              onClick={() =>
                perform(
                  () => api.startCheck(run.id, check.id),
                  isRecheck ? 'Recheck started - a new attempt; the failure stays on record' : isRing ? 'Ring check started - the check window is open' : 'Check started',
                )
              }
            >
              {isRecheck ? <RotateCcw aria-hidden className="h-3.5 w-3.5" /> : <Play aria-hidden className="h-3.5 w-3.5" />}
              {isRecheck ? `Start recheck (attempt #${(latest?.attemptNumber ?? 0) + 1})` : isRing ? 'Start Ring check' : 'Start check'}
            </Button>
          )}

          {open && isRing && (
            <>
              <a
                href={PLAYGROUND_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-medium text-brand-700 shadow-sm ring-1 ring-inset ring-brand-200 hover:bg-brand-50"
              >
                Open Ring Playground
                <ExternalLink aria-hidden className="h-3.5 w-3.5" />
              </a>
              <Button
                disabled={busy}
                onClick={() =>
                  perform(async () => {
                    const result = await api.syncCheck(run.id, check.id);
                    setSync(result.sync);
                    notify(
                      result.sync.sessionClaimed ? 'Ring session found - Record PASS is unlocked' : 'Ring history synced',
                      { tone: result.sync.sessionClaimed ? 'success' : 'info', body: result.sync.sessionClaimed ? undefined : syncMessage(result.sync, open) },
                    );
                    return result.run;
                  })
                }
              >
                <RefreshCw aria-hidden className={cx('h-3.5 w-3.5', busy && 'animate-spin')} />
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
                onClick={() => perform(() => api.decide(open.id, 'PASS'), 'PASS recorded')}
              >
                <CheckIcon aria-hidden className="h-3.5 w-3.5" />
                Record PASS
              </Button>
              <Button variant="danger" disabled={busy} onClick={() => setForm('fail')}>
                <X aria-hidden className="h-3.5 w-3.5" />
                Record FAIL
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => perform(() => api.cancelAttempt(open.id), 'Attempt cancelled')}>
                Cancel attempt
              </Button>
            </>
          )}

          {latest?.status === 'FAIL' && !open && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setForm('override')}>
              Approver override
            </Button>
          )}
        </div>
      )}

      {passBlocked && (
        <p className="mt-2 text-[11px] text-slate-500">PASS unlocks once a Ring session is observed in this window. FAIL can be recorded at any time.</p>
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
            void perform(() => api.decide(open.id, 'FAIL', reason), 'FAIL recorded - an incident was opened');
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
            void perform(() => api.override(run.id, check.id, reason), 'Override recorded - shown as OVERRIDDEN, not PASS');
          }}
        />
      )}

      {check.attempts.length > 1 && (
        <div className="mt-3 border-t border-slate-100 pt-2.5">
          <button
            type="button"
            onClick={() => setHistoryOpen((value) => !value)}
            className="text-xs font-semibold text-brand-700 hover:underline"
            aria-expanded={historyOpen}
          >
            {historyOpen ? 'Hide' : 'Show'} all {check.attempts.length} attempts
          </button>
          {historyOpen && (
            <ol className="mt-2 space-y-1.5 border-l-2 border-slate-200 pl-3">
              {check.attempts.map((attempt) => (
                <li key={attempt.id} className="text-xs text-slate-600">
                  <span className={cx('mr-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset', ATTEMPT_TONE[attempt.status])}>
                    #{attempt.attemptNumber} {attempt.statusLabel}
                  </span>
                  {formatTime(attempt.attestedAt ?? attempt.createdAt)}
                  {attempt.attestedBy && <> · {attempt.attestedBy}</>}
                  {attempt.reason && <> · “{attempt.reason}”</>}
                  {attempt.supersedesAttemptId && <span className="text-slate-400"> · supersedes the previous attempt</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Card>
  );
}
