import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  ClipboardList,
  KeyRound,
  ListChecks,
  Lock,
  PlayCircle,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Zap,
} from 'lucide-react';
import type { RunSummary, Template } from '../types.js';
import { api } from '../api.js';
import { useToast } from '../toast.js';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorNote, ModeLabel, RunStatusChip, cx, formatTime } from '../ui.js';
import { RingConnect } from './RingConnect.js';

const STEPS = [
  { icon: ListChecks, title: 'Start a run', body: 'Pick the opening, closing or handover checklist for the site.' },
  { icon: Radio, title: 'Collect Ring evidence', body: 'A live-view session inside the check window is bound to the check as evidence.' },
  { icon: UserCheck, title: 'A person decides', body: 'PASS or FAIL is an operator decision. A FAIL opens an incident; a recheck never erases it.' },
  { icon: ShieldCheck, title: 'Readiness and audit', body: 'Readiness is computed and explained in plain language; every action is in the audit trail.' },
];

const LIVE_GUIDE = [
  { icon: KeyRound, text: 'In the Ring Developer Playground, copy the one-click OAuth token (it lasts 30 minutes).' },
  { icon: Zap, text: 'Paste it here and connect. Your devices become a live checklist.' },
  { icon: PlayCircle, text: 'Start a run, then press Start Ring check. A 5-minute check window opens.' },
  { icon: Radio, text: 'In the Playground, under "Simulate live view event", pick any event.' },
  { icon: RefreshCw, text: 'Back here, press Sync Ring history. The session is bound and Record PASS unlocks.' },
];

