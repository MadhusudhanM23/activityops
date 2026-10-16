import { useCallback, useEffect, useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { api } from './api.js';
import { ToastProvider, useToast } from './toast.js';
import type { SessionInfo } from './types.js';
import { Logo, cx } from './ui.js';
import { Dashboard } from './views/Dashboard.js';
import { PrivacyView } from './views/PrivacyView.js';
import { ReportView } from './views/ReportView.js';
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
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

function Shell() {
  const [route, navigate] = useRoute();
  const notify = useToast();
  const [session, setSession] = useState<SessionInfo | null>(null);
  // Bumped after sign-in/out or Delete All Data so views reload what they show.
  const [epoch, setEpoch] = useState(0);
  const runMatch = /^\/runs\/([^/]+)$/.exec(route);
  const reportMatch = /^\/runs\/([^/]+)\/report$/.exec(route);

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
    notify('Signed out', { tone: 'info' });
    navigate('/');
  }, [navigate, notify]);

  const signedIn = Boolean(session?.authenticated);

  let page;
  if (!session) {
    page = <p className="text-[13px] text-slate-500">Loading…</p>;
  } else if (route === '/signin') {
    page = (
      <SignIn
        onSignedIn={(next) => {
          setSession(next);
          setEpoch((value) => value + 1);
          notify(`Signed in as ${next.user ?? 'operator'}`, { body: 'Live Test is unlocked: connect your Ring Playground next.' });
          navigate('/');
        }}
        onCancel={() => navigate('/')}
      />
    );
  } else if (route === '/privacy') {
    page = <PrivacyView signedIn={signedIn} onDeleted={() => setEpoch((value) => value + 1)} />;
  } else if (reportMatch?.[1]) {
    const id = decodeURIComponent(reportMatch[1]);
    page = <ReportView key={`${id}-${epoch}`} runId={id} onBack={() => navigate(`/runs/${encodeURIComponent(id)}`)} />;
  } else if (runMatch?.[1]) {
    page = (
      <RunDetail
        key={`${runMatch[1]}-${epoch}`}
        runId={decodeURIComponent(runMatch[1])}
        signedIn={signedIn}
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

  const navLink = (href: string, label: string, active: boolean) => (
    <a
      href={href}
      className={cx(
        'rounded-md px-2 py-1 text-[13px] font-medium transition-colors',
        active ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900',
      )}
    >
      {label}
    </a>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-5">
            <button type="button" onClick={() => navigate('/')} aria-label="ActivityOps home" className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
              <Logo />
            </button>
            <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
              {navLink('#/', 'Overview', route === '/' || Boolean(runMatch))}
              {navLink('#/privacy', 'Data practices', route === '/privacy')}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <a href="#/privacy" className="text-xs font-medium text-slate-500 hover:text-slate-900 sm:hidden">
              Data practices
            </a>
            {signedIn ? (
              <div className="flex items-center gap-2">
                <span className="hidden items-center gap-2 rounded-full bg-slate-50 py-0.5 pl-0.5 pr-2.5 text-xs text-slate-600 ring-1 ring-slate-200 sm:inline-flex">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-[10px] font-bold uppercase text-white">
                    {(session?.user ?? 'op').slice(0, 2)}
                  </span>
                  {session?.user}
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  <LogOut aria-hidden className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            ) : (
              route !== '/signin' && (
                <a
                  href="#/signin"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-[13px] font-medium text-white shadow-sm hover:bg-brand-700"
                >
                  <LogIn aria-hidden className="h-3.5 w-3.5" />
                  Sign in
                </a>
              )
            )}
          </div>
        </div>
      </header>

      <main
        className={cx(
          'mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6',
          route === '/signin' ? 'flex items-center py-4 short:py-2' : 'py-5 sm:py-6',
        )}
      >
        <div className="w-full">{page}</div>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 pb-5 pt-2 text-[11px] text-slate-400 sm:flex-row sm:justify-between sm:px-6 print:hidden">
        <p>© 2026 Madhusudhan M · MIT licensed</p>
        <p title="ActivityOps is an operations workflow tool. It is not a life-safety, emergency, medical, law-enforcement, or security-guarantee system. Ring session records show that a live-view session took place - not what was seen.">
          An operations workflow tool - not a life-safety or security-guarantee system.
        </p>
      </footer>
    </div>
  );
}
