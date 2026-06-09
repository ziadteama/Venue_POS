import { PinLoginScreen } from './components/PinLoginScreen.jsx';
import { PosWorkspace } from './components/PosWorkspace.jsx';
import { usePosApp } from './hooks/usePosWorkspace.js';

export default function App() {
  const { t, cashierSession } = usePosApp();

  if (!cashierSession.isLoggedIn) {
    return (
      <PinLoginScreen
        t={t}
        onLogin={cashierSession.login}
        loading={cashierSession.loading}
        error={cashierSession.error}
      />
    );
  }

  return <PosWorkspace cashier={cashierSession.cashier} onLogout={cashierSession.logout} />;
}
