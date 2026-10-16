import { type ReactNode, useEffect, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { ApiError, api } from '../api.js';
import type { AiNote, AuditEntry, Run } from '../types.js';
import { Badge, Button, Logo, ModeLabel, RunStatusChip, formatTime } from '../ui.js';

/**
 * A printable verification report for one run - what a manager hands to head office
 * or an inspector. It shows recorded facts only, with the same honesty labels as the
 * app: evidence limits, OVERRIDDEN never shown as PASS, AI text labelled as a draft.
 * "Save as PDF" is the browser's own print dialog, so no PDF library is needed.
 */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid-page">
      <h2 className="border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function ReportView({ runId, onBack }: { runId: string; onBack: () => void }) {
  const [run, setRun] = useState<Run | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [notes, setNotes] = useState<AiNote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt] = useState(() => new Date().toISOString());

  useEffect(() => {
    Promise.all([api.run(runId), api.audit(runId), api.aiNotes(runId).catch(() => [])])
      .then(([r, a, n]) => {
        setRun(r);
        setAudit(a);
        setNotes(n);
      })
      .catch((cause) =>
        setError(cause instanceof ApiError && cause.needsSignIn ? 'Sign in to view this run.' : 'Could not load the report.'),
      );
  }, [runId]);

  if (error) return <p className="text-[13px] text-red-700">{error}</p>;
  if (!run) return <p className="text-[13px] text-slate-500">Preparing report…</p>;

  const evidenceLimits = run.checks.flatMap((c) => c.attempts.flatMap((a) => a.evidence?.limits ?? []));
  const limits = [...new Set(evidenceLimits)];
  const handover = notes.find((n) => n.type === 'HANDOVER');

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900">
          <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
          Back to the run
        </button>
        <Button variant="brand" onClick={() => window.print()}>
          <Printer aria-hidden className="h-3.5 w-3.5" />
          Print / Save as PDF
        </Button>
      </div>

      <article className="rounded-xl bg-white p-8 text-[12px] leading-relaxed text-slate-700 shadow-card ring-1 ring-slate-200 print:rounded-none print:p-0 print:shadow-none print:ring-0">
        <header className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
          <div>
            <Logo />
            <h1 className="mt-3 text-lg font-bold text-slate-900">Verification report</h1>
            <p className="text-sm font-semibold text-slate-800">{run.templateName}</p>
          </div>
          <div className="text-right">
            <RunStatusChip status={run.readiness.status} />
            <div className="mt-2 flex justify-end gap-1">
              <Badge tone={run.dataMode === 'RECORDED_DEMO' ? 'orange' : 'emerald'}>
                {run.dataMode === 'RECORDED_DEMO' ? 'Recorded demo' : 'Live playground'}
              </Badge>
              <Badge>{run.triggerType}</Badge>
            </div>
          </div>
        </header>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1">
          {[
            ['Run', run.id],
            ['Data', run.dataModeLabel],
            ['Started', formatTime(run.startedAt)],
            ['Approved', run.approvedAt ? `${run.approvalActor} at ${formatTime(run.approvedAt)}` : run.cancelledAt ? `Cancelled at ${formatTime(run.cancelledAt)}` : 'Not approved'],
            ['Report generated', formatTime(generatedAt)],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <dt className="w-28 shrink-0 text-slate-400">{label}</dt>
              <dd className="font-medium text-slate-800">{label === 'Data' ? <ModeLabel label={value} /> : value}</dd>
            </div>
          ))}
        </dl>

        <Section title="Readiness">
          <p>
            <span className="font-semibold text-slate-900">{run.readiness.status.replaceAll('_', ' ')}</span> - computed
            deterministically from recorded attempts, evidence and incidents. No AI is involved in this result.
          </p>
          {run.readiness.reasons.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {run.readiness.reasons.map((r, i) => (
                <li key={`${r.code}-${i}`}>{r.message}</li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Checks">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400">
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">Check</th>
                <th className="py-1 pr-2">Result</th>
                <th className="py-1 pr-2">Decided by</th>
                <th className="py-1">Evidence / note</th>
              </tr>
            </thead>
            <tbody>
              {run.checks.map((check, index) => {
                const latest = check.latestAttempt;
                return (
                  <tr key={check.id} className="break-inside-avoid border-b border-slate-100 align-top">
                    <td className="py-1.5 pr-2 text-slate-400">{index + 1}</td>
                    <td className="py-1.5 pr-2">
                      <span className="font-medium text-slate-900">{check.label}</span>
                      <span className="block text-[10px] text-slate-400">
                        {check.requirementType === 'RING_REQUIRED' ? 'Ring evidence required' : 'Manual check'} ·{' '}
                        {check.required ? 'required' : 'optional'} · {check.attempts.length}{' '}
                        {check.attempts.length === 1 ? 'attempt' : 'attempts'}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 font-semibold text-slate-900">
                      {latest ? `#${latest.attemptNumber} ${latest.statusLabel}` : 'Not started'}
                    </td>
                    <td className="py-1.5 pr-2">
                      {latest?.override ? latest.override.approvedBy : latest?.attestedBy ?? '-'}
                      <span className="block text-[10px] text-slate-400">{formatTime(latest?.override?.approvedAt ?? latest?.attestedAt)}</span>
                    </td>
                    <td className="py-1.5">
                      {latest?.evidence && (
                        <span className="block">
                          {latest.evidence.label}
                          {latest.evidence.isSimulated ? ' (SIMULATED)' : ''}: {formatTime(latest.evidence.sessionStartAt)} to{' '}
                          {formatTime(latest.evidence.sessionEndAt)}
                        </span>
                      )}
                      {latest?.override && <span className="block">OVERRIDDEN - an approved exception, not a PASS. {latest.override.reason}</span>}
                      {latest?.reason && <span className="block text-slate-500">“{latest.reason}”</span>}
                      {check.attempts
                        .filter((a) => a.id !== latest?.id && a.status === 'FAIL')
                        .map((a) => (
                          <span key={a.id} className="block text-slate-500">
                            Earlier: #{a.attemptNumber} FAIL by {a.attestedBy}
                            {a.reason ? ` - “${a.reason}”` : ''} (kept on record)
                          </span>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {limits.length > 0 && (
            <div className="mt-2 rounded-md bg-slate-50 p-2 text-[11px] text-slate-500 print:bg-transparent print:p-0">
              <span className="font-semibold text-slate-600">What Ring evidence does not establish: </span>
              {limits.join(' ')}
            </div>
          )}
        </Section>

        <Section title="Incidents">
          {run.incidents.length === 0 ? (
            <p>No incidents on this run.</p>
          ) : (
            <ul className="space-y-2">
              {run.incidents.map((incident) => (
                <li key={incident.id} className="break-inside-avoid">
                  <p>
                    <span className="font-semibold text-slate-900">
                      {incident.severity} · {incident.status.replaceAll('_', ' ')}
                    </span>{' '}
                    - {incident.checkLabel}: {incident.reason}
                  </p>
                  <ol className="ml-4 list-decimal text-[11px] text-slate-500">
                    {incident.actions.map((action, i) => (
                      <li key={`${action.createdAt}-${i}`}>
                        {action.action.replaceAll('_', ' ')} · {formatTime(action.createdAt)} ·{' '}
                        {action.actor === 'system' ? 'system (driven by an attempt)' : action.actor}
                        {action.reason ? ` · ${action.reason}` : ''}
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {handover && (
          <Section title="AI handover note (draft)">
            <p className="text-[10px] text-slate-400">
              Drafted by a read-only Strands agent from the recorded facts above
              {handover.provider === 'google' ? ' using Google Gemini (not Amazon Bedrock)' : handover.provider === 'bedrock' ? ' using Amazon Bedrock' : ''}
              {handover.recordedAt ? `, captured ${handover.recordedAt.slice(0, 10)}` : ''}. It is not a decision.
            </p>
            <p className="mt-1 whitespace-pre-wrap">{handover.text.replaceAll('**', '')}</p>
          </Section>
        )}

        <Section title="Audit trail">
          <table className="w-full border-collapse text-left text-[11px]">
            <tbody>
              {audit.map((entry) => (
                <tr key={entry.id} className="break-inside-avoid border-b border-slate-100">
                  <td className="w-48 py-1 pr-2 font-mono text-slate-400">{formatTime(entry.timestamp)}</td>
                  <td className="py-1 pr-2 font-semibold text-slate-800">{entry.action.replaceAll('_', ' ')}</td>
                  <td className="py-1 pr-2">{entry.actor}</td>
                  <td className="py-1 text-slate-400">{entry.entityType.replace('verification_', '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <footer className="mt-8 border-t border-slate-200 pt-2 text-[10px] text-slate-400">
          ActivityOps is an operations workflow tool. It is not a life-safety, emergency, medical, law-enforcement, or
          security-guarantee system. Ring session records show that a live-view session took place - not what was seen.
        </footer>
      </article>
    </div>
  );
}
