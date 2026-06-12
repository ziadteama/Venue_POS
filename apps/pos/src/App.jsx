import { useCallback, useEffect, useState } from 'react';
import { PinLoginScreen } from './components/PinLoginScreen.jsx';
import { PosWorkspace } from './components/PosWorkspace.jsx';
import { SetupWizard } from './components/SetupWizard.jsx';
import { KioskPrivilegedPinGate } from './components/KioskPrivilegedPinGate.jsx';
import { usePosConfig } from './context/PosConfigContext.jsx';
import { usePosApp } from './hooks/usePosWorkspace.js';

export default function App() {
  const { loading, isSetupComplete, forceSetup: configForceSetup, kioskMode } = usePosConfig();
  const [setupDone, setSetupDone] = useState(false);
  const [forceSetup, setForceSetup] = useState(false);
  const [privilegedGate, setPrivilegedGate] = useState(null);
  const { t, cashierSession } = usePosApp();

  const openSetupGate = useCallback(() => {
    if (kioskMode && isSetupComplete) {
      setPrivilegedGate('setup');
    } else {
      setForceSetup(true);
    }
  }, [isSetupComplete, kioskMode]);

  const openExitGate = useCallback(() => {
    if (!kioskMode) return;
    setPrivilegedGate('exit');
  }, [kioskMode]);

  useEffect(() => {
    function onKey(e) {
      if (!e.ctrlKey || !e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === 'x' && kioskMode) {
        e.preventDefault();
        e.stopPropagation();
        openExitGate();
      } else if (key === 's') {
        e.preventDefault();
        e.stopPropagation();
        openSetupGate();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [kioskMode, openExitGate, openSetupGate]);

  async function handleExitApproved() {
    setPrivilegedGate(null);
    if (window.venuePos?.pauseKiosk) {
      await window.venuePos.pauseKiosk();
    }
  }

  function handleSetupApproved() {
    setPrivilegedGate(null);
    setForceSetup(true);
  }

  if (privilegedGate) {
    return (
      <KioskPrivilegedPinGate
        mode={privilegedGate}
        onCancel={() => setPrivilegedGate(null)}
        onApproved={privilegedGate === 'exit' ? handleExitApproved : handleSetupApproved}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-sm text-slate-400">{t('common.loading')}</p>
      </div>
    );
  }

  if (configForceSetup || forceSetup || (!isSetupComplete && !setupDone)) {
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
      <PinLoginScreen
        t={t}
        onLogin={cashierSession.login}
        loading={cashierSession.loading}
        error={cashierSession.error}
        kioskMode={kioskMode}
        onOpenSetup={openSetupGate}
      />
    );
  }

  return <PosWorkspace cashier={cashierSession.cashier} onLogout={cashierSession.logout} />;
}
