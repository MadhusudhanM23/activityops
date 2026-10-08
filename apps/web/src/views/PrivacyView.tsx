import { useEffect, useId, useState } from 'react';
import { ApiError, api } from '../api.js';
import type { PrivacyNotice } from '../types.js';
import { Button, Card, ErrorNote, formatTime } from '../ui.js';

const CONFIRMATION = 'DELETE ALL DATA';

/**
 * Data practices notice and Delete All Data (spec sec. 16).
 *
 * The notice text comes from the server, which generates it from the
 * deployment's real configuration - so it cannot claim, for example, that
 * nothing is sent to Bedrock while an AI model is configured.
 */
export function PrivacyView({ signedIn, onDeleted }: { signedIn: boolean; onDeleted: () => void }) {
  const confirmId = useId();
  const [notice, setNotice] = useState<PrivacyNotice | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletedAt, setDeletedAt] = useState<string | null>(null);

  useEffect(() => {
    api.privacy().then(setNotice).catch(() => setError('Could not load the data-practices notice.'));
  }, []);

  async function deleteAll() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.deleteAll(typed);
      setDeletedAt(result.deletedAt);
      setTyped('');
      onDeleted();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{notice?.title ?? 'Data practices'}</h1>
      {error && <ErrorNote message={error} onDismiss={() => setError(null)} />}

      {notice?.sections.map((section) => (
        <Card key={section.heading} className="p-4">
          <h2 className="text-base font-semibold text-slate-900">{section.heading}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {section.body.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Card>
      ))}

      {signedIn && (
        <Card className="border-red-200 p-4">
          <h2 className="text-base font-semibold text-red-900">Delete all data</h2>
          <p className="mt-1 text-sm text-slate-700">
            Removes every run, check attempt, Ring-derived fact, incident, AI-generated note and audit entry, and ends the
            Ring connection. One record that a deletion happened - by whom and when - is kept. The published recorded demo
            run is then restored so Review Mode keeps working.
          </p>
          {deletedAt ? (
            <p role="status" className="mt-3 rounded-md bg-emerald-50 p-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
              All data deleted at {formatTime(deletedAt)}. The recorded demo run was restored.
            </p>
          ) : (
            <form
              className="mt-3 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (typed === CONFIRMATION) void deleteAll();
              }}
            >
              <label htmlFor={confirmId} className="block text-sm text-slate-700">
                Type <span className="font-mono font-semibold">{CONFIRMATION}</span> to confirm.
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id={confirmId}
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  autoComplete="off"
                  className="min-h-[40px] flex-1 rounded-lg border border-slate-300 px-3 font-mono text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                <Button type="submit" variant="danger" disabled={busy || typed !== CONFIRMATION}>
                  {busy ? 'Deleting…' : 'Delete all data'}
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
