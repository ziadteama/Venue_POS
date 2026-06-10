import { Link } from 'react-router-dom';
import { CrossVenueBadge, CrossVenueGroupPanel } from '../CrossVenueBadge.jsx';
import { OpsBreadcrumb } from '../dashboard/OpsBreadcrumb.jsx';
import { Button } from '../ui/Button.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { OrdersIcon } from '../dashboard/icons.jsx';

function formatMoney(value, locale) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function formatDate(value, locale) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function OrderDetailPanel({
  detail,
  chequeOrders,
  receipt,
  locale,
  venueId,
  t,
  i18n,
  showOrderActions,
  actionBusy,
  onReprintCheque,
  onReprintOrder,
  onCompItem,
  onVoidRound,
  OrderLineItems,
}) {
  if (!detail) {
    return (
      <EmptyState icon={OrdersIcon} title={t('orders.selectCheque')} className="py-16" />
    );
  }

  const scopedVenue = detail.venueId ?? venueId;

  return (
    <div className="space-y-4 text-sm">
      {detail.cheque?.id ? (
        <OpsBreadcrumb
          items={[
            { label: t('nav.cheques'), to: '/cheques' },
            {
              label: t('cheque.number', { number: detail.cheque.chequeNumber }),
              to: `/cheques?chequeId=${detail.cheque.id}&venueId=${scopedVenue}`,
            },
            { label: t('nav.orders') },
          ]}
        />
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            {detail.cheque?.chequeNumber != null
              ? t('pos.chequeNumber', { number: detail.cheque.chequeNumber })
              : t('pos.orderNumber', { number: detail.orderNumber })}
          </h3>
          <p className="text-xs text-slate-500">{formatDate(detail.openedAt, locale)}</p>
        </div>
        {detail.cheque?.isCrossVenue ? <CrossVenueBadge t={t} /> : null}
      </div>

      {detail.voidAudit ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="font-medium text-amber-900">{t('orders.voided')}</p>
          <p className="mt-1 text-amber-800">{detail.voidAudit.reason}</p>
        </div>
      ) : null}

      {detail.crossVenueGroup ? (
        <CrossVenueGroupPanel
          group={detail.crossVenueGroup}
          t={t}
          language={i18n.language}
          locale={locale}
          formatMoney={formatMoney}
          linkMembers
          currentVenueId={scopedVenue}
        />
      ) : null}

      {detail.cheque ? (
        <div className="space-y-2 rounded-xl border border-slate-100 bg-surface-overlay p-3">
          {detail.cheque.parentCheque ? (
            <p className="text-slate-500">
              {t('orders.splitFrom', { number: detail.cheque.parentCheque.chequeNumber })}
            </p>
          ) : null}
          {detail.totalSubtotal != null ? (
            <p className="font-semibold text-slate-900">
              {t('orders.chequeTotal')}: {formatMoney(detail.totalSubtotal, locale)} {t('pos.currency')}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <p className="mb-2 font-medium text-slate-700">
          {chequeOrders.length > 1
            ? t('orders.ordersOnCheque', {
                count: chequeOrders.length,
                number: detail.cheque?.chequeNumber ?? '—',
              })
            : t('orders.lineItems')}
        </p>
        <div className="space-y-3">
          {chequeOrders
            .filter(
              (chequeOrder) =>
                chequeOrder.items?.length > 0 ||
                chequeOrder.status === 'voided' ||
                chequeOrder.voidReason,
            )
            .map((chequeOrder) => (
              <div key={chequeOrder.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">
                    {t('orders.roundOnCheque', { number: chequeOrder.orderNumber })}
                  </span>
                  <span className="text-xs text-slate-500">
                    {t(`orders.status.${chequeOrder.status}`, chequeOrder.status)} ·{' '}
                    {formatMoney(chequeOrder.subtotal, locale)} {t('pos.currency')}
                  </span>
                </div>
                {chequeOrder.voidReason || chequeOrder.voidAudit?.reason ? (
                  <p className="mb-2 text-xs text-amber-800">
                    {chequeOrder.voidReason ?? chequeOrder.voidAudit?.reason}
                  </p>
                ) : null}
                <OrderLineItems items={chequeOrder.items} t={t} i18n={i18n} locale={locale} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onReprintOrder(chequeOrder.id)}
                  >
                    {t('orders.reprintOrder')}
                  </Button>
                  {showOrderActions &&
                  chequeOrder.status !== 'voided' &&
                  chequeOrder.items?.length > 0 &&
                  detail.cheque?.id
                    ? chequeOrder.items.map((item) =>
                        !item.isComped ? (
                          <Button
                            key={item.id}
                            variant="secondary"
                            size="sm"
                            disabled={actionBusy}
                            onClick={() =>
                              onCompItem({
                                chequeId: detail.cheque.id,
                                orderId: chequeOrder.id,
                                itemId: item.id,
                                itemName: i18n.language === 'ar' ? item.nameAr : item.nameEn,
                              })
                            }
                          >
                            {t('orders.compItem', {
                              name: i18n.language === 'ar' ? item.nameAr : item.nameEn,
                            })}
                          </Button>
                        ) : null,
                      )
                    : null}
                  {showOrderActions &&
                  chequeOrder.status !== 'voided' &&
                  chequeOrder.items?.length > 0 &&
                  detail.cheque?.id ? (
                    <Button
                      variant="danger-soft"
                      size="sm"
                      disabled={actionBusy}
                      onClick={() =>
                        onVoidRound({
                          chequeId: detail.cheque.id,
                          orderId: chequeOrder.id,
                          orderNumber: chequeOrder.orderNumber,
                        })
                      }
                    >
                      {t('orders.voidRound')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
        </div>
      </div>

      {receipt ? (
        <pre className="scrollbar-slim max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
          {receipt}
        </pre>
      ) : null}

      {detail.cheque?.id ? (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" size="sm" onClick={onReprintCheque}>
            {t('orders.reprintCheque')}
          </Button>
          <Link to={`/cheques?chequeId=${detail.cheque.id}&venueId=${scopedVenue}`}>
            <Button variant="secondary" size="sm">
              {t('orders.chequeActions')}
            </Button>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
