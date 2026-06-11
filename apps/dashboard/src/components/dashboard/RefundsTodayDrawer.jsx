import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isHubManager } from '@venue-pos/shared';
import { apiFetch } from '../../api/client.js';
import { friendlyError } from '../../utils/apiError.js';
import { formatDateTime, formatMoney, venueLabel } from '../../utils/dashboardFormat.js';
import { Drawer } from '../ui/Drawer.jsx';
import { Button } from '../ui/Button.jsx';
import { RefundIcon } from './icons.jsx';

function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function RefundsTodayDrawer({ open, onClose, venueId, metric = 'calendar', userRole }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-EG';
  const currencyLabel = t('pos.currency');
  const canLinkCheque = isHubManager(userRole);
  const showVenue = !venueId;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ metric });
      if (venueId) params.set('venueId', venueId);
      const result = await apiFetch(`/api/v1/manager/dashboard/refunds-today?${params}`);
      setData(result);
    } catch (err) {
      setError(friendlyError(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [venueId, metric]);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, load]);

  const activityLink = useMemo(() => {
    const today = todayIsoDate();
    const params = new URLSearchParams({
      type: 'refund',
      from: today,
      to: today,
    });
    if (venueId) params.set('venueId', venueId);
    else params.set('venueId', 'all');
    return `/activity?${params}`;
  }, [venueId]);

  const title = t('dashboard.refundsTodayDetail', { count: data?.count ?? 0 });
  const subtitle =
    data?.total != null
      ? formatMoney(data.total, locale, currencyLabel)
      : loading
        ? t('common.loading')
        : undefined;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      icon={RefundIcon}
      title={title}
      subtitle={subtitle}
      footer={
        <Link to={activityLink} onClick={onClose}>
          <Button variant="secondary" size="sm">
            {t('dashboard.viewRefundsInActivity')}
          </Button>
        </Link>
      }
    >
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {loading && !data ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : null}
      {data && !data.refunds?.length ? (
        <p className="text-sm text-slate-500">{t('dashboard.refundsTodayEmpty')}</p>
      ) : null}
      {data?.refunds?.length ? (
        <ul className="space-y-3">
          {data.refunds.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">
                    {t('dashboard.refundRowCheque', {
                      number: row.chequeNumber,
                      table: row.tableLabel,
                    })}
                  </p>
                  {showVenue ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {venueLabel(
                        { nameEn: row.venueNameEn, nameAr: row.venueNameAr },
                        i18n.language,
                      )}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDateTime(row.processedAt, locale)} · {row.method}
                  </p>
                  {row.reason ? (
                    <p className="mt-1 break-words text-slate-600">{row.reason}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-500">
                    {t('dashboard.refundRowBy', { name: row.approver ?? row.initiator })}
                  </p>
                </div>
                <div className="shrink-0 sm:text-end">
                  {row.amount != null ? (
                    <p className="text-lg font-bold tabular-nums text-amber-800">
                      {Number(row.amount).toFixed(2)} {currencyLabel}
                    </p>
                  ) : null}
                  {canLinkCheque ? (
                    <Link
                      to={`/cheques?chequeId=${row.chequeId}&venueId=${row.venueId}`}
                      onClick={onClose}
                      className="mt-2 inline-block text-xs font-medium text-accent-700 hover:underline"
                    >
                      {t('activity.viewCheque')}
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </Drawer>
  );
}
