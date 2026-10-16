import { useId, useState } from 'react';
import { BarChart3, Clock3, Code2, Eye, EyeOff, FileText, History, List, ListChecks, Lock, LogIn, ShieldCheck, User } from 'lucide-react';
import { ApiError, api } from '../api.js';
import type { SessionInfo } from '../types.js';
import { ErrorNote, Logo } from '../ui.js';

/** Published in the README for local runs only; the server refuses this password in production. */
const LOCAL_DEMO = { username: 'demo.operator', password: 'activityops-dev-only' };

const FEATURES = [
  { icon: FileText, title: 'Check-specific evidence', body: 'Collect and view evidence for the checks that asked for it.' },
  { icon: History, title: 'Every decision recorded', body: 'All PASS, FAIL and recheck decisions kept on record.' },
  { icon: ListChecks, title: 'A complete audit trail', body: 'See who decided what, and when, from opening to handover.' },
];

/** Decorative clipboard-and-orbit illustration for the brand panel. */
function Illustration() {
  return (
    <div aria-hidden className="pointer-events-none absolute right-8 top-1/2 hidden h-64 w-60 -translate-y-1/2 xl:block">
      <svg viewBox="0 0 240 256" className="absolute inset-0 h-full w-full">
        <ellipse cx="120" cy="140" rx="112" ry="70" fill="none" strokeWidth="1.5" strokeDasharray="4 6" transform="rotate(-24 120 140)" className="stroke-orange-400/60" />
        <circle cx="214" cy="58" r="5" className="fill-orange-400" />
        <circle cx="22" cy="206" r="5" className="fill-orange-400" />
      </svg>
      <div className="absolute left-14 top-14 -rotate-6">
      <div className="relative h-44 w-36 rounded-2xl bg-white p-3.5 pt-7 shadow-2xl ring-1 ring-white/40 motion-safe:animate-float">
        <span className="absolute -top-3 left-1/2 h-7 w-16 -translate-x-1/2 rounded-lg bg-brand-600 shadow-md">
          <span className="absolute left-1/2 top-1 h-3 w-3 -translate-x-1/2 rounded-full bg-brand-800" />
        </span>
        {[true, true, false].map((checked, index) => (
          <div key={index} className="mt-3 flex items-center gap-2">
            <span className={checked ? 'grid h-5 w-5 place-items-center rounded-md bg-orange-500 text-white' : 'h-5 w-5 rounded-md ring-2 ring-slate-300'}>
              {checked && (
                <svg viewBox="0 0 12 12" className="h-3 w-3">
                  <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="flex-1 space-y-1">
              <span className="block h-1.5 rounded-full bg-slate-300" />
              <span className="block h-1.5 w-2/3 rounded-full bg-slate-200" />
            </span>
          </div>
        ))}
      </div>
      </div>
      <span className="absolute right-6 top-0 grid h-11 w-11 place-items-center rounded-xl bg-slate-800 text-slate-300 shadow-lg ring-1 ring-white/10 motion-safe:animate-float [animation-delay:600ms]">
        <BarChart3 className="h-5 w-5" />
      </span>
      <span className="absolute -right-1 top-[118px] grid h-10 w-10 place-items-center rounded-xl bg-slate-800 text-orange-400 shadow-lg ring-1 ring-white/10 motion-safe:animate-float [animation-delay:1200ms]">
        <Clock3 className="h-5 w-5 motion-safe:animate-signal" />
      </span>
      <span className="absolute bottom-6 right-10 grid h-11 w-11 place-items-center rounded-xl bg-slate-800 text-slate-200 shadow-lg ring-1 ring-white/10 motion-safe:animate-float [animation-delay:1800ms]">
        <List className="h-5 w-5" />
      </span>
    </div>
  );
}

/**
 * Sign in for Live Test Mode. Review Mode needs no account.
 *
 * This build has a single login (spec sec. 14), so nothing here suggests roles
 * or a second approver.
 */
export function SignIn({ onSignedIn }: { onSignedIn: (session: SessionInfo) => void; onCancel: () => void }) {
  const userId = useId();
  const passId = useId();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const session = await api.login(username.trim(), password);
      setPassword('');
      onSignedIn(session);
    } catch (cause) {
      setPassword('');
      setError(
        cause instanceof ApiError && cause.status === 429
          ? cause.message
          : cause instanceof ApiError && cause.status === 401
            ? 'That username and password do not match.'
            : 'Could not sign in.',
      );
    } finally {
      setBusy(false);
    }
  }

  const field =
    'h-11 short:h-10 w-full rounded-xl border-0 bg-white pl-10 pr-3 text-[13px] text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500';

  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none fixed -left-16 top-24 -z-10 hidden h-56 w-56 rotate-12 rounded-[48px] bg-brand-100/50 md:block" />
      <div aria-hidden className="pointer-events-none fixed -right-12 bottom-16 -z-10 hidden h-48 w-48 -rotate-12 rounded-[48px] bg-orange-100/60 md:block" />

      <div className="relative mx-auto grid max-w-6xl overflow-hidden rounded-3xl bg-white shadow-lift ring-1 ring-slate-200/70 md:grid-cols-[1.3fr_1fr]">
        {/* Brand panel (desktop) */}
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-[#0f1d3a] p-8 text-white md:block lg:p-10 short:p-7 tiny:p-6">
          <svg aria-hidden viewBox="0 0 600 160" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-36 w-full">
            <defs>
              <linearGradient id="signin-wave" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#f97316" stopOpacity="0" />
                <stop offset="1" stopColor="#f97316" stopOpacity="0.55" />
              </linearGradient>
            </defs>
            <path d="M0 140 C 160 120, 300 60, 600 30 L 600 160 L 0 160 Z" fill="#1e293b" opacity="0.7" />
            <path d="M0 150 C 200 130, 360 80, 600 40" fill="none" stroke="url(#signin-wave)" strokeWidth="3" />
          </svg>
          <Illustration />

          <div className="relative max-w-sm xl:max-w-[310px]">
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-orange-300 ring-1 ring-orange-400/70">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-400 motion-safe:animate-pulse" />
              Live playground
            </span>
            <h2 className="mt-5 text-[28px] font-bold leading-tight tracking-tight short:mt-3 short:text-2xl">
              Live Test with your Ring Developer <span className="text-orange-400">Playground</span>
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-slate-300 short:mt-2">
              Connect a Playground session, run a real opening check and review evidence as it becomes available.
            </p>
          </div>

          <ul className="relative mt-8 max-w-sm space-y-5 xl:max-w-[310px] short:mt-5 short:space-y-3">
            {FEATURES.map((item) => (
              <li key={item.title} className="flex gap-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-orange-400 ring-1 ring-white/10">
                  <item.icon aria-hidden className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-[13px] font-semibold">{item.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-slate-400 tiny:hidden">{item.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Form */}
        <div className="flex flex-col justify-center px-6 py-8 sm:px-10 sm:py-10 short:py-6 tiny:py-5">
          <div className="text-center md:text-left">
            <div className="flex justify-center md:hidden short:hidden">
              <Logo />
            </div>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900 short:mt-0 md:mt-0 md:text-[28px]">
              <span className="md:hidden">Welcome back</span>
              <span className="hidden md:inline">Sign in</span>
            </h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
              <span className="md:hidden">Continue to Live Test with your Developer Playground and run checklists.</span>
              <span className="hidden md:inline">Needed for Live Test only. The recorded demo run is open to everyone - no account required.</span>
            </p>
          </div>

          <form
            className="mt-6 space-y-4 short:mt-4 short:space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (username.trim() && password) void submit();
            }}
          >
            <div>
              <label htmlFor={userId} className="block text-xs font-semibold text-slate-700">
                Username
              </label>
              <div className="relative mt-1.5">
                <User aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id={userId}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  placeholder="demo.operator"
                  className={field}
                />
              </div>
            </div>
            <div>
              <label htmlFor={passId} className="block text-xs font-semibold text-slate-700">
                Password
              </label>
              <div className="relative mt-1.5">
                <Lock aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id={passId}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={`${field} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && <ErrorNote message={error} onDismiss={() => setError(null)} />}

            <button
              type="submit"
              disabled={busy || !username.trim() || !password}
              className="group relative flex h-11 short:h-10 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-slate-900 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-orange-500 group-disabled:bg-transparent" />
              <LogIn aria-hidden className="h-4 w-4 text-orange-400 transition group-hover:translate-x-0.5 group-disabled:text-white" />
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {import.meta.env.DEV && (
            <>
              <div className="my-5 short:my-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                or
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-3 text-xs text-slate-600">
                  <Code2 aria-hidden className="h-5 w-5 shrink-0 text-slate-800" />
                  <span>
                    Local development account
                    <span className="block text-slate-400">(from the README)</span>
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setUsername(LOCAL_DEMO.username);
                    setPassword(LOCAL_DEMO.password);
                  }}
                  className="h-9 shrink-0 rounded-lg bg-white px-4 text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
                >
                  Fill demo account
                </button>
              </div>
            </>
          )}

          <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 short:mt-4 tiny:hidden">
            <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
            Your workflow. Your records. Your decision.
          </p>
        </div>
      </div>
    </div>
  );
}
