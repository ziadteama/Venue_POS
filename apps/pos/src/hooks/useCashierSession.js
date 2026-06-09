import { useCallback, useState } from 'react';
import { loginWithPin } from '../api/auth.js';
import { parseApiError } from '../utils/apiError.js';
import {
  clearCashierSession,
  readCashierSession,
  writeCashierSession,
} from '../utils/cashierSession.js';

export function useCashierSession() {
  const [cashier, setCashier] = useState(() => readCashierSession());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const login = useCallback(async (pin) => {
    if (!pin || pin.length < 4) return false;
    setLoading(true);
    setError('');
    try {
      const result = await loginWithPin(pin);
      const user = result.user ?? { id: result.sub, username: null };
      const session = {
        id: user.id,
        username: user.username ?? null,
        venueId: user.venueId ?? null,
      };
      writeCashierSession(session);
      setCashier(session);
      return true;
    } catch (err) {
      setError(parseApiError(err?.message ?? err, 'Invalid PIN'));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearCashierSession();
    setCashier(null);
    setError('');
  }, []);

  return { cashier, loading, error, setError, login, logout, isLoggedIn: Boolean(cashier?.id) };
}
