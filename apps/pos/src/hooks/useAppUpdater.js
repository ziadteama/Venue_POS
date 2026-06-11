import { useCallback, useEffect, useState } from 'react';

const hasUpdaterApi = () =>
  typeof window.venuePos?.checkForUpdates === 'function' &&
  typeof window.venuePos?.onUpdateEvent === 'function';

/**
 * Packaged POS only — electron-updater via main process IPC.
 * Checks after shift close; prompts before download/install.
 */
export function useAppUpdater() {
  const [showModal, setShowModal] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [version, setVersion] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasUpdaterApi()) return undefined;

    return window.venuePos.onUpdateEvent((channel, payload) => {
      if (channel === 'update:available') {
        setVersion(payload.version ?? '');
        setPhase('available');
        setShowModal(true);
        setError('');
      } else if (channel === 'update:downloaded') {
        setVersion(payload.version ?? '');
        setPhase('ready');
        setShowModal(true);
        setBusy(false);
        setError('');
      } else if (channel === 'update:download-progress') {
        setPhase('downloading');
        setProgress(Number(payload.percent ?? 0));
      } else if (channel === 'update:error') {
        setPhase('error');
        setError(payload.message ?? '');
        setBusy(false);
      } else if (channel === 'update:status') {
        if (payload.phase) setPhase(payload.phase);
        if (payload.version) setVersion(payload.version);
        if (payload.error) setError(payload.error);
      }
    });
  }, []);

  const checkAfterShiftClose = useCallback(async () => {
    if (!hasUpdaterApi()) return;
    try {
      await window.venuePos.checkForUpdates();
    } catch {
      // Background check — ignore UI errors
    }
  }, []);

  const downloadUpdate = useCallback(async () => {
    if (!hasUpdaterApi()) return;
    setBusy(true);
    setError('');
    try {
      await window.venuePos.downloadUpdate();
    } catch (err) {
      setPhase('error');
      setError(err?.message ?? String(err));
      setBusy(false);
    }
  }, []);

  const installUpdate = useCallback(async () => {
    if (!hasUpdaterApi()) return;
    setBusy(true);
    try {
      await window.venuePos.quitAndInstall();
    } catch (err) {
      setPhase('error');
      setError(err?.message ?? String(err));
      setBusy(false);
    }
  }, []);

  const dismissModal = useCallback(() => {
    setShowModal(false);
    if (phase === 'error') setPhase('idle');
  }, [phase]);

  return {
    showModal,
    phase,
    version,
    progress,
    error,
    busy,
    checkAfterShiftClose,
    downloadUpdate,
    installUpdate,
    dismissModal,
  };
}
