import { SectionCard } from '../../ui/Card.jsx';
import { MiniBarChart } from '../MiniBarChart.jsx';
import { formatMoney } from '../../../utils/dashboardFormat.js';

const METHOD_LABELS = {
  cash: 'dashboard.paymentCash',
  card: 'dashboard.paymentCard',
  voucher: 'dashboard.paymentVoucher',
};

export function FinancialHealthPanel({ id, financial, t, locale, currencyLabel, hideFinancials }) {
  if (hideFinancials) {
    return (
      <SectionCard id={id} title={t('dashboard.financialHealthTitle')} hint={t('dashboard.financialRestricted')}>
        <p className="text-sm text-slate-500">{t('dashboard.financialRestrictedHint')}</p>
      </SectionCard>
    );
  }

  const methods = financial?.paymentsByMethod ?? {};
  const methodTotal = Object.values(methods).reduce((s, v) => s + Number(v ?? 0), 0) || 1;

  return (
    <SectionCard
      id={id}
      className="scroll-mt-24"
      title={t('dashboard.financialHealthTitle')}
      hint={t('dashboard.financialHealthHint')}
    >
      <dl className="space-y-3 border-b border-slate-100 pb-5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">{t('dashboard.netAfterRefundsWeek')}</dt>
          <dd className="font-semibold tabular-nums text-slate-900">
            {formatMoney(financial?.netAfterRefundsWeek ?? 0, locale, currencyLabel)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">{t('dashboard.crossVenueVolume')}</dt>
          <dd className="font-semibold tabular-nums text-slate-900">
            {financial?.crossVenueVolume ?? 0}
          </dd>
        </div>
      </dl>

      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {t('dashboard.paymentMix')}
      </p>
      <div className="mt-3 space-y-3">
        {Object.entries(methods).map(([method, amount]) => {
          const pct = Math.round((Number(amount) / methodTotal) * 100);
          return (
            <div key={method}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{t(METHOD_LABELS[method] ?? method)}</span>
                <span className="font-medium tabular-nums text-slate-800">
                  {formatMoney(amount, locale, currencyLabel)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-accent-gradient" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {t('dashboard.refundTrend')}
      </p>
      <div className="mt-2 -mx-2">
        <MiniBarChart
          data={financial?.refundTrend ?? []}
          locale={locale}
          currencyLabel={currencyLabel}
          emptyLabel={t('analytics.noData')}
          dataKey="amount"
          labelKey="weekday"
        />
      </div>
    </SectionCard>
  );
}
