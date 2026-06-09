import { useMemo, useState } from 'react';

function formatSplitPart(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return String(Number(amount.toFixed(2)));
}

export function PayModal({
  cheque,
  payTotal,
  onConfirm,
  onCancel,
  t,
  manualCardEnabled = false,
  manualCardThreshold = 500,
}) {
  const total = payTotal ?? cheque?.total ?? 0;
  const [mode, setMode] = useState('cash');
  const [tendered, setTendered] = useState(String(total || ''));
  const [cashPart, setCashPart] = useState('');
  const [cardPart, setCardPart] = useState('');
  const [managerPin, setManagerPin] = useState('');

  const tenderNum = Number(tendered) || 0;
  const cashNum = Number(cashPart) || 0;
  const cardNum = Number(cardPart) || 0;
  const change = mode === 'cash' ? Math.max(0, tenderNum - total) : 0;
  const splitRemaining = total - cashNum - cardNum;

  const cardDue = useMemo(() => {
    if (mode === 'card') return total;
    if (mode === 'split') return cardNum;
    return 0;
  }, [mode, total, cardNum]);

  const needsManagerPin = manualCardEnabled && cardDue >= manualCardThreshold;

  const modes = useMemo(() => {
    const list = [{ id: 'cash', label: t('pos.payCash') }];
    if (manualCardEnabled) {
      list.push({ id: 'card', label: t('pos.payCardManual') });
      list.push({ id: 'split', label: t('pos.paySplit') });
    }
    return list;
  }, [manualCardEnabled, t]);

  function handleCashPartChange(raw) {
    setCashPart(raw);
    if (raw === '' || raw === '.') {
      setCardPart('');
      return;
    }
    const cash = Number(raw);
    if (!Number.isFinite(cash)) return;
    setCardPart(formatSplitPart(total - cash));
  }

  function handleCardPartChange(raw) {
    setCardPart(raw);
    if (raw === '' || raw === '.') {
      setCashPart('');
      return;
    }
    const card = Number(raw);
    if (!Number.isFinite(card)) return;
    setCashPart(formatSplitPart(total - card));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (needsManagerPin && managerPin.length < 4) return;

    if (mode === 'cash') {
      if (tenderNum < total) return;
      onConfirm({
        payments: [{ method: 'cash', amount: total }],
        tendered: tenderNum,
      });
      return;
    }

    if (mode === 'card') {
      onConfirm({
        payments: [{ method: 'card', amount: total }],
        managerPin: needsManagerPin ? managerPin : undefined,
      });
      return;
    }

    if (Math.abs(splitRemaining) > 0.009 || cashNum + cardNum <= 0) return;
    const payments = [];
    if (cashNum > 0) payments.push({ method: 'cash', amount: cashNum });
    if (cardNum > 0) payments.push({ method: 'card', amount: cardNum });
    onConfirm({
      payments,
      tendered: cashNum > 0 ? cashNum : undefined,
      managerPin: needsManagerPin ? managerPin : undefined,
    });
  }

  const submitDisabled =
    mode === 'cash'
      ? tenderNum < total
      : mode === 'card'
        ? needsManagerPin && managerPin.length < 4
        : Math.abs(splitRemaining) > 0.009 || cashNum + cardNum <= 0 || (needsManagerPin && managerPin.length < 4);

  const splitBalanced = Math.abs(splitRemaining) < 0.01 && cashNum + cardNum > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h3 className="mb-1 text-xl font-bold text-slate-900">{t('pos.payTitle')}</h3>
        <p className="mb-4 text-sm text-secondary">
          {t('pos.chequeNumber', { number: cheque.chequeNumber })} ·{' '}
          <span className="font-semibold text-primary-to">
            {total.toFixed(2)} {t('pos.currency')}
          </span>
        </p>

        <div className={`mb-4 flex gap-2 ${modes.length > 2 ? 'flex-wrap' : ''}`}>
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                mode === m.id
                  ? 'bg-primary-gradient text-white'
                  : 'border border-slate-200 text-secondary'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'cash' ? (
          <>
            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-secondary">{t('pos.tendered')}</span>
              <input
                type="number"
                min={total}
                step="0.01"
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                className="w-full rounded border px-3 py-2 text-lg font-semibold"
                autoFocus
              />
            </label>
            <p className="mb-4 text-lg font-bold text-emerald-700">
              {t('pos.changeDue')}: {change.toFixed(2)} {t('pos.currency')}
            </p>
          </>
        ) : null}

        {mode === 'card' ? (
          <p className="mb-4 text-sm text-secondary">
            {t('pos.payCardAmount', { amount: total.toFixed(2) })}
          </p>
        ) : null}

        {mode === 'split' ? (
          <>
            <p className="mb-3 text-xs text-secondary">{t('pos.paySplitHint')}</p>
            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-secondary">{t('pos.payCash')}</span>
              <input
                type="number"
                min="0"
                max={total}
                step="0.01"
                value={cashPart}
                onChange={(e) => handleCashPartChange(e.target.value)}
                className="w-full rounded border px-3 py-2"
                placeholder="0.00"
                autoFocus
              />
            </label>
            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-secondary">{t('pos.payCard')}</span>
              <input
                type="number"
                min="0"
                max={total}
                step="0.01"
                value={cardPart}
                onChange={(e) => handleCardPartChange(e.target.value)}
                className="w-full rounded border px-3 py-2"
                placeholder="0.00"
              />
            </label>
            <p
              className={`mb-4 text-sm font-medium ${
                splitBalanced ? 'text-emerald-700' : 'text-red-600'
              }`}
            >
              {splitBalanced
                ? t('pos.paySplitBalanced', { total: total.toFixed(2) })
                : `${t('pos.remaining')}: ${splitRemaining.toFixed(2)} ${t('pos.currency')}`}
            </p>
          </>
        ) : null}

        {needsManagerPin && (
          <label className="mb-4 block text-sm">
            <span className="mb-1 block text-secondary">{t('pos.shiftManagerPin')}</span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={managerPin}
              onChange={(e) => setManagerPin(e.target.value)}
              className="w-full rounded border px-3 py-2"
            />
          </label>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitDisabled}
            className="flex-1 rounded-lg bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {t('pos.completePay')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-3 text-secondary hover:bg-slate-50"
          >
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
