import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Ban, ChevronDown, FileDown, History, ListChecks, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import type { AuditEntry, Run } from '../types.js';
import { ApiError, api } from '../api.js';
import { useToast } from '../toast.js';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorNote,
  IntegrationBanner,
  ModeLabel,
  ProgressRing,
  RunStatusChip,
  cx,
  formatClock,
  formatTime,
  plural,
} from '../ui.js';
import { CheckCard, WindowCountdown } from './CheckCard.js';
import { CopilotPanel } from './CopilotPanel.js';
import { IncidentPanel } from './IncidentPanel.js';

/** Runs an action, refreshes the run, and reports the outcome as a toast. */
export type Perform = (action: () => Promise<unknown>, success?: string) => Promise<void>;

function ReadinessPanel({ run }: { run: Run }) {
  const { readiness } = run;
  const showReasons = readiness.status !== 'READY' && readiness.status !== 'READY_TO_APPROVE';

  return (
    <Card className="p-4">
      <CardHeader icon={<ShieldCheck className="h-4 w-4" />} title="Readiness" right={<RunStatusChip status={readiness.status} />} />

      {showReasons && readiness.reasons.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-700">
            {readiness.status === 'NOT_STARTED' ? 'Status' : 'Why are we not ready?'}
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {readiness.reasons.map((reason, index) => (
              <li key={`${reason.code}-${reason.checkId ?? index}`} className="flex gap-2 text-xs leading-relaxed text-slate-600">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                {reason.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {run.nextActions.length > 0 && !run.cancelledAt && (
        <div className="mt-3 rounded-lg bg-brand-50/60 p-3 ring-1 ring-brand-100">
          <p className="text-xs font-semibold text-brand-800">What should I do next?</p>
          <ul className="mt-1.5 space-y-1.5">
            {run.nextActions.map((action) => (
              <li key={action} className="flex gap-2 text-xs leading-relaxed text-slate-700">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                {action}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(showReasons || run.nextActions.length > 0) && (
        <p className="mt-2.5 text-[11px] text-slate-400">
          Computed deterministically from recorded attempts, evidence and incidents. No AI is involved in this result.
        </p>
      )}

      {readiness.status === 'READY' && run.approvedAt && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-emerald-200">
          Approval recorded by <span className="font-semibold">{run.approvalActor}</span> at {formatTime(run.approvedAt)}.
        </p>
      )}
    </Card>
  );
}

/** "START_ATTEMPT" -> "Start attempt". */
function humanize(action: string): string {
  const words = action.toLowerCase().replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function AuditTrail({ runId, version }: { runId: string; version: number }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api.audit(runId).then((result) => {
      if (!cancelled) setEntries(result);
    });
    return () => {
      cancelled = true;
    };
  }, [open, runId, version]);

  return (
    <Card className="p-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900">
          <History aria-hidden className="h-4 w-4 text-slate-400" />
          Audit trail
          <span className="font-normal text-slate-400">· every action, who and when</span>
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
          {open ? 'Hide' : 'Show'}
          <ChevronDown aria-hidden className={cx('h-3.5 w-3.5 transition', open && 'rotate-180')} />
        </span>
      </button>
      {open && (
        <ol className="mt-3 border-l border-slate-200 pl-4">
          {(entries ?? []).map((entry) => (
            <li key={entry.id} className="relative pb-2.5 last:pb-0">
              <span aria-hidden className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white" />
              <p className="text-xs text-slate-700">
                <span className="font-semibold text-slate-900">{humanize(entry.action)}</span> by {entry.actor}
                <span className="text-slate-400"> · {entry.entityType.replace('verification_', '')}</span>
              </p>
              <p className="font-mono text-[11px] text-slate-400">{formatTime(entry.timestamp)}</p>
            </li>
          ))}
          {entries?.length === 0 && <li className="text-xs text-slate-500">No actions recorded yet.</li>}
        </ol>
      )}
    </Card>
  );
}

export function RunDetail({
  runId,
  signedIn,
  onBack,
  onSignIn,
}: {
  runId: string;
  signedIn: boolean;
  onBack: () => void;
  onSignIn: () => void;
}) {
  const notify = useToast();
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      setRun(await api.run(runId));
    } catch (cause) {
      if (cause instanceof ApiError && cause.needsSignIn) setNeedsSignIn(true);
      else setError(cause instanceof Error ? cause.message : 'Could not load the run.');
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  const perform = useCallback<Perform>(
    async (action, success) => {
      setBusy(true);
      try {
        const result = await action();
        if (result && typeof result === 'object' && 'readiness' in result) setRun(result as Run);
        else await load();
        setVersion((value) => value + 1);
        if (success) notify(success);
      } catch (cause) {
        notify('That action did not go through', {
          tone: 'error',
          body: cause instanceof ApiError || cause instanceof Error ? cause.message : 'The action failed.',
        });
        // A failed Ring call may have raised the integration overlay - reflect it.
        await load();
      } finally {
        setBusy(false);
      }
    },
    [load, notify],
  );

  if (needsSignIn) {
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-500">
          <Lock aria-hidden className="h-4 w-4" />
        </span>
        <h1 className="mt-3 text-base font-semibold text-slate-900">Sign in to view this run</h1>
        <p className="mt-1 text-xs text-slate-500">Live runs are visible only when signed in. The recorded demo is open to everyone.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="brand" onClick={onSignIn}>
            Sign in
          </Button>
          <Button variant="ghost" onClick={onBack}>
            Back to the overview
          </Button>
        </div>
      </Card>
    );
  }

  if (!run) {
    return (
      <div className="space-y-3">
        {error && <ErrorNote message={error} onDismiss={() => setError(null)} />}
        <p className="text-[13px] text-slate-500">Loading run…</p>
      </div>
    );
  }

  const recorded = run.dataMode === 'RECORDED_DEMO';
  const ringChecks = run.checks.filter((c) => c.requirementType === 'RING_REQUIRED').length;
  const complete = run.checks.filter((c) => c.latestAttempt && ['PASS', 'OVERRIDDEN'].includes(c.latestAttempt.status)).length;
  const canApprove = run.readiness.status === 'READY_TO_APPROVE' && run.dataMode === 'LIVE';
  const armed = run.checks
    .map((c) => (c.requirementType === 'RING_REQUIRED' && c.latestAttempt?.status === 'IN_PROGRESS' && !c.latestAttempt.evidence ? c.latestAttempt : null))
    .find(Boolean);

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900">
        <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
        Overview
      </button>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={recorded ? 'orange' : 'emerald'}>{recorded ? 'Recorded demo' : 'Live playground'}</Badge>
            <Badge>{run.triggerType}</Badge>
          </div>
          <h1 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">{run.templateName}</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {plural(run.checks.length, 'check', 'checks')} · {ringChecks} {ringChecks === 1 ? 'needs' : 'need'} Ring evidence ·{' '}
            {run.startedAt ? `started ${formatTime(run.startedAt)}` : 'not started yet'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <a
            href={`#/runs/${encodeURIComponent(run.id)}/report`}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
          >
            <FileDown aria-hidden className="h-3.5 w-3.5" />
            Audit report
          </a>
          {!recorded && !run.approvedAt && !run.cancelledAt && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => perform(() => api.cancelRun(run.id), 'Run cancelled')}>
              <Ban aria-hidden className="h-3.5 w-3.5" />
              Cancel this run
            </Button>
          )}
        </div>
      </header>

      {recorded && (
        <p className="rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-900 ring-1 ring-orange-200">
          <span className="font-semibold">
            <ModeLabel label={run.dataModeLabel} />.
          </span>{' '}
          A recorded run for review - not live or current Ring data. It cannot be changed or synced.
        </p>
      )}

      {!recorded && run.readiness.integrationState === 'RECONNECT_REQUIRED' && <IntegrationBanner onReconnect={onBack} />}
      {error && <ErrorNote message={error} onDismiss={() => setError(null)} />}

      {/* Summary bar */}
      <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <ProgressRing done={complete} total={run.checks.length} />
          <div>
            <p className="text-[13px] font-semibold text-slate-900">
              {complete} of {run.checks.length} checks complete
            </p>
            <div className="mt-1" aria-live="polite">
              <RunStatusChip status={run.readiness.status} large />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          {armed?.eligibleEnd && <WindowCountdown end={armed.eligibleEnd} />}
          {canApprove && (
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <Button variant="success" disabled={busy} onClick={() => perform(() => api.approve(run.id), 'Run approved')}>
                <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
                Record approval
              </Button>
              <p className="max-w-xs text-[11px] text-slate-400 sm:text-right">
                Recorded under the signed-in identity. This build has a single login, so the operator and the approver can
                be the same person.
              </p>
            </div>
          )}
          {run.approvedAt && (
            <p className="text-xs text-slate-500">
              Approved by <span className="font-semibold text-slate-700">{run.approvalActor}</span> at {formatClock(run.approvedAt)}
            </p>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="checklist" className="space-y-3">
          <h2 id="checklist" className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-slate-500">
            <ListChecks aria-hidden className="h-4 w-4" />
            Checklist
          </h2>
          {run.checks.map((check, index) => (
            <CheckCard key={check.id} index={index + 1} run={run} check={check} busy={busy} perform={perform} onRun={setRun} />
          ))}
        </section>

        <aside className="space-y-3 lg:pt-7">
          <ReadinessPanel run={run} />
          <IncidentPanel run={run} signedIn={signedIn} busy={busy} perform={perform} />
        </aside>
      </div>

      <section aria-labelledby="copilot-title" className="space-y-3">
        <h2 id="copilot-title" className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-slate-500">
          <Sparkles aria-hidden className="h-4 w-4" />
          Handover and history
        </h2>
        <CopilotPanel key={version} run={run} signedIn={signedIn} />
        <AuditTrail runId={run.id} version={version} />
      </section>
    </div>
  );
}
