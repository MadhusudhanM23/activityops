import { useCallback, useEffect, useState } from 'react';
import type { AuditEntry, Run } from '../types.js';
import { ApiError, api } from '../api.js';
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  IntegrationBanner,
  ModeLabel,
  RunStatusChip,
  formatTime,
  plural,
} from '../ui.js';
import { CheckCard } from './CheckCard.js';
import { CopilotPanel } from './CopilotPanel.js';
import { IncidentPanel } from './IncidentPanel.js';

function ReadinessPanel({ run, busy, onApprove }: { run: Run; busy: boolean; onApprove: () => void }) {
  const { readiness } = run;
  const canApprove = readiness.status === 'READY_TO_APPROVE' && run.dataMode === 'LIVE';
  const showReasons = readiness.status !== 'READY' && readiness.status !== 'READY_TO_APPROVE';

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Readiness</p>
          <div className="mt-1" aria-live="polite">
            <RunStatusChip status={readiness.status} large />
          </div>
        </div>
        {canApprove && (
          <Button variant="success" disabled={busy} onClick={onApprove}>
            Record approval
          </Button>
        )}
      </div>

      {showReasons && readiness.reasons.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-slate-800">
            {readiness.status === 'NOT_STARTED' ? 'Status' : 'Why are we not ready?'}
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {readiness.reasons.map((reason, index) => (
              <li key={`${reason.code}-${reason.checkId ?? index}`}>{reason.message}</li>
            ))}
          </ul>
        </div>
      )}

      {run.nextActions.length > 0 && !run.cancelledAt && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-slate-800">What should I do next?</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {run.nextActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </div>
      )}

      {(showReasons || run.nextActions.length > 0) && (
        <p className="mt-2 text-xs text-slate-500">
          Computed deterministically from recorded attempts, evidence and incidents. No AI is involved in this result.
        </p>
      )}

      {readiness.status === 'READY' && run.approvedAt && (
        <p className="mt-3 text-sm text-slate-700">
          Approval recorded by <span className="font-medium">{run.approvalActor}</span> at {formatTime(run.approvedAt)}.
        </p>
      )}
      {canApprove && (
        <p className="mt-3 text-xs text-slate-500">
          Approval is recorded under the signed-in identity. This build has a single login, so the operator and the
          approver can be the same person.
        </p>
      )}
    </Card>
  );
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
        <h2 className="text-base font-semibold text-slate-900">Audit trail</h2>
        <span className="text-xs font-semibold text-slate-600">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <ol className="mt-3 space-y-1 text-xs">
          {(entries ?? []).map((entry) => (
            <li key={entry.id} className="grid grid-cols-[auto_1fr] gap-x-2 border-b border-slate-100 py-1 last:border-0">
              <span className="font-mono text-slate-500">{formatTime(entry.timestamp)}</span>
              <span className="text-slate-700">
                <span className="font-semibold text-slate-900">{entry.action}</span> by {entry.actor}
                <span className="text-slate-500"> · {entry.entityType.replace('verification_', '')}</span>
              </span>
            </li>
          ))}
          {entries?.length === 0 && <li className="text-slate-600">No actions recorded yet.</li>}
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

  const perform = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const result = await action();
        if (result && typeof result === 'object' && 'readiness' in result) setRun(result as Run);
        else await load();
        setVersion((value) => value + 1);
      } catch (cause) {
        setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'The action failed.');
        // A failed Ring call may have raised the integration overlay - reflect it.
        await load();
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  if (needsSignIn) {
    return (
      <Card className="p-4">
        <h1 className="text-base font-semibold text-slate-900">Sign in to view this run</h1>
        <p className="mt-1 text-sm text-slate-600">Live runs are visible only when signed in. Review Mode is open to everyone.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={onSignIn}>
            Sign in
          </Button>
          <Button variant="ghost" onClick={onBack}>
            Back to Review Mode
          </Button>
        </div>
      </Card>
    );
  }

  if (!run) {
    return (
      <div className="space-y-3">
        {error && <ErrorNote message={error} onDismiss={() => setError(null)} />}
        <p className="text-sm text-slate-600">Loading run…</p>
      </div>
    );
  }

  const recorded = run.dataMode === 'RECORDED_DEMO';
  const ringChecks = run.checks.filter((c) => c.requirementType === 'RING_REQUIRED').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onBack}>
          ← All runs
        </Button>
      </div>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={recorded ? 'amber' : 'emerald'}>{recorded ? 'Recorded demo' : 'Live playground'}</Badge>
          <Badge>{run.triggerType}</Badge>
        </div>
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{run.templateName}</h1>
        {recorded && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            <span className="font-semibold">
              <ModeLabel label={run.dataModeLabel} />.
            </span>{' '}
            A recorded run for review - not live or current Ring data. It cannot be changed or synced.
          </p>
        )}
        <p className="text-sm text-slate-600">
          {plural(run.checks.length, 'check', 'checks')} · {ringChecks} {ringChecks === 1 ? 'needs' : 'need'} Ring
          evidence · {run.startedAt ? `started ${formatTime(run.startedAt)}` : 'not started yet'}
        </p>
      </header>

      {!recorded && run.readiness.integrationState === 'RECONNECT_REQUIRED' && (
        <IntegrationBanner onReconnect={onBack} />
      )}
      {error && <ErrorNote message={error} onDismiss={() => setError(null)} />}

      <ReadinessPanel run={run} busy={busy} onApprove={() => perform(() => api.approve(run.id))} />

      <div className="space-y-3">
        {run.checks.map((check) => (
          <CheckCard key={check.id} run={run} check={check} busy={busy} perform={perform} />
        ))}
      </div>

      <IncidentPanel run={run} busy={busy} perform={perform} />
      <CopilotPanel key={version} run={run} signedIn={signedIn} />
      <AuditTrail runId={run.id} version={version} />

      {!recorded && !run.approvedAt && !run.cancelledAt && (
        <div className="pt-2">
          <Button variant="danger" disabled={busy} onClick={() => perform(() => api.cancelRun(run.id))}>
            Cancel this run
          </Button>
        </div>
      )}
    </div>
  );
}