export function Dashboard({
  signedIn,
  onOpenRun,
  onSignIn,
}: {
  signedIn: boolean;
  onOpenRun: (id: string) => void;
  onSignIn: () => void;
}) {
  const notify = useToast();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Anonymous visitors see Review Mode only; templates need a session.
      const [runList, fetched] = await Promise.all([api.runs(), signedIn ? api.templates() : []]);
      setRuns(runList);
      let templateList = fetched;
      // Opening, closing, handover - the order a site's day runs in.
      const order = ['OPENING', 'CLOSING', 'HANDOVER'];
      templateList = [...templateList].sort((x, y) => order.indexOf(x.triggerType) - order.indexOf(y.triggerType));
      setTemplates(templateList);
      setTemplateId((current) => current || templateList[0]?.id || '');
    } catch {
      setError('Could not load runs.');
    }
  }, [signedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  async function startRun() {
    if (!templateId) return;
    setBusy(true);
    setError(null);
    try {
      const run = await api.createRun(templateId);
      notify('Run started', { body: 'Work through the checks below. Readiness updates as you go.' });
      onOpenRun(run.id);
    } catch (cause) {
      notify('Could not start a run', { tone: 'error', body: cause instanceof Error ? cause.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  const recorded = runs?.filter((r) => r.dataMode === 'RECORDED_DEMO') ?? [];
  const live = runs?.filter((r) => r.dataMode === 'LIVE') ?? [];
  const demo = recorded[0];
  const goLive = () => (signedIn ? document.getElementById('live')?.scrollIntoView({ behavior: 'smooth' }) : onSignIn());

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white px-5 py-6 shadow-card sm:px-8 sm:py-8">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-50" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 right-24 h-48 w-48 rounded-full bg-emerald-50" />
        <div className="relative grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-200">
            <ClipboardList aria-hidden className="h-3 w-3" />
            Opening · closing · shift handover
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px] sm:leading-tight">
            Site checks your team can <span className="text-brand-600">prove</span>.
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600 sm:text-sm">
            ActivityOps records the check, the Ring evidence, the operator decision, and what still needs action - so
            anyone can later see that the store was opened properly, what failed, and who decided it was ready.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="brand" disabled={!demo} onClick={() => demo && onOpenRun(demo.id)}>
              Open the recorded run <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            </Button>
            <Button onClick={goLive}>{signedIn ? 'Go to Live Test' : 'Sign in to try it live'}</Button>
          </div>
        </div>
        <HeroPreview />
        </div>
      </section>

      {error && <ErrorNote message={error} onDismiss={() => setError(null)} />}

      {/* Two ways in */}
      <section aria-label="Start here" className="grid gap-3 md:grid-cols-2">
        <PathCard
          accent="orange"
          badge={<Badge tone="orange">Recorded demo</Badge>}
          meta="2 minutes · no sign-in"
          title="See a finished run"
          body="An opening check captured from the Ring Playground: real Ring evidence, a FAIL and its recheck, an incident through to resolution, an AI handover note and the full audit trail."
          footer={
            demo ? (
              <button
                type="button"
                onClick={() => onOpenRun(demo.id)}
                className="group flex w-full items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-left ring-1 ring-orange-200 transition hover:ring-orange-300"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-slate-900">{demo.templateName}</span>
                  <span className="block truncate text-[11px] text-slate-500">
                    <ModeLabel label={demo.dataModeLabel} />
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <RunStatusChip status={demo.status} />
                  <ChevronRight aria-hidden className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" />
                </span>
              </button>
            ) : (
              <p className="text-xs text-slate-500">{runs ? 'No recorded run is loaded.' : 'Loading…'}</p>
            )
          }
        />
        <PathCard
          accent="brand"
          badge={<Badge tone="brand">Live playground</Badge>}
          meta="About 5 minutes · sign-in and a Ring Playground token"
          title="Try it live"
          body="Connect your Ring Developer Playground, start a run, trigger a live-view session and watch it unlock PASS - then fail a check, recheck it and approve the run."
          footer={
            <Button variant="brand" className="w-full" onClick={goLive}>
              {signedIn ? 'Go to Live Test' : 'Sign in to start'} <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            </Button>
          }
        />
      </section>

      {/* How it works */}
      <section aria-labelledby="how" className="space-y-3">
        <h2 id="how" className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
          How a run works
        </h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="group relative rounded-xl border border-slate-200/80 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-600">
                  <step.icon aria-hidden className={cx('h-4 w-4', step.icon === Radio ? 'motion-safe:animate-signal' : 'motion-safe:group-hover:animate-wiggle')} />
                </span>
                <span className="text-[11px] font-semibold text-slate-400">Step {index + 1}</span>
              </div>
              <p className="mt-2 text-[13px] font-semibold text-slate-900">{step.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Who it's for */}
      <section aria-labelledby="who" className="space-y-3">
        <h2 id="who" className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
          Who it is for
        </h2>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card className="p-4">
            <p className="text-[13px] font-semibold text-slate-900">Small multi-site operators that already own Ring cameras</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Franchise cafés, pharmacies, convenience and retail chains, and managed offices. Each site opens, closes and
              hands over every day, usually on a paper sheet or a spreadsheet tick that proves nothing. The owner finds out
              a check was skipped only after a loss, a failed inspection or an insurance claim.
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                ['Store manager', 'Opens the site with a checklist that cannot be ticked without doing the check.'],
                ['Area manager', 'Sees which of 20 sites is ready by 7:15, and who decided it.'],
                ['Owner or auditor', 'Gets a printable record of what happened, when, and by whom.'],
              ].map(([who, what]) => (
                <li key={who} className="rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-200">
                  <p className="text-xs font-semibold text-slate-900">{who}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{what}</p>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-4">
            <p className="text-[13px] font-semibold text-slate-900">Why Ring, and why not AI detection</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              The camera is already at the door. ActivityOps uses its Event History as a timestamped witness that a
              walkthrough happened in the right window, not as a judge of what was seen. The person stays accountable
              for the decision, and the record is honest about its limits. That keeps the product usable with staff and
              the public on camera, and keeps it out of life-safety and security-guarantee territory.
            </p>
            <p className="mt-3 text-[11px] text-slate-500">
              Built for the Ring Appstore model: a site operator connects their own Ring account; nothing leaves the
              operator's deployment except the facts shown on screen.
            </p>
          </Card>
        </div>
      </section>

      {/* Live Test */}
      <section id="live" aria-labelledby="live-title" className="scroll-mt-20 space-y-3">
        <h2 id="live-title" className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
          Live Test
        </h2>
        {!signedIn ? (
          <Card className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                <Lock aria-hidden className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-slate-900">Sign in to run checks against live Ring data</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Connect your own Ring Developer Playground session. Judges: demo credentials are in the project README.
                </p>
              </div>
            </div>
            <Button variant="brand" onClick={onSignIn}>
              Sign in for Live Test
            </Button>
          </Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-3">
              <RingConnect
                onConnected={(id) => {
                  setTemplateId(id);
                  void load();
                }}
              />
              <Card className="p-4">
                <CardHeader
                  icon={<ListChecks className="h-4 w-4" />}
                  title="Live runs"
                  sub="Each run is a fresh, immutable record. Start one when you are ready to check the site."
                />
                {templates.length > 0 ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <label className="sr-only" htmlFor="template">
                      Checklist
                    </label>
                    <select
                      id="template"
                      value={templateId}
                      onChange={(event) => setTemplateId(event.target.value)}
                      className="h-8 flex-1 rounded-lg border-0 bg-white px-2 text-[13px] text-slate-800 shadow-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-brand-500"
                    >
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name} ({template.checkCount} checks)
                        </option>
                      ))}
                    </select>
                    <Button variant="brand" disabled={busy || !templateId} onClick={startRun}>
                      <PlayCircle aria-hidden className="h-3.5 w-3.5" />
                      Start a new run
                    </Button>
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200">
                    Connect Ring above to discover devices. The live checklist is built from whatever devices the account
                    returns.
                  </p>
                )}
                {live.length > 0 ? (
                  <ul className="mt-3 divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                    {live.map((run) => (
                      <RunRow key={run.id} run={run} onOpen={onOpenRun} />
                    ))}
                  </ul>
                ) : (
                  templates.length > 0 && (
                    <EmptyState title="No live runs yet" body="Start your first opening check above to see it here." />
                  )
                )}
              </Card>
            </div>

            <Card className="h-fit p-4 lg:sticky lg:top-20">
              <CardHeader icon={<Radio className="h-4 w-4 text-brand-500 motion-safe:animate-signal" />} title="How a live Ring check works" />
              <ol className="mt-3 space-y-2.5">
                {LIVE_GUIDE.map((step, index) => (
                  <li key={step.text} className="flex gap-2.5">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                      {index + 1}
                    </span>
                    <p className="text-xs leading-relaxed text-slate-600">{step.text}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-3 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800 ring-1 ring-amber-200">
                A session that starts outside the check window does not count. If the window closes, record FAIL and start
                a recheck - the failure stays on record.
              </p>
            </Card>
          </div>
        )}
      </section>
    </div>
  );
}

