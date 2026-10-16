import { useEffect, useId, useState } from 'react';
import { Link2, Link2Off, Timer } from 'lucide-react';
import type { RingStatus } from '../types.js';
import { ApiError, api } from '../api.js';
import { useToast } from '../toast.js';
import { Badge, Button, Card, CardHeader, ErrorNote, cx, formatTime } from '../ui.js';

/**
 * Live Test Mode connection (spec sec. 19).
 *
 * The token is held in component state only until submit, then cleared. It is
 * never written to localStorage or the URL, never rendered back, and the server
 * keeps it in memory only. The password input type keeps it off-screen.
 */
export function RingConnect({ onConnected }: { onConnected: (templateId: string) => void }) {
  const inputId = useId();
  const noticeId = useId();
  const notify = useToast();
  const [acknowledged, setAcknowledged] = useState(false);
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
      notify('Ring Playground connected', {
        body: `${result.devicesDiscovered} ${result.devicesDiscovered === 1 ? 'device' : 'devices'} discovered. Start a run below.`,
      });
      onConnected(result.templateId);
    } catch (cause) {
      const message =
        cause instanceof ApiError && cause.status === 422
          ? cause.message
          : cause instanceof ApiError && cause.isIntegration
            ? 'Ring did not accept that token. Generate a fresh one in the Playground and try again.'
            : 'Could not connect to Ring.';
      setError(message);
      notify('Ring connection failed', { tone: 'error', body: message });
      setStatus(await api.ringStatus().catch(() => null));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setStatus(await api.ringDisconnect().then((s) => ({ ...s, integrationState: 'HEALTHY' as const })));
    setDiscovered(null);
    notify('Disconnected', { tone: 'info', body: 'The Ring token was dropped from server memory.' });
  }

  return (
    <Card className="p-4">
      <CardHeader
        icon={<Link2 className="h-4 w-4" />}
        title="Connect Ring Developer Playground"
        right={
          connected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Connected
            </span>
          ) : (
            <Badge>Not connected</Badge>
          )
        }
      />

      {connected ? (
        <div className="mt-3 space-y-2.5 text-[13px] text-slate-700">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1">
              <Timer aria-hidden className="h-3.5 w-3.5 text-slate-400" />
              Token expires {formatTime(status?.expiresAt)}
            </span>
            {secondsLeft !== null && secondsLeft < 7200 && (
              <span
                className={cx(
                  'rounded-full px-2 py-0.5 font-semibold tabular-nums ring-1 ring-inset',
                  secondsLeft < 300 ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-slate-50 text-slate-700 ring-slate-200',
                )}
              >
                {Math.floor(secondsLeft / 60)}m {String(secondsLeft % 60).padStart(2, '0')}s left
              </span>
            )}
          </div>
          {discovered && (
            <div>
              <p className="text-xs font-semibold text-slate-700">
                {discovered.count} {discovered.count === 1 ? 'device' : 'devices'} discovered
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {discovered.devices.map((d) => (
                  <li
                    key={d.label}
                    className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-700 ring-1 ring-slate-200"
                  >
                    <span
                      className={cx(
                        'h-1.5 w-1.5 rounded-full',
                        d.status === 'AVAILABLE' ? 'bg-emerald-500' : d.status === 'UNAVAILABLE' ? 'bg-amber-500' : 'bg-slate-400',
                      )}
                    />
                    {d.label} ({d.status === 'AVAILABLE' ? 'online' : d.status === 'UNAVAILABLE' ? 'offline' : 'status unknown'})
                  </li>
                ))}
              </ul>
            </div>
          )}
          {discovered?.devices.some((d) => d.status === 'UNAVAILABLE') && (
            <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              Ring reports a device offline. You can still start a run: its Ring checks will show as blocked, with an
              incident and next steps, until the device returns. Manual checks are unaffected.
            </p>
          )}
          <p className="text-xs text-slate-500">Playground tokens last about 30 minutes; reconnect with a new one when it lapses.</p>
          <Button variant="ghost" size="sm" onClick={disconnect}>
            <Link2Off aria-hidden className="h-3.5 w-3.5" />
            Disconnect and forget token
          </Button>
        </div>
      ) : (
        <form
          className="mt-3 space-y-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (token.trim() && acknowledged) void connect();
          }}
        >
          <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
            <input
              id={noticeId}
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 accent-brand-600"
            />
            <label htmlFor={noticeId} className="text-xs leading-relaxed text-slate-600">
              I have read the{' '}
              <a href="#/privacy" className="font-semibold text-brand-700 hover:underline">
                data-practices notice
              </a>
              : what Ring data is collected and stored, whether any is sent to an AI service, retention, deletion, and
              workplace-monitoring obligations.
            </label>
          </div>
          <label htmlFor={inputId} className="block text-xs text-slate-500">
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
              className="h-8 flex-1 rounded-lg border-0 px-3 text-[13px] shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500"
            />
            <Button type="submit" variant="brand" disabled={busy || !acknowledged || token.trim().length === 0}>
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
