import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const AGENT_URL = import.meta.env.VITE_LOCAL_AGENT_URL ?? 'http://127.0.0.1:3456';

export default function App() {
  const { t, i18n } = useTranslation();
  const [agentStatus, setAgentStatus] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function checkAgent() {
      try {
        if (window.venuePos?.getAgentHealth) {
          setAgentStatus(await window.venuePos.getAgentHealth());
          return;
        }
        const res = await fetch(`${AGENT_URL}/health`);
        setAgentStatus(await res.json());
      } catch {
        setError(t('pos.offline'));
      }
    }
    checkAgent();
    const id = setInterval(checkAgent, 10000);
    return () => clearInterval(id);
  }, [t]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between bg-slate-800 px-6 py-4">
        <h1 className="text-2xl font-bold">{t('pos.title')}</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => i18n.changeLanguage('en')}
            className="min-h-touch min-w-touch rounded bg-slate-700 px-4 py-2"
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => i18n.changeLanguage('ar')}
            className="min-h-touch min-w-touch rounded bg-slate-700 px-4 py-2"
          >
            ع
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-amber-600 px-6 py-3 text-center font-medium">{error}</div>
      )}

      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <p className="text-slate-400">{t('pos.connecting')}</p>
        {agentStatus && (
          <pre className="rounded-lg bg-slate-800 p-4 text-sm">
            {JSON.stringify(agentStatus, null, 2)}
          </pre>
        )}
        <p className="text-slate-500">Phase 0 shell — order UI in Phase 1</p>
      </main>
    </div>
  );
}
