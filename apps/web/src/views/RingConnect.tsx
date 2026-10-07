import { useEffect, useId, useState } from 'react';
import type { RingStatus } from '../types.js';
import { ApiError, api } from '../api.js';
import { Badge, Button, Card, ErrorNote, formatTime } from '../ui.js';

/**
 * Live Test Mode connection (spec sec. 19).
 *
 * The token is held in component state only until submit, then cleared. It is
 * never written to localStorage or the URL, never rendered back, and the server
 * keeps it in memory only. The password input type keeps it off-screen.
 */
export function RingConnect({ onConnected }: { onConnected: (templateId: string) => void }) {
  const inputId = useId();
  const [status, setStatus] = useState<RingStatus | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<{ count: number; devices: { label: string; status: string }[] } | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void api.ringStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const secondsLeft = status?.expiresAt ? Math.max(0, Math.round((Date.parse(status.expiresAt) - now) / 1000)) : null;
  const connected = Boolean(status?.connected) && (secondsLeft === null || secondsLeft > 0);

  async function connect() {
    const submitted = token;
    setToken(''); // Clear before the request resolves, success or not.
    setBusy(true);
    setError(null);
    try {
      const result = await api.ringConnect(submitted);
      setDiscovered({ count: result.devicesDiscovered, devices: result.devices });
      setStatus(await api.ringStatus());
      onConnected(result.templateId);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 422
          ? cause.message
          : cause instanceof ApiError && cause.isIntegration
            ? 'Ring did not accept that token. Generate a fresh one in the Playground and try again.'
            : 'Could not connect to Ring.',
      );
      setStatus(await api.ringStatus().catch(() => null));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setStatus(await api.ringDisconnect().then((s) => ({ ...s, integrationState: 'HEALTHY' as const })));
    setDiscovered(null);
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Live Test - connect Ring Playground</h2>
        {connected ? <Badge tone="emerald">Connected</Badge> : <Badge>Not connected</Badge>}
      </div>

      {connected ? (
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          <p>
            Session expires {formatTime(status?.expiresAt)}
            {secondsLeft !== null && (
              <span className={secondsLeft < 300 ? 'font-semibold text-amber-800' : ''}>
                {' '}
                ({Math.floor(secondsLeft / 60)}m {secondsLeft % 60}s left)
              </span>
            )}
            . Playground tokens last about 30 minutes; reconnect with a new one when it lapses.
          </p>
          {discovered && (
            <p>
              <span className="font-semibold">{discovered.count} device(s) discovered:</span>{' '}
              {discovered.devices
                .map((d) => `${d.label} (${d.status === 'AVAILABLE' ? 'online' : d.status === 'UNAVAILABLE' ? 'offline' : 'status unknown'})`)
                .join(', ')}
            </p>
          )}
          <Button variant="ghost" onClick={disconnect}>
            Disconnect and forget token
          </Button>
        </div>
      ) : (
        <form
          className="mt-3 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (token.trim()) void connect();
          }}
        >
          <label htmlFor={inputId} className="block text-sm text-slate-700">
            Paste a short-lived OAuth token from the Ring Developer Playground. It is sent once over HTTPS, kept in server
            memory only, never stored, logged, or shown again.
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={inputId}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Playground OAuth token"
              className="min-h-[40px] flex-1 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <Button type="submit" variant="primary" disabled={busy || token.trim().length === 0}>
              {busy ? 'Connecting…' : 'Connect and discover devices'}
            </Button>
          </div>
        </form>
      )}

      {error && (
        <div className="mt-3">
          <ErrorNote message={error} onDismiss={() => setError(null)} />
        </div>
      )}
    </Card>
  );
}
