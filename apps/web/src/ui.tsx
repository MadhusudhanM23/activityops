import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, Ban, CheckCircle2, CircleDashed, Clock3, HelpCircle, ShieldCheck, XCircle } from 'lucide-react';
import type { RunStatus } from './types.js';

/**
 * Shared primitives. Every status is conveyed by text as well as colour, and the
 * Ring integration overlay uses its own visual treatment (violet, dashed) so it
 * can never be mistaken for a statement about the site.
 */

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

/** Time of day only, for dense lists where the date is obvious. */
export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Ends operator-typed text with exactly one terminal mark, so a template that
 * appends a sentence never renders "follow.. This".
 */
export function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Renders the data-mode label with the capture date kept on one line, so
 * "2026-10-07" never breaks at a hyphen on narrow screens.
 */
export function ModeLabel({ label }: { label: string }) {
  const match = /^(.*?)(\d{4}-\d{2}-\d{2})$/.exec(label);
  if (!match) return <>{label}</>;
  return (
    <>
      {match[1]}
      <span className="whitespace-nowrap">{match[2]}</span>
    </>
  );
}

const RUN_STATUS: Record<RunStatus, { label: string; tone: string; icon: typeof Clock3 }> = {
  NOT_STARTED: { label: 'Not started', tone: 'bg-slate-100 text-slate-700 ring-slate-200', icon: CircleDashed },
  IN_PROGRESS: { label: 'In progress', tone: 'bg-brand-50 text-brand-700 ring-brand-200', icon: Clock3 },
  BLOCKED: { label: 'Blocked', tone: 'bg-amber-50 text-amber-800 ring-amber-200', icon: AlertTriangle },
  NOT_READY: { label: 'Not ready', tone: 'bg-red-50 text-red-700 ring-red-200', icon: XCircle },
  READY_TO_APPROVE: { label: 'Ready to approve', tone: 'bg-teal-50 text-teal-700 ring-teal-200', icon: ShieldCheck },
  READY: { label: 'Ready - approved', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', tone: 'bg-slate-100 text-slate-500 ring-slate-200', icon: Ban },
};

export function RunStatusChip({ status, large }: { status: RunStatus; large?: boolean }) {
  const meta = RUN_STATUS[status];
  const Icon = meta.icon;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold ring-1 ring-inset',
        large ? 'px-2.5 py-1 text-[13px]' : 'px-2 py-0.5 text-[11px]',
        meta.tone,
      )}
    >
      <Icon aria-hidden className={large ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
      {meta.label}
    </span>
  );
}

export type BadgeTone = 'slate' | 'violet' | 'amber' | 'sky' | 'emerald' | 'red' | 'teal' | 'fuchsia' | 'brand' | 'orange';

export function Badge({ children, tone = 'slate', title }: { children: ReactNode; tone?: BadgeTone; title?: string }) {
  const tones: Record<BadgeTone, string> = {
    slate: 'bg-slate-100 text-slate-600 ring-slate-200',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    sky: 'bg-sky-50 text-sky-700 ring-sky-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    teal: 'bg-teal-50 text-teal-700 ring-teal-200',
    fuchsia: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200',
    brand: 'bg-brand-50 text-brand-700 ring-brand-200',
    orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  };
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Card({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cx('rounded-xl border border-slate-200/80 bg-white shadow-card', className)}>
      {children}
    </section>
  );
}

/** Card heading row: title, optional icon, optional right-hand slot. */
export function CardHeader({ icon, title, right, sub }: { icon?: ReactNode; title: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900">
          {icon && <span className="text-slate-400">{icon}</span>}
          {title}
        </h2>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'brand';

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' }) {
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-slate-900 text-white shadow-sm hover:bg-slate-800 disabled:bg-slate-300',
    brand: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 disabled:bg-brand-200',
    success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:bg-emerald-200',
    secondary:
      'bg-white text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900 disabled:text-slate-400',
    danger: 'bg-white text-red-600 shadow-sm ring-1 ring-inset ring-red-200 hover:bg-red-50 disabled:text-red-300',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-400',
  };
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** A small "?" that explains a term on hover or focus. */
export function Hint({ text }: { text: string }) {
  return (
    <span tabIndex={0} title={text} aria-label={text} className="inline-flex cursor-help text-slate-400 hover:text-slate-600">
      <HelpCircle aria-hidden className="h-3.5 w-3.5" />
    </span>
  );
}

/** Integration overlay. Deliberately styled unlike any site-state banner. */
export function IntegrationBanner({ onReconnect }: { onReconnect?: () => void }) {
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-xl border-2 border-dashed border-violet-300 bg-violet-50 p-3 text-[13px] text-violet-900 sm:flex-row sm:items-center sm:justify-between"
    >
      <p>
        <span className="font-semibold">RECONNECT REQUIRED - Ring sync unavailable.</span>{' '}
        This is an integration problem, not evidence about the site. Checks keep their state.
      </p>
      {onReconnect && (
        <Button variant="secondary" size="sm" onClick={onReconnect} className="shrink-0">
          Reconnect Ring
        </Button>
      )}
    </div>
  );
}

