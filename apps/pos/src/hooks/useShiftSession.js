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
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [openChequeCount, setOpenChequeCount] = useState(0);

  const refreshOpenContext = useCallback(async () => {
    try {
      const ctx = await callAgent(`/v1/shifts/open-context?cashierId=${DEMO_CASHIER_ID}`);
      setOpenChequeCount(Number(ctx?.openChequeCount ?? 0));
      if (ctx?.hasActiveShift && ctx.activeShift?.id) {
        setShift(ctx.activeShift);
        setShowOpenModal(false);
        return true;
      }
      return false;
    } catch {
      setOpenChequeCount(0);
      return false;
    }
  }, []);

  const refreshShift = useCallback(async () => {
    try {
      const data = await callAgent(`/v1/shifts/active?cashierId=${DEMO_CASHIER_ID}`);
      if (data?.active === false || !data?.id) {
        setShift(null);
        return false;
      }
      setShift(data);
      setShowOpenModal(false);
      return true;
    } catch {
      setShift(null);
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const hasShift = (await refreshShift()) || (await refreshOpenContext());
      if (!cancelled) {
        if (!hasShift) setShowOpenModal(true);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshShift, refreshOpenContext]);

  const openShift = useCallback(
    async (openFloat) => {
      setOpening(true);
      setError('');
      try {
        const created = await callAgent('/v1/shifts/open', {
          method: 'POST',
          body: JSON.stringify({ cashierId: DEMO_CASHIER_ID, openFloat: Number(openFloat) }),
        });
        setShift(created);
        setOpenChequeCount(Number(created.openChequeCount ?? 0));
        setShowOpenModal(false);
        return true;
      } catch (err) {
        setError(err?.message || t('pos.shiftOpenFailed'));
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
        setShowOpenModal(true);
        await refreshOpenContext();
        return result;
      } catch (err) {
        const msg = err?.message?.includes('Manager')
          ? t('pos.shiftManagerRequired')
          : err?.message || t('pos.shiftCloseFailed');
        setError(msg);
        return null;
      } finally {
        setClosing(false);
      }
    },
    [t, refreshOpenContext],
  );

  const dismissOpenModal = useCallback(() => {
    setShowOpenModal(false);
    setError('');
  }, []);

  const promptOpenModal = useCallback(async () => {
    setError('');
    await refreshOpenContext();
    setShowOpenModal(true);
  }, [refreshOpenContext]);

  const shiftReady = Boolean(shift?.id);
  const needsOpen = !loading && !shiftReady;

  return {
    shift,
    shiftReady,
    needsOpen,
    showOpenModal,
    openChequeCount,
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
    dismissOpenModal,
    promptOpenModal,
  };
}
