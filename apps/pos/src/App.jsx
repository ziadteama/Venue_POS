import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from './components/LanguageToggle.jsx';

const AGENT_URL = import.meta.env.VITE_LOCAL_AGENT_URL ?? 'http://127.0.0.1:3456';
const DEMO_CASHIER_ID = '00000000-0000-4000-8000-000000000011';

function itemName(item, language) {
  return language === 'ar' ? item.nameAr : item.nameEn;
}

function lineTotal(line) {
  const mods = (line.modifiersSnapshot ?? []).reduce(
    (s, m) => s + Number(m.priceDelta ?? 0) * line.quantity,
    0,
  );
  return line.unitPrice * line.quantity + mods;
}

function displayInitial(value) {
  const text = value ?? '?';
  return String(text).charAt(0) || '?';
}

function modifierLabel(line, language) {
  const mods = line.modifiersSnapshot ?? [];
  if (!mods.length) return null;
  return mods.map((m) => (language === 'ar' ? m.nameAr : m.nameEn)).join(', ');
}

async function callAgent(path, options = {}) {
  const method = options.method ?? 'GET';
  const body = options.body ? JSON.parse(options.body) : undefined;

  if (window.venuePos) {
    if (path === '/v1/menu' && method === 'GET') return window.venuePos.getMenu();
    if (path === '/v1/menu/sync') return window.venuePos.syncMenu();
    if (path === '/v1/orders' && method === 'POST') return window.venuePos.createOrder(body);
    if (path.match(/^\/v1\/orders\/[^/]+\/items$/) && method === 'POST') {
      return window.venuePos.addOrderItem(path.split('/')[3], body);
    }
    if (path.match(/^\/v1\/orders\/[^/]+\/items\/[^/]+$/) && method === 'PATCH') {
      const [, , , orderId, , itemId] = path.split('/');
      return window.venuePos.updateOrderItem(orderId, itemId, body.quantity);
    }
    if (path.match(/^\/v1\/orders\/[^/]+\/send$/)) {
      return window.venuePos.sendOrder(path.split('/')[3]);
    }
    if (path.match(/^\/v1\/orders\/[^/]+\/receipt$/)) {
      return window.venuePos.getReceipt(path.split('/')[3]);
    }
  }

  const needsBody = method !== 'GET' && method !== 'HEAD' && options.body == null;
  const res = await fetch(`${AGENT_URL}${path}`, {
    headers: { 'content-type': 'application/json', ...options.headers },
    ...options,
    ...(needsBody ? { body: '{}' } : {}),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function ModifierModal({ item, language, onConfirm, onCancel, t }) {
  const [selected, setSelected] = useState({});

  function toggle(group, option) {
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      const exists = current.find((o) => o.optionId === option.id);
      let next;
      if (exists) {
        next = current.filter((o) => o.optionId !== option.id);
      } else if (group.maxSelection === 1) {
        next = [
          {
            groupId: group.id,
            optionId: option.id,
            nameEn: option.nameEn,
            nameAr: option.nameAr,
            priceDelta: option.priceDelta,
          },
        ];
      } else {
        next = [
          ...current,
          {
            groupId: group.id,
            optionId: option.id,
            nameEn: option.nameEn,
            nameAr: option.nameAr,
            priceDelta: option.priceDelta,
          },
        ];
      }
      return { ...prev, [group.id]: next };
    });
  }

  function handleConfirm() {
    for (const group of item.modifierGroups ?? []) {
      const count = (selected[group.id] ?? []).length;
      if (count < group.minSelection) {
        alert(t('pos.modifierMin', { name: itemName(group, language), count: group.minSelection }));
        return;
      }
    }
    onConfirm(Object.values(selected).flat());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-xl font-bold text-slate-900">{itemName(item, language)}</h3>
        {(item.modifierGroups ?? []).map((group) => (
          <div key={group.id} className="mb-4">
            <p className="mb-2 font-medium text-slate-700">{itemName(group, language)}</p>
            <div className="flex flex-wrap gap-2">
              {group.options?.map((opt) => {
                const active = (selected[group.id] ?? []).some((o) => o.optionId === opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggle(group, opt)}
                    className={`rounded-lg px-3 py-2 text-sm ${
                      active
                        ? 'bg-primary-gradient text-white'
                        : 'border border-secondary/40 bg-slate-50 text-slate-700 hover:border-secondary'
                    }`}
                  >
                    {itemName(opt, language)}
                    {opt.priceDelta > 0 ? ` (+${opt.priceDelta})` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-lg bg-primary-gradient px-4 py-2 font-semibold text-white hover:opacity-90"
          >
            {t('common.save')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-secondary/50 px-4 py-2 text-secondary hover:bg-slate-50"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

function PrinterIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
      <path d="M6 14h12v8H6z" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [menu, setMenu] = useState(null);
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [order, setOrder] = useState(null);
  const [tableLabel, setTableLabel] = useState('T4');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modifierItem, setModifierItem] = useState(null);
  const [printerOk, setPrinterOk] = useState(true);
  const [sending, setSending] = useState(false);
  const [clock, setClock] = useState(() => new Date());

  const loadMenu = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let data = await callAgent('/v1/menu');
      if (!data.categories?.length) {
        await callAgent('/v1/menu/sync', { method: 'POST' });
        data = await callAgent('/v1/menu');
      }
      setMenu(data);
    } catch {
      setError(t('pos.menuLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const startOrder = useCallback(async () => {
    setError('');
    try {
      const created = await callAgent('/v1/orders', {
        method: 'POST',
        body: JSON.stringify({ cashierId: DEMO_CASHIER_ID, tableLabel }),
      });
      setOrder(created);
    } catch {
      setError(t('pos.orderCreateFailed'));
    }
  }, [tableLabel, t]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  useEffect(() => {
    if (!loading && menu && !order) startOrder();
  }, [loading, menu, order, startOrder]);

  useEffect(() => {
    const tick = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    async function checkPrinter() {
      try {
        if (window.venuePos?.getAgentHealth) {
          await window.venuePos.getAgentHealth();
          setPrinterOk(true);
          return;
        }
        const res = await fetch(`${AGENT_URL}/health`);
        setPrinterOk(res.ok);
      } catch {
        setPrinterOk(false);
      }
    }
    checkPrinter();
    const id = setInterval(checkPrinter, 15_000);
    return () => clearInterval(id);
  }, []);

  const allItems = useMemo(
    () => menu?.categories?.flatMap((c) => c.items ?? []) ?? [],
    [menu],
  );

  const activeCategory = useMemo(() => {
    if (activeCategoryId === 'all') return null;
    return menu?.categories?.find((c) => c.id === activeCategoryId);
  }, [menu, activeCategoryId]);

  const displayItems = useMemo(() => {
    const base = activeCategoryId === 'all' ? allItems : (activeCategory?.items ?? []);
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (item) =>
        item.nameEn.toLowerCase().includes(q) || item.nameAr.toLowerCase().includes(q),
    );
  }, [activeCategoryId, allItems, activeCategory, search]);

  async function addItemToOrder(item, modifiers = []) {
    const updated = await callAgent(`/v1/orders/${order.id}/items`, {
      method: 'POST',
      body: JSON.stringify({
        menuItemId: item.id,
        quantity: 1,
        nameEn: item.nameEn,
        nameAr: item.nameAr,
        unitPrice: item.price,
        modifiers,
      }),
    });
    setOrder(updated);
  }

  function handleTapItem(item) {
    if (!order) return;
    if (order.status !== 'draft') {
      setError(t('pos.orderLocked'));
      return;
    }
    if (item.modifierGroups?.length) {
      setModifierItem(item);
      return;
    }
    setError('');
    addItemToOrder(item).catch(() => setError(t('pos.itemAddFailed')));
  }

  async function changeQty(itemId, quantity) {
    try {
      const updated = await callAgent(`/v1/orders/${order.id}/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity }),
      });
      setOrder(updated);
    } catch {
      setError(t('pos.itemAddFailed'));
    }
  }

  async function handleSend() {
    if (!order || sending) return;
    setSending(true);
    setError('');
    try {
      await callAgent(`/v1/orders/${order.id}/send`, { method: 'POST' });
      await startOrder();
    } catch {
      setError(t('pos.sendFailed'));
    } finally {
      setSending(false);
    }
  }

  async function handleClear() {
    setError('');
    await startOrder();
  }

  const timeLabel = clock.toLocaleTimeString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900">
      {modifierItem && (
        <ModifierModal
          item={modifierItem}
          language={i18n.language}
          t={t}
          onCancel={() => setModifierItem(null)}
          onConfirm={(mods) => {
            setModifierItem(null);
            addItemToOrder(modifierItem, mods).catch(() => setError(t('pos.itemAddFailed')));
          }}
        />
      )}

      <header className="flex shrink-0 items-center gap-4 bg-primary-gradient px-5 py-3 text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-lg font-bold">
            V
          </div>
          <h1 className="text-lg font-bold">{t('pos.title')}</h1>
        </div>

        <div className="mx-auto w-full max-w-md">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('pos.searchMenu')}
            className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/60 focus:border-white/40 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-white/80">{t('pos.tableLabel')}</span>
            <input
              value={tableLabel}
              onChange={(e) => setTableLabel(e.target.value)}
              className="w-16 rounded border border-white/30 bg-white/15 px-2 py-1 text-center text-sm"
            />
          </label>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/25">
            {t('pos.dineIn')}
          </span>
          <LanguageToggle onDark />
        </div>
      </header>

      {error && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-2 text-center text-sm font-medium text-amber-800">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Receipt panel — left */}
        <aside className="flex w-[22rem] shrink-0 flex-col border-e border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-900">{t('pos.currentOrder')}</h2>
            <p className="text-sm text-secondary">
              {order
                ? t('pos.orderNumber', { number: order.orderNumber ?? '—' })
                : t('pos.noActiveOrder')}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            {loading ? (
              <p className="p-2 text-secondary">{t('common.loading')}</p>
            ) : !order?.items?.length ? (
              <p className="p-2 text-secondary">{t('pos.emptyCart')}</p>
            ) : (
              <ul className="space-y-2">
                {order.items.map((line) => (
                  <li
                    key={line.id}
                    className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-gradient text-sm font-bold text-white">
                      {displayInitial(i18n.language === 'ar' ? line.nameAr : line.nameEn)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <span className="truncate font-medium text-slate-900">
                          {i18n.language === 'ar' ? line.nameAr : line.nameEn}
                        </span>
                        <span className="shrink-0 font-semibold text-primary-to">
                          {lineTotal(line).toFixed(2)}
                        </span>
                      </div>
                      {modifierLabel(line, i18n.language) && (
                        <p className="mt-0.5 truncate text-xs text-secondary">
                          {modifierLabel(line, i18n.language)}
                        </p>
                      )}
                      {order.status === 'draft' && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => changeQty(line.id, line.quantity - 1)}
                            className="flex h-7 w-7 items-center justify-center rounded border border-secondary/40 bg-white text-slate-700"
                          >
                            −
                          </button>
                          <span className="min-w-[1.25rem] text-center text-sm font-medium">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => changeQty(line.id, line.quantity + 1)}
                            className="flex h-7 w-7 items-center justify-center rounded border border-secondary/40 bg-white text-slate-700"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-auto border-t border-slate-200 p-4">
            <div className="mb-3 space-y-1 text-sm">
              <div className="flex justify-between text-secondary">
                <span>{t('pos.subtotal')}</span>
                <span>{order?.subtotal?.toFixed(2) ?? '0.00'} {t('pos.currency')}</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-slate-900">
                <span>{t('pos.total')}</span>
                <span className="text-primary-to">
                  {order?.subtotal?.toFixed(2) ?? '0.00'} {t('pos.currency')}
                </span>
              </div>
            </div>

            <div
              className={`mb-3 flex items-center gap-2 text-xs ${
                printerOk ? 'text-primary-to' : 'text-red-600'
              }`}
            >
              <PrinterIcon />
              <span>{printerOk ? t('pos.printerConnected') : t('pos.printerOffline')}</span>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClear}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-secondary/50 py-3 text-sm font-medium text-secondary hover:bg-slate-50"
              >
                <ClearIcon />
                {t('pos.clear')}
              </button>
              {order?.status === 'draft' && order.items?.length > 0 && (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending}
                  className="flex-[2] rounded-lg bg-primary-gradient py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {sending ? t('common.loading') : t('pos.checkout')}
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Menu area — right */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-3">
            <button
              type="button"
              onClick={() => setActiveCategoryId('all')}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${
                activeCategoryId === 'all'
                  ? 'bg-primary-gradient text-white shadow-sm'
                  : 'bg-slate-50 text-secondary hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              {t('pos.allItems')}
            </button>
            {menu?.categories?.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategoryId(category.id)}
                className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${
                  activeCategoryId === category.id
                    ? 'bg-primary-gradient text-white shadow-sm'
                    : 'bg-slate-50 text-secondary hover:bg-slate-100 hover:text-slate-700'
                }`}
              >
                {itemName(category, i18n.language)}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <p className="text-secondary">{t('common.loading')}</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {displayItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleTapItem(item)}
                    disabled={!item.isAvailable || order?.status !== 'draft'}
                    className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-start shadow-sm transition hover:border-primary-to/40 hover:shadow-md disabled:opacity-40"
                  >
                    <div className="flex h-28 items-center justify-center bg-gradient-to-br from-primary-from/10 to-primary-to/10">
                      <span className="text-3xl font-bold text-primary-from/40">
                        {displayInitial(itemName(item, i18n.language))}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col justify-between p-3">
                      <span className="font-semibold text-slate-900">
                        {itemName(item, i18n.language)}
                      </span>
                      <span className="mt-2 font-semibold text-primary-to">
                        {item.price.toFixed(2)} {t('pos.currency')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5 py-2 text-xs text-secondary">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary-to" />
          {t('pos.online')}
        </span>
        <span>{timeLabel}</span>
      </footer>
    </div>
  );
}
