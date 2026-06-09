import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { callAgent } from '../api/agent.js';
import { parseApiError } from '../utils/apiError.js';

export function useShiftSession(cashierId) {
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
    if (!cashierId) return false;
    try {
      const ctx = await callAgent(`/v1/shifts/open-context?cashierId=${cashierId}`);
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
  }, [cashierId]);

  const refreshShift = useCallback(async () => {
    if (!cashierId) return false;
    try {
      const data = await callAgent(`/v1/shifts/active?cashierId=${cashierId}`);
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
  }, [cashierId]);

  useEffect(() => {
    if (!cashierId) {
      setShift(null);
      setLoading(false);
      return undefined;
    }
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
  }, [cashierId, refreshShift, refreshOpenContext]);

  const openShift = useCallback(
    async (openFloat) => {
      if (!cashierId) return false;
      setOpening(true);
      setError('');
      try {
        const created = await callAgent('/v1/shifts/open', {
          method: 'POST',
          body: JSON.stringify({ cashierId, openFloat: Number(openFloat) }),
        });
        setShift(created);
        setOpenChequeCount(Number(created.openChequeCount ?? 0));
        setShowOpenModal(false);
        return true;
      } catch (err) {
        setError(parseApiError(err?.message ?? err, t('pos.shiftOpenFailed')));
        return false;
      } finally {
        setOpening(false);
      }
    },
    [cashierId, t],
  );

  const closeShift = useCallback(
    async ({ closeFloat, managerPin }) => {
      if (!cashierId) return null;
      setClosing(true);
      setError('');
      try {
        const result = await callAgent('/v1/shifts/close', {
          method: 'POST',
          body: JSON.stringify({
            cashierId,
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
        const msg = parseApiError(err?.message ?? err, t('pos.shiftCloseFailed'));
        setError(msg.includes('Manager') ? t('pos.shiftManagerRequired') : msg);
        return null;
      } finally {
        setClosing(false);
      }
    },
    [cashierId, t, refreshOpenContext],
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
