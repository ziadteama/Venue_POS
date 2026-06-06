import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { callAgent } from '../api/agent.js';
import { DEMO_CASHIER_ID } from '../constants.js';

export function useShiftSession() {
  const { t } = useTranslation();
  const [shift, setShift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);

  const refreshShift = useCallback(async () => {
    try {
      const data = await callAgent(`/v1/shifts/active?cashierId=${DEMO_CASHIER_ID}`);
      if (data?.active === false || !data?.id) {
        setShift(null);
      } else {
        setShift(data);
      }
    } catch {
      setShift(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await refreshShift();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshShift]);

  const openShift = useCallback(
    async (openFloat) => {
      setOpening(true);
      setError('');
      try {
        const created = await callAgent('/v1/shifts/open', {
          method: 'POST',
          body: JSON.stringify({ cashierId: DEMO_CASHIER_ID, openFloat: Number(openFloat) }),
        });
        setShift({ ...created, report: { expectedCash: Number(openFloat) } });
        return true;
      } catch {
        setError(t('pos.shiftOpenFailed'));
        return false;
      } finally {
        setOpening(false);
      }
    },
    [t],
  );

  const closeShift = useCallback(
    async ({ closeFloat, managerPin }) => {
      setClosing(true);
      setError('');
      try {
        const result = await callAgent('/v1/shifts/close', {
          method: 'POST',
          body: JSON.stringify({
            cashierId: DEMO_CASHIER_ID,
            closeFloat: Number(closeFloat),
            managerPin: managerPin || undefined,
          }),
        });
        setShift(null);
        setShowCloseModal(false);
        return result;
      } catch (err) {
        const msg = err?.message?.includes('Manager')
          ? t('pos.shiftManagerRequired')
          : t('pos.shiftCloseFailed');
        setError(msg);
        return null;
      } finally {
        setClosing(false);
      }
    },
    [t],
  );

  const shiftReady = Boolean(shift?.id);
  const needsOpen = !loading && !shiftReady;

  return {
    shift,
    shiftReady,
    needsOpen,
    loading,
    error,
    setError,
    opening,
    closing,
    showCloseModal,
    setShowCloseModal,
    openShift,
    closeShift,
    refreshShift,
  };
}
