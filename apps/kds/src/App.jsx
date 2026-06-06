import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const TERMINAL_ID = import.meta.env.VITE_TERMINAL_ID ?? '';
const TERMINAL_SECRET = import.meta.env.VITE_TERMINAL_SECRET ?? '';
const KDS_ENABLED = import.meta.env.VITE_FEATURE_KDS_ENABLED !== 'false';

function normalizeOrder(raw) {
  if (!raw) return null;
  const id = raw.orderId ?? raw.id;
  if (!id) return null;
  return {
    id,
    orderNumber: raw.orderNumber,
    tableLabel: raw.tableLabel ?? raw.tableId ?? '—',
    status: raw.status ?? 'sent',
    sentAt: raw.sentAt,
    items: raw.items ?? [],
  };
}

function elapsedMinutes(sentAt) {
  if (!sentAt) return 0;
  return Math.floor((Date.now() - new Date(sentAt).getTime()) / 60_000);
}

function ageClass(minutes) {
  if (minutes < 5) return 'border-emerald-500 bg-emerald-950/40';
  if (minutes < 10) return 'border-amber-500 bg-amber-950/40';
  return 'border-red-500 bg-red-950/40';
}

function itemLabel(item, language) {
  return language === 'ar' ? item.nameAr ?? item.nameEn : item.nameEn ?? item.nameAr;
}

function modifierText(item, language) {
  const mods = item.modifiersSnapshot ?? [];
  if (!mods.length) return null;
  return mods.map((m) => (language === 'ar' ? m.nameAr : m.nameEn)).join(', ');
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [clock, setClock] = useState(() => Date.now());

  const upsertOrder = useCallback((incoming) => {
    const order = normalizeOrder(incoming);
    if (!order) return;
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === order.id);
      if (idx === -1) return [...prev, order].sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));
      const next = [...prev];
      next[idx] = { ...next[idx], ...order };
      return next.sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));
    });
  }, []);

  const loadOrders = useCallback(async () => {
    if (!KDS_ENABLED) {
      setLoading(false);
      return;
    }
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/v1/kitchen/orders`, {
        headers: {
          'x-terminal-id': TERMINAL_ID,
          'x-terminal-secret': TERMINAL_SECRET,
        },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setOrders(
        (Array.isArray(data) ? data : [])
          .map(normalizeOrder)
          .filter(Boolean)
          .sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt)),
      );
    } catch {
      setError(t('kds.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const tick = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!KDS_ENABLED || !TERMINAL_ID || !TERMINAL_SECRET) return undefined;

    const socket = io(API_URL, {
      path: '/socket.io',
      auth: { terminalId: TERMINAL_ID, terminalSecret: TERMINAL_SECRET, clientType: 'kds' },
      transports: ['websocket'],
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('order:created', (msg) => {
      const payload = msg?.payload ?? msg;
      upsertOrder(payload);
    });

    return () => socket.disconnect();
  }, [upsertOrder]);

  const activeOrders = useMemo(
    () => orders.filter((o) => ['sent', 'partially_ready', 'ready'].includes(o.status)),
    [orders, clock],
  );

  if (!KDS_ENABLED) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-8 text-center text-white">
        <p className="text-2xl text-secondary">{t('kds.disabled')}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <header className="flex items-center justify-between bg-primary-gradient px-6 py-4">
        <h1 className="text-3xl font-bold">{t('kds.title')}</h1>
        <div className="flex items-center gap-4 text-sm">
          <span
            className={`flex items-center gap-2 rounded-full px-3 py-1 ring-1 ${
              connected ? 'ring-emerald-400/50 text-emerald-300' : 'ring-red-400/50 text-red-300'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {connected ? t('kds.online') : t('kds.offline')}
          </span>
          <button
            type="button"
            onClick={() => i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
            className="rounded bg-white/15 px-4 py-2 text-lg ring-1 ring-white/30 hover:bg-white/25"
          >
            {i18n.language === 'ar' ? 'EN' : 'ع'}
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-amber-900/50 px-6 py-2 text-center text-amber-100">{error}</div>
      )}

      <main className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <p className="text-center text-2xl text-secondary">{t('common.loading')}</p>
        ) : activeOrders.length === 0 ? (
          <p className="text-center text-2xl text-secondary">{t('kds.noOrders')}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {activeOrders.map((order) => {
              const minutes = elapsedMinutes(order.sentAt);
              return (
                <article
                  key={order.id}
                  className={`rounded-xl border-2 p-4 shadow-lg ${ageClass(minutes)}`}
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-2xl font-bold">
                        {t('kds.orderNumber', { number: order.orderNumber ?? '—' })}
                      </h2>
                      <p className="text-lg text-white/80">
                        {t('kds.table', { label: order.tableLabel })}
                      </p>
                    </div>
                    <span className="rounded-lg bg-black/30 px-3 py-1 text-lg font-semibold tabular-nums">
                      {t('kds.elapsed', { minutes })}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {order.items.map((item) => (
                      <li key={item.id} className="rounded-lg bg-black/25 px-3 py-2">
                        <div className="flex justify-between gap-2 text-lg font-medium">
                          <span>
                            {item.quantity}× {itemLabel(item, i18n.language)}
                          </span>
                        </div>
                        {modifierText(item, i18n.language) && (
                          <p className="mt-1 text-sm text-white/70">
                            {modifierText(item, i18n.language)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