/** A static miniature of the recorded demo run - the same facts Review Mode shows. Decorative. */
function HeroPreview() {
  const rows = [
    { icon: Check, tone: 'bg-emerald-500', label: 'Front entrance live-view walkthrough', note: 'Ring session observed in the check window' },
    { icon: Check, tone: 'bg-emerald-500', label: 'Alarm panel disarmed and zones reviewed', note: 'Attempt #1 FAIL kept on record · #2 PASS' },
    { icon: Check, tone: 'bg-emerald-500', label: 'Cash counter float counted', note: 'Operator-attested PASS' },
    { icon: ShieldAlert, tone: 'bg-fuchsia-500', label: 'Previous shift notes reviewed', note: 'OVERRIDDEN by approver - not a PASS' },
  ];
  return (
    <div aria-hidden className="relative hidden lg:block">
      <div className="absolute inset-x-6 -bottom-3 top-6 rounded-xl bg-brand-100/60" />
      <div className="relative rounded-xl border border-slate-200 bg-white p-3.5 shadow-lift motion-safe:animate-float">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-600">Recorded demo · preview</p>
            <p className="text-[13px] font-semibold text-slate-900">Opening readiness</p>
          </div>
          <RunStatusChip status="READY" />
        </div>
        <div className="mt-2.5 h-1.5 rounded-full bg-emerald-500" />
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.label} className="flex items-start gap-2">
              <span className={cx('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-white', row.tone)}>
                <row.icon className="h-2.5 w-2.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium text-slate-800">{row.label}</span>
                <span className="block truncate text-[10px] text-slate-500">{row.note}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1.5 text-[10px] text-violet-800 ring-1 ring-violet-100">
          <Sparkles className="h-3 w-3 motion-safe:animate-twinkle" />
          AI handover note drafted by a Strands agent · 6 read-only tool calls
        </div>
      </div>
    </div>
  );
}

function PathCard({
  accent,
  badge,
  meta,
  title,
  body,
  footer,
}: {
  accent: 'orange' | 'brand';
  badge: ReactNode;
  meta: string;
  title: string;
  body: string;
  footer: ReactNode;
}) {
  return (
    <div
      className={cx(
        'flex min-w-0 flex-col rounded-xl border p-4 shadow-card',
        accent === 'orange' ? 'border-orange-200 bg-gradient-to-br from-orange-50/80 to-white' : 'border-brand-200 bg-gradient-to-br from-brand-50/80 to-white',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {badge}
        <span className="text-[11px] text-slate-500">{meta}</span>
      </div>
      <h3 className="mt-2 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-slate-600">{body}</p>
      <div className="mt-3">{footer}</div>
    </div>
  );
}

function RunRow({ run, onOpen }: { run: RunSummary; onOpen: (id: string) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(run.id)}
        className="group flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
      >
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-slate-900">{run.templateName}</span>
          <span className="block text-[11px] text-slate-500">
            {run.dataMode === 'RECORDED_DEMO' ? (
              <ModeLabel label={run.dataModeLabel} />
            ) : run.startedAt ? (
              `Started ${formatTime(run.startedAt)}`
            ) : (
              'Not started yet'
            )}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <RunStatusChip status={run.status} />
          <ChevronRight aria-hidden className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
        </span>
      </button>
    </li>
  );
}