export function ErrorNote({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700 ring-1 ring-red-200">
      <p>{message}</p>
      <button type="button" onClick={onDismiss} className="shrink-0 text-xs font-semibold hover:underline">
        Dismiss
      </button>
    </div>
  );
}

/** The ActivityOps mark: a clipboard with a check. */
export function Logo({ withText = true, inverted = false }: { withText?: boolean; inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 32 32" aria-hidden className="h-7 w-7 shrink-0">
        <rect width="32" height="32" rx="8" className={inverted ? 'fill-white' : 'fill-brand-600'} />
        <rect x="9" y="7" width="14" height="19" rx="3" fill="none" strokeWidth="2" className={inverted ? 'stroke-brand-600' : 'stroke-white'} />
        <rect x="12.5" y="5" width="7" height="4" rx="1.5" className={inverted ? 'fill-brand-600' : 'fill-white'} />
        <path d="M12.5 17l2.5 2.5 4.5-5" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="stroke-orange-400" />
      </svg>
      {withText && (
        <span className={cx('text-[15px] font-bold tracking-tight', inverted ? 'text-white' : 'text-slate-900')}>
          Activity<span className={inverted ? 'text-brand-100' : 'text-brand-600'}>Ops</span>
        </span>
      )}
    </span>
  );
}

/** Circular progress, drawn with SVG attributes (no inline styles - strict CSP). */
export function ProgressRing({ done, total, size = 52 }: { done: number; total: number; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total === 0 ? 0 : done / total;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${done} of ${total} checks decided`}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth="5" className="stroke-slate-100" />
      {ratio > 0 && (
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${circumference * ratio} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={ratio === 1 ? 'stroke-emerald-500' : 'stroke-brand-600'}
      />
      )}
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-slate-900 text-[12px] font-semibold">
        {Math.round(ratio * 100)}%
      </text>
    </svg>
  );
}

/** Small flat illustration for empty states. */
export function EmptyState({ title, body, kind = 'clipboard', action }: { title: string; body: string; kind?: 'clipboard' | 'calm'; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-6 text-center">
      <svg viewBox="0 0 120 80" aria-hidden className="h-16 w-24">
        <ellipse cx="60" cy="72" rx="40" ry="5" className="fill-slate-100" />
        {kind === 'clipboard' ? (
          <>
            <rect x="38" y="10" width="44" height="56" rx="7" className="fill-white stroke-brand-200" strokeWidth="2" />
            <rect x="50" y="5" width="20" height="10" rx="3" className="fill-brand-100 stroke-brand-200" strokeWidth="2" />
            <rect x="47" y="26" width="26" height="4" rx="2" className="fill-slate-200" />
            <rect x="47" y="36" width="20" height="4" rx="2" className="fill-slate-200" />
            <rect x="47" y="46" width="24" height="4" rx="2" className="fill-slate-200" />
            <circle cx="86" cy="22" r="9" className="fill-brand-50 stroke-brand-200" strokeWidth="2" />
            <path d="M82 22h8M86 18v8" className="stroke-brand-400" strokeWidth="2" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="60" cy="38" r="24" className="fill-emerald-50 stroke-emerald-200" strokeWidth="2" />
            <path d="M49 38l8 8 15-16" fill="none" className="stroke-emerald-500" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="28" cy="20" r="3" className="fill-emerald-200" />
            <circle cx="94" cy="54" r="4" className="fill-brand-100" />
          </>
        )}
      </svg>
      <p className="mt-2 text-[13px] font-semibold text-slate-800">{title}</p>
      <p className="mt-0.5 max-w-xs text-xs text-slate-500">{body}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
