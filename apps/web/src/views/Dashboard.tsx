import { useCallback, useEffect, useState } from 'react';
import type { RunSummary, Template } from '../types.js';
import { api } from '../api.js';
import { Badge, Button, Card, ErrorNote, ModeLabel, RunStatusChip, formatTime } from '../ui.js';
import { RingConnect } from './RingConnect.js';

export function Dashboard({ onOpenRun }: { onOpenRun: (id: string) => void }) {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [runList, templateList] = await Promise.all([api.runs(), api.templates()]);
      setRuns(runList);
      // Recorded templates exist only to back the review run; starting new runs uses live ones.
      const live = templateList.filter((t) => !t.id.startsWith('template-recorded'));
      setTemplates(live);
      setTemplateId((current) => current || live[0]?.id || '');
    } catch {
      setError('Could not load runs.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function startRun() {
    if (!templateId) return;
    setBusy(true);
    setError(null);
    try {
      const run = await api.createRun(templateId);
      onOpenRun(run.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start a run.');
    } finally {
      setBusy(false);
    }
  }

  const recorded = runs?.filter((r) => r.dataMode === 'RECORDED_DEMO') ?? [];
  const live = runs?.filter((r) => r.dataMode === 'LIVE') ?? [];

  return (
    <div className="space-y-5">
      <section className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Opening, closing and handover checks</h1>
        <p className="text-sm text-slate-600">
          ActivityOps records the check, the Ring evidence, the operator decision, and what still needs action.
        </p>
      </section>

      {error && <ErrorNote message={error} onDismiss={() => setError(null)} />}

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Review Mode</h2>
          <Badge tone="amber">Recorded demo</Badge>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          A complete recorded run you can inspect without a Ring token: evidence, a failed attempt and its recheck, an
          incident through to resolution, an override, approval, and the audit trail.
        </p>
        <ul className="mt-3 space-y-2">
          {recorded.map((run) => (
            <RunRow key={run.id} run={run} onOpen={onOpenRun} />
          ))}
          {runs && recorded.length === 0 && <li className="text-sm text-slate-600">No recorded run is loaded.</li>}
        </ul>
      </Card>

      <RingConnect onConnected={(id) => { setTemplateId(id); void load(); }} />

      <Card className="p-4">
        <h2 className="text-base font-semibold text-slate-900">Live runs</h2>
        {templates.length > 0 ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="template">
              Checklist
            </label>
            <select
              id="template"
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
              className="min-h-[40px] flex-1 rounded-lg border border-slate-300 bg-white px-2 text-sm"
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.checkCount} checks)
                </option>
              ))}
            </select>
            <Button variant="primary" disabled={busy || !templateId} onClick={startRun}>
              Start a new run
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            Connect Ring above to discover devices. The live checklist is built from whatever devices the account returns.
          </p>
        )}
        <ul className="mt-3 space-y-2">
          {live.map((run) => (
            <RunRow key={run.id} run={run} onOpen={onOpenRun} />
          ))}
        </ul>
      </Card>
    </div>
  );
}

function RunRow({ run, onOpen }: { run: RunSummary; onOpen: (id: string) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(run.id)}
        className="flex w-full flex-col gap-1 rounded-lg border border-slate-200 p-3 text-left hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:flex-row sm:items-center sm:justify-between"
      >
        <span>
          <span className="block font-medium text-slate-900">{run.templateName}</span>
          <span className="block text-xs text-slate-500">
            {run.dataMode === 'RECORDED_DEMO' ? (
              <ModeLabel label={run.dataModeLabel} />
            ) : run.startedAt
                ? `Started ${formatTime(run.startedAt)}`
                : 'Not started yet'}
          </span>
        </span>
        <RunStatusChip status={run.status} />
      </button>
    </li>
  );
}
