import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import type { SessionInfo } from './types.js';
import { Dashboard } from './views/Dashboard.js';
import { PrivacyView } from './views/PrivacyView.js';
import { RunDetail } from './views/RunDetail.js';
import { SignIn } from './views/SignIn.js';

/** Minimal hash routing: no router dependency. */
function useRoute(): [string, (next: string) => void] {
  const read = () => window.location.hash.replace(/^#/, '') || '/';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return [route, (next) => (window.location.hash = next)];
}

const ANONYMOUS: SessionInfo = { authenticated: false, user: null, csrfToken: null };

export function App() {
  const [route, navigate] = useRoute();
  const [session, setSession] = useState<SessionInfo | null>(null);
  // Bumped after sign-in/out or Delete All Data so views reload what they show.
  const [epoch, setEpoch] = useState(0);
  const runMatch = /^\/runs\/([^/]+)$/.exec(route);

  useEffect(() => {
    api.session().then(setSession).catch(() => setSession(ANONYMOUS));
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route]);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setSession(ANONYMOUS);
    setEpoch((value) => value + 1);
    navigate('/');
  }, [navigate]);

  const signedIn = Boolean(session?.authenticated);

  let page;
  if (!session) {
    page = <p className="text-sm text-slate-600">Loading…</p>;
  } else if (route === '/signin') {
    page = (
      <SignIn
        onSignedIn={(next) => {
          setSession(next);
          setEpoch((value) => value + 1);
          navigate('/');
        }}
        onCancel={() => navigate('/')}
      />
    );
  } else if (route === '/privacy') {
    page = <PrivacyView signedIn={signedIn} onDeleted={() => setEpoch((value) => value + 1)} />;
  } else if (runMatch?.[1]) {
    page = (
      <RunDetail
        key={`${runMatch[1]}-${epoch}`}
        runId={decodeURIComponent(runMatch[1])}
        onBack={() => navigate('/')}
        onSignIn={() => navigate('/signin')}
      />
    );
  } else {
    page = (
      <Dashboard
        key={epoch}
        signedIn={signedIn}
        onOpenRun={(id) => navigate(`/runs/${encodeURIComponent(id)}`)}
        onSignIn={() => navigate('/signin')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <button type="button" onClick={() => navigate('/')} className="text-left">
            <span className="block text-base font-semibold tracking-tight">ActivityOps</span>
            <span className="block text-[11px] text-slate-400">Site verification with Ring evidence</span>
          </button>
          <nav className="flex items-center gap-3 text-xs">
            <a href="#/privacy" className="text-slate-300 underline-offset-2 hover:text-white hover:underline">
              Data practices
            </a>
            {signedIn ? (
              <button type="button" onClick={signOut} className="rounded-md px-2 py-1 text-slate-300 ring-1 ring-slate-600 hover:text-white">
                Sign out <span className="hidden sm:inline">({session?.user})</span>
              </button>
            ) : (
              <a href="#/signin" className="rounded-md px-2 py-1 text-slate-200 ring-1 ring-slate-600 hover:text-white">
                Sign in
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5">{page}</main>

      <footer className="mx-auto max-w-3xl px-4 pb-8 text-xs text-slate-500">
        ActivityOps is an operations workflow tool. It is not a life-safety, emergency, medical, law-enforcement, or
        security-guarantee system. Ring session records show that a live-view session took place - not what was seen.
      </footer>
    </div>
  );
}
