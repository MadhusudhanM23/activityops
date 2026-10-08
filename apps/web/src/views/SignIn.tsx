import { useId, useState } from 'react';
import { ApiError, api } from '../api.js';
import type { SessionInfo } from '../types.js';
import { Button, Card, ErrorNote } from '../ui.js';

/**
 * Sign in for Live Test Mode. Review Mode needs no account.
 *
 * This build has a single login (spec sec. 14), so nothing here suggests roles
 * or a second approver.
 */
export function SignIn({ onSignedIn, onCancel }: { onSignedIn: (session: SessionInfo) => void; onCancel: () => void }) {
  const userId = useId();
  const passId = useId();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Sign in for Live Test</h1>
      <p className="text-sm text-slate-600">
        Live Test lets you connect your own Ring Developer Playground session and run checks. Review Mode needs no
        account. Hackathon judges will find the demo credentials in the project README.
      </p>
      <Card className="p-4">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (username.trim() && password) void submit();
          }}
        >
          <div>
            <label htmlFor={userId} className="block text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              id={userId}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div>
            <label htmlFor={passId} className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id={passId}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          {error && <ErrorNote message={error} onDismiss={() => setError(null)} />}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={busy || !username.trim() || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Back to Review Mode
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
