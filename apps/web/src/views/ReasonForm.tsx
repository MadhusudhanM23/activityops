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
      className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200"
      onSubmit={(event) => {
        event.preventDefault();
        if (!blocked) onSubmit(reason.trim());
      }}
    >
      <label htmlFor={id} className="block text-xs font-semibold text-slate-700">
        {label}
        {required && <span className="text-red-700"> (required)</span>}
      </label>
      <textarea
        id={id}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={placeholder}
        maxLength={1000}
        rows={2}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        autoFocus
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={blocked || busy}
          className={
            variant === 'danger'
              ? 'min-h-[40px] rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:bg-red-200'
              : variant === 'success'
                ? 'min-h-[40px] rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:bg-emerald-200'
                : 'min-h-[40px] rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-300'
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
