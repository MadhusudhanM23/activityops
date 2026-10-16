import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Bot, ChevronDown, Sparkles, Wrench } from 'lucide-react';
import { ApiError, api } from '../api.js';
import { useToast } from '../toast.js';
import type { AiNote, AiTraceEntry, Run } from '../types.js';
import { Badge, Button, Card, CardHeader, cx, formatTime } from '../ui.js';

/**
 * Operations copilot (spec sec. 17).
 *
 * The AI explains recorded state; it cannot change anything. What is shown here:
 * saved notes with their tool trace (names, times, result summaries - never the
 * model's reasoning), and an honest message when no model is configured.
 */

/** Inline **bold** as React elements - model text is never treated as HTML. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}

/** Renders the small markdown subset models use: bold heading lines and "*"/"-" bullets. */
function NoteText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length)
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="ml-4 list-disc space-y-0.5 marker:text-slate-300">
          {bullets.map((b, i) => (
            <li key={i}>{inline(b)}</li>
          ))}
        </ul>,
      );
    bullets = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = /^[*-]\s+(.*)$/.exec(line);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flush();
    if (!line) continue;
    const heading = /^\*\*([^*]+)\*\*:?$/.exec(line);
    blocks.push(
      heading ? (
        <p key={blocks.length} className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {heading[1]}
        </p>
      ) : (
        <p key={blocks.length}>{inline(line)}</p>
      ),
    );
  }
  flush();
  return <div className="mt-2.5 space-y-1 text-[13px] leading-relaxed text-slate-700">{blocks}</div>;
}

/** Never lets a local model pass for Amazon Bedrock. */
function ProviderBadge({ provider }: { provider?: AiNote['provider'] }) {
  if (provider === 'local')
    return (
      <Badge tone="amber" title="The Strands agent ran against a model on this server, not Amazon Bedrock">
        Strands agent · local model · not Amazon Bedrock
      </Badge>
    );
  if (provider === 'google')
    return (
      <Badge tone="amber" title="The Strands agent ran against Google Gemini, not Amazon Bedrock">
        Strands agent · Google Gemini · not Amazon Bedrock
      </Badge>
    );
  if (provider === 'bedrock') return <Badge tone="sky">Strands agent · Amazon Bedrock</Badge>;
  return null;
}

function Trace({ trace }: { trace: AiTraceEntry[] }) {
  const [open, setOpen] = useState(true);
  if (trace.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg bg-white p-2.5 ring-1 ring-slate-200">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left text-[11px] font-semibold text-slate-600"
      >
        <span className="inline-flex items-center gap-1.5">
          <Wrench aria-hidden className="h-3.5 w-3.5 text-slate-400" />
          What the agent read ({trace.length} read-only tool {trace.length === 1 ? 'call' : 'calls'})
        </span>
        <ChevronDown aria-hidden className={cx('h-3.5 w-3.5 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <ol className="mt-2 space-y-1">
          {trace.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-slate-500">
              <span className="w-4 text-right font-mono text-slate-300">{index + 1}</span>
              <span className="font-mono font-semibold text-slate-800">{entry.tool}</span>
              <span>{entry.ok ? entry.summary : <span className="text-red-600">refused: {entry.summary}</span>}</span>
              <span className="text-slate-300">{formatTime(entry.at)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function CopilotPanel({ run, signedIn }: { run: Run; signedIn: boolean }) {
  const notify = useToast();
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
      else notify('Handover note drafted', { body: 'Read it below, with the tools the agent used.' });
      load();
    } catch (cause) {
      setMessage(cause instanceof ApiError ? cause.message : 'The assistant is unavailable.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="group p-4">
      <CardHeader
        icon={<Bot className="h-4 w-4 motion-safe:group-hover:animate-wiggle" />}
        title="Operations copilot"
        sub="Drafts handover notes from the recorded facts above. It cannot pass a check, resolve an incident or change readiness."
        right={<Badge tone="violet">Read-only</Badge>}
      />

      {notes.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200">
          No handover note has been generated for this run.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-xl bg-gradient-to-br from-violet-50/60 to-slate-50 p-3.5 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                <Badge tone="violet">
                  <Sparkles aria-hidden className="h-2.5 w-2.5 motion-safe:animate-twinkle" />
                  AI draft
                </Badge>
                <span className="font-medium text-slate-700">{note.type === 'HANDOVER' ? 'Handover note' : 'Incident summary'}</span>
                <span>· {formatTime(note.createdAt)}</span>
                {note.modelId && <span>· {note.modelId}</span>}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <ProviderBadge provider={note.provider} />
                {note.recordedAt && (
                  <Badge tone="amber" title="Real output from the Strands agent, captured and shipped with the recorded demo">
                    Recorded output · captured {note.recordedAt.slice(0, 10)}
                  </Badge>
                )}
              </div>
              <NoteText text={note.text} />
              <Trace trace={note.trace ?? []} />
            </li>
          ))}
        </ul>
      )}

      {signedIn && (
        <div className="mt-3">
          <Button variant="secondary" disabled={busy} onClick={handover}>
            <Sparkles aria-hidden className={cx('h-3.5 w-3.5 text-violet-500', busy && 'animate-pulse')} />
            {busy ? 'Drafting… the agent is reading this run through read-only tools' : 'Create a handover note for the next manager'}
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-900 ring-1 ring-violet-200">
          {message}
        </p>
      )}
    </Card>
  );
}
