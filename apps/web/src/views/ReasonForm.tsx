import { useId, useState } from 'react';
import { Button } from '../ui.js';

/**
 * Inline reason capture for FAIL, override and dismissal.
 *
 * Operator text is stored as data and later passed to the AI only as delimited,
 * untrusted content (spec sec. 17) - nothing typed here is ever treated as an
 * instruction.
 */
export function ReasonForm({
  label,
  placeholder,
  submitLabel,
  required = true,
  variant = 'primary',
  busy,
  onSubmit,
  onCancel,
}: {
  label: string;
  placeholder?: string;
  submitLabel: string;
  required?: boolean;
  variant?: 'primary' | 'danger' | 'success';
  busy?: boolean;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [reason, setReason] = useState('');
  const blocked = required && reason.trim().length === 0;

  return (
    <form
      className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200 animate-fade-in"
      onSubmit={(event) => {
        event.preventDefault();
        if (!blocked) onSubmit(reason.trim());
      }}
    >
      <label htmlFor={id} className="block text-xs font-semibold text-slate-700">
        {label}
        {required && <span className="font-normal text-red-600"> (required)</span>}
      </label>
      <textarea
        id={id}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={placeholder}
        maxLength={1000}
        rows={2}
        className="w-full rounded-lg border-0 px-2.5 py-1.5 text-[13px] shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500"
        autoFocus
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={blocked || busy}
          className={
            variant === 'danger'
              ? 'h-8 rounded-lg bg-red-600 px-3 text-[13px] font-medium text-white shadow-sm hover:bg-red-700 disabled:bg-red-200'
              : variant === 'success'
                ? 'h-8 rounded-lg bg-emerald-600 px-3 text-[13px] font-medium text-white shadow-sm hover:bg-emerald-700 disabled:bg-emerald-200'
                : 'h-8 rounded-lg bg-slate-900 px-3 text-[13px] font-medium text-white shadow-sm hover:bg-slate-800 disabled:bg-slate-300'
          }
        >
          {submitLabel}
        </button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
