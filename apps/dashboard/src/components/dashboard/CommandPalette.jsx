import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isHubManager } from '@venue-pos/shared';
import { apiFetch } from '../../api/client.js';
import { friendlyError } from '../../utils/apiError.js';
import { useAuth } from '../../hooks/useAuth.js';

const NAV_ITEMS = [
  { path: '/', labelKey: 'nav.overview' },
  { path: '/shifts', labelKey: 'nav.shifts' },
  { path: '/cheques', labelKey: 'nav.cheques' },
  { path: '/orders', labelKey: 'nav.orders' },
  { path: '/menus', labelKey: 'nav.menus' },
  { path: '/activity', labelKey: 'nav.activity' },
  { path: '/health', labelKey: 'nav.health' },
  { path: '/settings', labelKey: 'nav.settings' },
];

function venueLabel(cheque, language) {
  return language === 'ar' ? cheque.venueNameAr || cheque.venueNameEn : cheque.venueNameEn;
}

export function CommandPalette({ open, onClose }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [chequeHits, setChequeHits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);

  const navHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NAV_ITEMS;
    return NAV_ITEMS.filter((item) => t(item.labelKey).toLowerCase().includes(q));
  }, [query, t]);

  const allResults = useMemo(() => {
    const items = navHits.map((item) => ({ type: 'nav', ...item }));
    for (const c of chequeHits) {
      items.push({ type: 'cheque', cheque: c });
    }
    return items;
  }, [navHits, chequeHits]);

  const searchCheques = useCallback(
    async (q) => {
      if (!isHubManager(user?.role) || q.length < 1) {
        setChequeHits([]);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ status: 'open', q });
        const paid = await apiFetch(`/api/v1/manager/cheques/hub-search?${params}`);
        params.set('status', 'paid');
        const paidList = await apiFetch(`/api/v1/manager/cheques/hub-search?${params}`);
        const merged = [...paid, ...paidList.filter((p) => !paid.some((o) => o.id === p.id))];
        setChequeHits(merged.slice(0, 12));
      } catch (e) {
        setError(friendlyError(e));
        setChequeHits([]);
      } finally {
        setLoading(false);
      }
    },
    [user?.role],
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setChequeHits([]);
    setActiveIdx(0);
    setError('');
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const trimmed = query.trim();
    if (trimmed.length < 1) {
      setChequeHits([]);
      return undefined;
    }
    const timer = setTimeout(() => searchCheques(trimmed), 250);
    return () => clearTimeout(timer);
  }, [query, open, searchCheques]);

  useEffect(() => {
    setActiveIdx(0);
  }, [allResults.length, query]);

  function go(item) {
    onClose();
    if (item.type === 'nav') {
      navigate(item.path);
      return;
    }
    navigate(`/cheques?chequeId=${item.cheque.id}&venueId=${item.cheque.venueId}`);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, allResults.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' && allResults[activeIdx]) {
      e.preventDefault();
      go(allResults[activeIdx]);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-ink-900/40 px-4 pt-[12vh] backdrop-blur-sm">
      <button
        type="button"
        aria-label={t('common.cancel')}
        className="absolute inset-0"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('commandPalette.title')}
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-elevated"
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('commandPalette.placeholder')}
          className="w-full border-b border-slate-100 px-4 py-3 text-base outline-none"
        />
        <ul className="scrollbar-slim max-h-80 overflow-y-auto py-1">
          {allResults.length === 0 && !loading ? (
            <li className="px-4 py-6 text-center text-sm text-slate-500">{t('commandPalette.empty')}</li>
          ) : null}
          {allResults.map((item, idx) => (
            <li key={item.type === 'nav' ? item.path : item.cheque.id}>
              <button
                type="button"
                onClick={() => go(item)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start text-sm ${
                  idx === activeIdx ? 'bg-accent-50 text-accent-900' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {item.type === 'nav' ? (
                  <>
                    <span className="font-medium">{t(item.labelKey)}</span>
                    <span className="text-xs text-slate-400">{t('commandPalette.goToPage')}</span>
                  </>
                ) : (
                  <>
                    <span>
                      {t('cheque.number', { number: item.cheque.chequeNumber })} ·{' '}
                      {venueLabel(item.cheque, i18n.language)} · {item.cheque.tableLabel}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{item.cheque.status}</span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
        {loading ? (
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">{t('common.loading')}</p>
        ) : null}
        {error ? (
          <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p>
        ) : null}
        <p className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400">
          {t('commandPalette.hint')}
        </p>
      </div>
    </div>
  );
}
