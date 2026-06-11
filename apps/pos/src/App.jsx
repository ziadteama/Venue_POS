import { useCallback, useEffect, useState } from 'react';
import { PinLoginScreen } from './components/PinLoginScreen.jsx';
import { PosWorkspace } from './components/PosWorkspace.jsx';
import { SetupWizard } from './components/SetupWizard.jsx';
import { SetupReentryGate } from './components/SetupReentryGate.jsx';
import { usePosConfig } from './context/PosConfigContext.jsx';
import { usePosApp } from './hooks/usePosWorkspace.js';

export default function App() {
  const { loading, isSetupComplete } = usePosConfig();
  const [setupDone, setSetupDone] = useState(false);
  const [forceSetup, setForceSetup] = useState(false);
  const [setupReentry, setSetupReentry] = useState(false);
  const { t, cashierSession } = usePosApp();

  const openSetup = useCallback(() => {
    if (isSetupComplete) {
      setSetupReentry(true);
    } else {
      setForceSetup(true);
    }
  }, [isSetupComplete]);

  useEffect(() => {
    function onKey(e) {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        openSetup();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSetup]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-sm text-slate-400">{t('common.loading')}</p>
      </div>
    );
  }

  if (forceSetup || (!isSetupComplete && !setupDone)) {
    return (
      <SetupWizard
        onComplete={() => {
          setSetupDone(true);
          setForceSetup(false);
        }}
      />
    );
  }

  if (!cashierSession.isLoggedIn) {
    return (
      <>
        {setupReentry ? (
          <SetupReentryGate
            onCancel={() => setSetupReentry(false)}
            onApproved={() => {
              setSetupReentry(false);
              setForceSetup(true);
            }}
          />
        ) : null}
        <PinLoginScreen
          t={t}
          onLogin={cashierSession.login}
          loading={cashierSession.loading}
          error={cashierSession.error}
        />
      </>
    );
  }

  if (setupReentry) {
    return (
      <SetupReentryGate
        onCancel={() => setSetupReentry(false)}
        onApproved={() => {
          setSetupReentry(false);
          setForceSetup(true);
        }}
      />
    );
  }

  return <PosWorkspace cashier={cashierSession.cashier} onLogout={cashierSession.logout} />;
}
