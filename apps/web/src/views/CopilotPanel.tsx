import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../api.js';
import type { AiNote, AiTraceEntry, Run } from '../types.js';
import { Badge, Button, Card, formatTime } from '../ui.js';

/**
 * Operations copilot (spec sec. 17).
 *
 * The AI explains recorded state; it cannot change anything. What is shown here:
 * saved notes with their tool trace (names, times, result summaries - never the
 * model's reasoning), and an honest message when no model is configured.
 */

function Trace({ trace }: { trace: AiTraceEntry[] }) {
  if (trace.length === 0) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-semibold text-slate-600">Tool trace ({trace.length})</summary>
      <ol className="mt-1 space-y-0.5 border-l-2 border-slate-200 pl-3 text-xs text-slate-600">
        {trace.map((entry, index) => (
          <li key={`${entry.at}-${index}`}>
            <span className="font-mono font-semibold text-slate-800">{entry.tool}</span> · {formatTime(entry.at)} ·{' '}
            {entry.ok ? entry.summary : <span className="text-red-700">refused: {entry.summary}</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}

export function CopilotPanel({ run, signedIn }: { run: Run; signedIn: boolean }) {
  const [notes, setNotes] = useState<AiNote[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    api.aiNotes(run.id).then(setNotes).catch(() => setNotes([]));
  }, [run.id]);

  useEffect(load, [load]);

  async function handover() {
    setBusy(true);
    setMessage(null);
    try {
      const answer = await api.ask(run.id, 'HANDOVER');
      if (answer.status !== 'COMPLETED') setMessage(answer.text ?? 'The assistant did not produce a note.');
      load();
    } catch (cause) {
      setMessage(cause instanceof ApiError ? cause.message : 'The assistant is unavailable.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Operations copilot</h2>
        <Badge tone="violet">Read-only</Badge>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Drafts handover notes from the recorded facts above. It cannot pass a check, resolve an incident or change
        readiness.
      </p>

      {notes.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No handover note has been generated for this run.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Badge tone="violet">AI draft</Badge>
                <span>{note.type === 'HANDOVER' ? 'Handover note' : 'Incident summary'}</span>
                <span>· {formatTime(note.createdAt)}</span>
                {note.modelId && <span>· {note.modelId}</span>}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{note.text}</p>
              <Trace trace={note.trace ?? []} />
            </li>
          ))}
        </ul>
      )}

      {signedIn && (
        <div className="mt-3">
          <Button disabled={busy} onClick={handover}>
            {busy ? 'Drafting…' : 'Create a handover note for the next manager'}
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="mt-2 rounded-md bg-violet-50 p-2 text-sm text-violet-900 ring-1 ring-violet-200">
          {message}
        </p>
      )}
    </Card>
  );
}
