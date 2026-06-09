import { useCallback, useEffect, useState } from 'react';
import { callAgent } from '../api/agent.js';
import { OverlayPortal } from './ModalFrame.jsx';

export function SyncFailedModal({ t, open, onClose, agentRefresh }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await callAgent('/v1/sync/failed');
      setJobs(Array.isArray(data?.jobs) ? data.jobs : []);
    } catch (err) {
      setError(err.message ?? t('pos.syncFailedLoadError'));
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function retry(jobId) {
    setBusyId(jobId);
    setError('');
    try {
      await callAgent(`/v1/sync/failed/${jobId}/retry`, { method: 'POST' });
      await load();
      agentRefresh?.();
    } catch (err) {
      setError(err.message ?? t('pos.syncFailedRetryError'));
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(jobId) {
    setBusyId(jobId);
    setError('');
    try {
      await callAgent(`/v1/sync/failed/${jobId}/dismiss`, { method: 'POST' });
      await load();
      agentRefresh?.();
    } catch (err) {
      setError(err.message ?? t('pos.syncFailedDismissError'));
    } finally {
      setBusyId(null);
    }
  }

  if (!open) return null;

  return (
    <OverlayPortal layer="stacked" className="fixed inset-0 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{t('pos.syncFailedTitle')}</h3>
          <p className="mt-1 text-sm text-slate-500">{t('pos.syncFailedHint')}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error ? (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {loading ? (
            <p className="text-sm text-slate-500">{t('common.loading')}</p>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-slate-500">{t('pos.syncFailedEmpty')}</p>
          ) : (
            <ul className="space-y-2">
              {jobs.map((job) => (
                <li
                  key={job.id}
                  className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{job.summary ?? job.eventType}</p>
                    <p className="text-xs text-slate-500">
                      {t('pos.syncFailedRetries', { count: job.retryCount ?? 0 })}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busyId === job.id}
                      onClick={() => retry(job.id)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-white disabled:opacity-50"
                    >
                      {t('pos.syncFailedRetry')}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === job.id}
                      onClick={() => dismiss(job.id)}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {t('pos.syncFailedDismiss')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-slate-100 px-6 py-4 text-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </OverlayPortal>
  );
}
