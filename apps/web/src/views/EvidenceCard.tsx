import type { Evidence } from '../types.js';
import { Badge, formatTime } from '../ui.js';

/**
 * The Ring evidence card (spec sec. 5).
 *
 * The label is fixed server-side - "Ring session observed during this check
 * window" - and the limits of what it proves are always on screen, not hidden in
 * a tooltip. A session record is not a statement that anything was seen.
 */
export function EvidenceCard({ evidence, attemptNumber }: { evidence: Evidence; attemptNumber: number }) {
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3">
      {/* The marker shares a row with the label, so it can never wrap onto a line of its own. */}
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-[3px] h-2 w-2 shrink-0 rounded-full bg-sky-600" />
        <p className="text-sm font-semibold leading-snug text-sky-900">
          {evidence.label}
          {evidence.isSimulated && (
            <span className="ml-2 inline-block align-middle">
              <Badge tone="fuchsia" title="Produced in the Ring Developer Playground, not by a real installation">
                Simulated
              </Badge>
            </span>
          )}
        </p>
      </div>

      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-slate-700 sm:grid-cols-2">
        <div>
          <dt className="inline text-slate-500">Session started: </dt>
          <dd className="inline font-medium">{formatTime(evidence.sessionStartAt)}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Session ended: </dt>
          <dd className="inline font-medium">{evidence.sessionEndAt ? formatTime(evidence.sessionEndAt) : 'not reported'}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Bound to: </dt>
          <dd className="inline font-medium">attempt #{attemptNumber} only</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Provider record: </dt>
          <dd className="inline font-mono">{evidence.providerEventRef}</dd>
        </div>
      </dl>

      <div className="mt-2 border-t border-sky-200 pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">What this does not establish</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
          {evidence.limits.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
