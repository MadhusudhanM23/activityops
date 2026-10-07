import type { ButtonHTMLAttributes, ReactNode } from 'react';
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

const RUN_STATUS: Record<RunStatus, { label: string; tone: string }> = {
  NOT_STARTED: { label: 'Not started', tone: 'bg-slate-100 text-slate-700 ring-slate-300' },
  IN_PROGRESS: { label: 'In progress', tone: 'bg-sky-50 text-sky-800 ring-sky-300' },
  BLOCKED: { label: 'Blocked', tone: 'bg-amber-50 text-amber-900 ring-amber-400' },
  NOT_READY: { label: 'Not ready', tone: 'bg-red-50 text-red-800 ring-red-300' },
  READY_TO_APPROVE: { label: 'Ready to approve', tone: 'bg-teal-50 text-teal-800 ring-teal-300' },
  READY: { label: 'Ready - approved', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
  CANCELLED: { label: 'Cancelled', tone: 'bg-slate-100 text-slate-500 ring-slate-300' },
};

export function RunStatusChip({ status, large }: { status: RunStatus; large?: boolean }) {
  const meta = RUN_STATUS[status];
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full font-semibold ring-1 ring-inset',
        large ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs',
        meta.tone,
      )}
    >
      {meta.label}
    </span>
  );
}

export function Badge({
  children,
  tone = 'slate',
  title,
}: {
  children: ReactNode;
  tone?: 'slate' | 'violet' | 'amber' | 'sky' | 'emerald' | 'red' | 'teal' | 'fuchsia';
  title?: string;
}) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-300',
    violet: 'bg-violet-50 text-violet-800 ring-violet-300',
    amber: 'bg-amber-50 text-amber-900 ring-amber-300',
    sky: 'bg-sky-50 text-sky-800 ring-sky-300',
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
    red: 'bg-red-50 text-red-800 ring-red-300',
    teal: 'bg-teal-50 text-teal-800 ring-teal-300',
    fuchsia: 'bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-300',
  };
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>{children}</section>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

export function Button({
  variant = 'secondary',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-300',
    success: 'bg-emerald-700 text-white hover:bg-emerald-600 disabled:bg-emerald-200',
    secondary:
      'bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
    danger: 'bg-white text-red-700 ring-1 ring-inset ring-red-300 hover:bg-red-50 disabled:text-red-300',
    ghost: 'text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
  };
  return (
    <button
      type="button"
      className={cx(
        'inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1',
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

/** Integration overlay. Deliberately styled unlike any site-state banner. */
export function IntegrationBanner({ onReconnect }: { onReconnect?: () => void }) {
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-xl border-2 border-dashed border-violet-400 bg-violet-50 p-3 text-sm text-violet-900 sm:flex-row sm:items-center sm:justify-between"
    >
      <p>
        <span className="font-semibold">RECONNECT REQUIRED - Ring sync unavailable.</span>{' '}
        This is an integration problem, not evidence about the site. Checks keep their state.
      </p>
      {onReconnect && (
        <Button variant="secondary" onClick={onReconnect} className="shrink-0">
          Reconnect Ring
        </Button>
      )}
    </div>
  );
}

export function ErrorNote({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
      <p>{message}</p>
      <button type="button" onClick={onDismiss} className="font-semibold underline-offset-2 hover:underline">
        Dismiss
      </button>
    </div>
  );
}
