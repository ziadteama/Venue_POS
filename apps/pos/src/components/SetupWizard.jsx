import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePosConfig } from '../context/PosConfigContext.jsx';

const STEPS = ['hub', 'terminal', 'printer', 'lan', 'review'];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return UUID_RE.test(String(value ?? '').trim());
}

function emptyForm(detectedLanHost = '') {
  return {
    apiUrl: '',
    terminalId: '',
    terminalSecret: '',
    venueId: '',
    kitchenPrinterHost: '',
    kitchenPrinterPort: 9100,
    receiptPrinterHost: '',
    receiptPrinterPort: 9100,
    agentLanHost: detectedLanHost,
    agentLanPort: 3456,
    isCoordinator: false,
    coordinatorFallbackEnabled: false,
    kioskMode: true,
    deviceLabel: '',
    githubUpdateToken: '',
  };
}

export function SetupWizard({ onComplete }) {
  const { t } = useTranslation();
  const { reload } = usePosConfig();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [hasGithubUpdateToken, setHasGithubUpdateToken] = useState(false);

  useEffect(() => {
    async function load() {
      if (window.venuePos?.getConfig) {
        const cfg = await window.venuePos.getConfig();
        setForm((f) => ({
          ...f,
          apiUrl: cfg.apiUrl || f.apiUrl,
          terminalId: cfg.terminalId || f.terminalId,
          terminalSecret: cfg.terminalSecret || f.terminalSecret,
          venueId: cfg.venueId || f.venueId,
          kitchenPrinterHost: cfg.kitchenPrinterHost || f.kitchenPrinterHost,
          kitchenPrinterPort: cfg.kitchenPrinterPort ?? f.kitchenPrinterPort,
          agentLanHost: cfg.agentLanHost || cfg.detectedLanHost || f.agentLanHost,
          agentLanPort: cfg.agentLanPort ?? f.agentLanPort,
          isCoordinator: cfg.isCoordinator ?? f.isCoordinator,
          coordinatorFallbackEnabled:
            cfg.coordinatorFallbackEnabled ?? f.coordinatorFallbackEnabled,
          kioskMode: cfg.kioskMode ?? f.kioskMode,
          deviceLabel: cfg.deviceLabel || f.deviceLabel,
          githubUpdateToken: '',
        }));
        setHasGithubUpdateToken(Boolean(cfg.hasGithubUpdateToken));
      } else if (window.venuePos?.detectLanHost) {
        const host = await window.venuePos.detectLanHost();
        setForm((f) => ({ ...f, agentLanHost: host || f.agentLanHost }));
      }
    }
    load();
  }, []);

  const update = useCallback((patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setTestResult(null);
    setError('');
  }, []);

  async function runTest() {
    if (!window.venuePos?.testConnection) return;
    if (!isUuid(form.terminalId)) {
      setError(t('setup.invalidTerminalId'));
      return;
    }
    setTesting(true);
    setError('');
    try {
      const result = await window.venuePos.testConnection(form);
      setTestResult(result);
    } catch (err) {
      setError(err?.message ?? t('setup.testFailed'));
    } finally {
      setTesting(false);
    }
  }

  async function saveAndFinish() {
    if (!window.venuePos?.saveConfig) return;
    if (!isUuid(form.terminalId)) {
      setError(t('setup.invalidTerminalId'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, setupComplete: true };
      if (!payload.githubUpdateToken?.trim()) {
        delete payload.githubUpdateToken;
      }
      await window.venuePos.saveConfig(payload);
      await reload();
      onComplete?.();
    } catch (err) {
      setError(err?.message ?? t('setup.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  function next() {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
  }

  function back() {
    if (step > 0) setStep((s) => s - 1);
  }

  const stepKey = STEPS[step];

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      <header className="border-b border-slate-800 px-6 py-4">
        <h1 className="text-xl font-semibold">{t('setup.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('setup.subtitle')}</p>
        <div className="mt-4 flex gap-2">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                i === step ? 'bg-emerald-600 text-white' : i < step ? 'bg-slate-700' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {t(`setup.step.${s}`)}
            </span>
          ))}
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-8">
        {stepKey === 'hub' ? (
          <section className="space-y-4">
            <label className="block">
              <span className="text-sm text-slate-300">{t('setup.apiUrl')}</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                placeholder="https://hub.example.com"
                value={form.apiUrl}
                onChange={(e) => update({ apiUrl: e.target.value })}
              />
            </label>
            <p className="text-xs text-slate-500">{t('setup.apiUrlHint')}</p>
            <label className="block">
              <span className="text-sm text-slate-300">{t('setup.githubUpdateToken')}</span>
              <input
                type="password"
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm"
                placeholder={
                  hasGithubUpdateToken ? t('setup.githubUpdateTokenKeep') : t('setup.githubUpdateTokenPlaceholder')
                }
                value={form.githubUpdateToken}
                onChange={(e) => update({ githubUpdateToken: e.target.value })}
              />
            </label>
            <p className="text-xs text-slate-500">{t('setup.githubUpdateTokenHint')}</p>
          </section>
        ) : null}

        {stepKey === 'terminal' ? (
          <section className="space-y-4">
            <label className="block">
              <span className="text-sm text-slate-300">{t('setup.terminalId')}</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm"
                value={form.terminalId}
                onChange={(e) => update({ terminalId: e.target.value })}
              />
            </label>
            <p className="text-xs text-slate-500">{t('setup.terminalIdHint')}</p>
            <label className="block">
              <span className="text-sm text-slate-300">{t('setup.terminalSecret')}</span>
              <input
                type="password"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm"
                value={form.terminalSecret}
                onChange={(e) => update({ terminalSecret: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-sm text-slate-300">{t('setup.venueId')}</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm"
                value={form.venueId}
                onChange={(e) => update({ venueId: e.target.value })}
              />
            </label>
            <button
              type="button"
              onClick={runTest}
              disabled={testing || !form.apiUrl}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-600 disabled:opacity-50"
            >
              {testing ? t('setup.testing') : t('setup.testConnection')}
            </button>
            {testResult ? (
              <ul className="space-y-1 text-sm">
                <li className={testResult.api?.ok ? 'text-emerald-400' : 'text-red-400'}>
                  {t('setup.testApi')}: {testResult.api?.ok ? t('setup.ok') : t('setup.fail')}
                </li>
                <li className={testResult.agent?.ok ? 'text-emerald-400' : 'text-amber-400'}>
                  {t('setup.testAgent')}: {testResult.agent?.ok ? t('setup.ok') : t('setup.fail')}
                </li>
                <li className={testResult.terminal?.ok ? 'text-emerald-400' : 'text-red-400'}>
                  {t('setup.testTerminal')}: {testResult.terminal?.ok ? t('setup.ok') : t('setup.fail')}
                </li>
              </ul>
            ) : null}
          </section>
        ) : null}

        {stepKey === 'printer' ? (
          <section className="space-y-4">
            <p className="text-sm text-slate-400">{t('setup.printerOptional')}</p>
            <label className="block">
              <span className="text-sm text-slate-300">{t('setup.kitchenPrinterHost')}</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                placeholder="192.168.1.50"
                value={form.kitchenPrinterHost}
                onChange={(e) => update({ kitchenPrinterHost: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-sm text-slate-300">{t('setup.kitchenPrinterPort')}</span>
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                value={form.kitchenPrinterPort}
                onChange={(e) => update({ kitchenPrinterPort: Number(e.target.value) })}
              />
            </label>
          </section>
        ) : null}

        {stepKey === 'lan' ? (
          <section className="space-y-4">
            <label className="block">
              <span className="text-sm text-slate-300">{t('setup.deviceLabel')}</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                placeholder="Till 1"
                value={form.deviceLabel}
                onChange={(e) => update({ deviceLabel: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-sm text-slate-300">{t('setup.agentLanHost')}</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                value={form.agentLanHost}
                onChange={(e) => update({ agentLanHost: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isCoordinator}
                onChange={(e) => update({ isCoordinator: e.target.checked })}
              />
              <span className="text-sm">{t('setup.isCoordinator')}</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.kioskMode}
                onChange={(e) => update({ kioskMode: e.target.checked })}
              />
              <span className="text-sm">{t('setup.kioskMode')}</span>
            </label>
          </section>
        ) : null}

        {stepKey === 'review' ? (
          <section className="space-y-2 text-sm">
            <p>
              <span className="text-slate-400">{t('setup.apiUrl')}:</span> {form.apiUrl}
            </p>
            <p>
              <span className="text-slate-400">{t('setup.terminalId')}:</span>{' '}
              <span className="font-mono">{form.terminalId}</span>
            </p>
            <p>
              <span className="text-slate-400">{t('setup.agentLanHost')}:</span> {form.agentLanHost}
            </p>
            <p>
              <span className="text-slate-400">{t('setup.kioskMode')}:</span>{' '}
              {form.kioskMode ? t('common.yes') : t('common.no')}
            </p>
            <p>
              <span className="text-slate-400">{t('setup.githubUpdateToken')}:</span>{' '}
              {form.githubUpdateToken || hasGithubUpdateToken
                ? t('setup.githubUpdateTokenConfigured')
                : t('setup.githubUpdateTokenNotSet')}
            </p>
          </section>
        ) : null}

        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      </main>

      <footer className="flex justify-between border-t border-slate-800 px-6 py-4">
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-30"
        >
          {t('common.back')}
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={next}
            className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-semibold hover:bg-emerald-500"
          >
            {t('common.next')}
          </button>
        ) : (
          <button
            type="button"
            onClick={saveAndFinish}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? t('setup.saving') : t('setup.finish')}
          </button>
        )}
      </footer>
    </div>
  );
}
