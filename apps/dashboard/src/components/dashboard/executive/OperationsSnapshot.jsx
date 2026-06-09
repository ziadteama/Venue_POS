import { SectionCard } from '../../ui/Card.jsx';
import { ChequeIcon, OrdersIcon, PowerIcon, ShiftIcon, StoreIcon, TablesIcon } from '../icons.jsx';

const METRICS = [
  { key: 'openShifts', labelKey: 'dashboard.snapshotOpenShifts', icon: ShiftIcon, tone: 'text-violet-600 bg-violet-50 ring-violet-100' },
  { key: 'openCheques', labelKey: 'dashboard.snapshotOpenCheques', icon: ChequeIcon, tone: 'text-blue-600 bg-blue-50 ring-blue-100' },
  { key: 'activeOrders', labelKey: 'metrics.activeOrders', icon: OrdersIcon, tone: 'text-amber-600 bg-amber-50 ring-amber-100' },
  { key: 'openTables', labelKey: 'metrics.openTables', icon: TablesIcon, tone: 'text-indigo-600 bg-indigo-50 ring-indigo-100' },
  { key: 'terminalsOnline', labelKey: 'dashboard.terminalsOnline', icon: PowerIcon, tone: 'text-accent-600 bg-accent-50 ring-accent-100', format: (ops) => `${ops.terminalsOnline ?? 0}/${ops.terminalsTotal ?? 0}` },
  { key: 'activeVenues', labelKey: 'dashboard.activeVenues', icon: StoreIcon, tone: 'text-slate-600 bg-slate-100 ring-slate-200' },
];

export function OperationsSnapshot({ id, operations, t }) {
  return (
    <SectionCard
      id={id}
      className="scroll-mt-24"
      title={t('dashboard.operationsSnapshotTitle')}
      hint={t('dashboard.operationsSnapshotHint')}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {METRICS.map(({ key, labelKey, icon: Icon, tone, format }) => (
          <div
            key={key}
            className="rounded-2xl border border-slate-200/70 bg-surface-overlay p-4"
          >
            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${tone}`}>
              <Icon className="h-4 w-4" />
            </span>
            <p className="mt-3 text-xs font-medium text-slate-500">{t(labelKey)}</p>
            <p className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
              {format ? format(operations) : (operations?.[key] ?? 0)}
            </p>
            {key === 'terminalsOnline' && (operations?.terminalsOffline ?? 0) > 0 ? (
              <p className="mt-1 text-xs text-amber-600">
                {t('dashboard.terminalsOnlineHint', { offline: operations.terminalsOffline })}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
