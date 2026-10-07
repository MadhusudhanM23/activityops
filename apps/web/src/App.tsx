import { useEffect, useState } from 'react';
import { Dashboard } from './views/Dashboard.js';
import { RunDetail } from './views/RunDetail.js';

/** Minimal hash routing: `#/` dashboard, `#/runs/<id>` run detail. No router dependency. */
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

export function App() {
  const [route, navigate] = useRoute();
  const runMatch = /^\/runs\/([^/]+)$/.exec(route);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <button type="button" onClick={() => navigate('/')} className="text-left">
            <span className="block text-base font-semibold tracking-tight">ActivityOps</span>
            <span className="block text-[11px] text-slate-400">Site verification with Ring evidence</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5">
        {runMatch?.[1] ? (
          <RunDetail runId={decodeURIComponent(runMatch[1])} onBack={() => navigate('/')} />
        ) : (
          <Dashboard onOpenRun={(id) => navigate(`/runs/${encodeURIComponent(id)}`)} />
        )}
      </main>

      <footer className="mx-auto max-w-3xl px-4 pb-8 text-xs text-slate-500">
        ActivityOps is an operations workflow tool. It is not a life-safety, emergency, medical, law-enforcement, or
        security-guarantee system. Ring session records show that a live-view session took place - not what was seen.
      </footer>
    </div>
  );
}
