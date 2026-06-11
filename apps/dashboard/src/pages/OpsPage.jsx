import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OPS_SEVERITY } from '@venue-pos/shared';
import { apiFetch } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { useAuth } from '../hooks/useAuth.js';
import { useOpsNotifications } from '../hooks/useOpsNotifications.js';
import { PageHeader } from '../components/dashboard/PageHeader.jsx';
import { StatCard } from '../components/dashboard/StatCard.jsx';
import { StatCardSkeleton, TableSkeleton } from '../components/dashboard/Skeleton.jsx';
import { SectionCard } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { DataTable } from '../components/ui/DataTable.jsx';
import { StatusBadge } from '../components/ui/Badge.jsx';
import {
  AlertIcon,
  BellIcon,
  HealthIcon,
  PowerIcon,
  RefreshIcon,
} from '../components/dashboard/icons.jsx';

export function OpsPage() {
  const { t, i18n } = useTranslation();
  const { token } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const {
    healthTick,
    latestAlert,
    notificationsEnabled,
    requestNotifications,
    clearLatestAlert,
  } = useOpsNotifications(token);

  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/api/v1/ops/dashboard');
      setDashboard(data);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!latestAlert) return undefined;
    const id = setTimeout(clearLatestAlert, 12_000);
    return () => clearTimeout(id);
  }, [latestAlert, clearLatestAlert]);

  const health = healthTick
    ? { ...dashboard?.health, summary: healthTick.summary, server: healthTick.server, alerts: healthTick.alerts }
    : dashboard?.health;

  const summary = dashboard?.summary ?? {};
  const events = latestAlert
    ? [latestAlert, ...(dashboard?.events ?? []).filter((e) => e.id !== latestAlert.id)]
    : dashboard?.events ?? [];

  const terminalColumns = [
    {
      key: 'name',
      header: t('health.terminal'),
      render: (term) => <span className="font-medium text-slate-900">{term.name ?? term.id}</span>,
    },
    {
      key: 'venue',
      header: t('health.venue'),
      render: (term) => (i18n.language === 'ar' ? term.venueNameAr : term.venueNameEn),
    },
    {
      key: 'status',
      header: t('health.status'),
      render: (term) => (
        <StatusBadge
          status={term.online ? 'online' : 'offline'}
          label={term.online ? t('health.online') : t('health.offline')}
        />
      ),
    },
    {
      key: 'syncQueue',
      header: t('health.syncQueue'),
      numeric: true,
      render: (term) => (
        <span className={term.syncQueueDepth > 0 ? 'font-semibold text-amber-700' : 'text-slate-700'}>
          {term.syncQueueDepth}
        </span>
      ),
    },
  ];

  const eventColumns = [
    {
      key: 'time',
      header: t('ops.time'),
      render: (row) => (
        <span className="text-slate-500">{new Date(row.createdAt).toLocaleString(locale)}</span>
      ),
    },
    {
      key: 'severity',
      header: t('ops.severity'),
      render: (row) => (
        <StatusBadge status={row.severity} label={t(`ops.severity.${row.severity}`)} />
      ),
    },
    {
      key: 'title',
      header: t('ops.event'),
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.title}</p>
          <p className="text-sm text-slate-500">{row.message}</p>
        </div>
      ),
    },
    {
      key: 'source',
      header: t('ops.source'),
      render: (row) => <span className="text-slate-600">{row.source ?? '—'}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('ops.title')}
        subtitle={t('ops.subtitle')}
        meta={
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-500 animate-pulse" />
            {t('ops.live')}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => load()}>
              <RefreshIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {t('common.retry')}
            </Button>
            <Button
              variant={notificationsEnabled ? 'primary' : 'secondary'}
              onClick={() => requestNotifications().catch(() => {})}
            >
              <BellIcon className="h-4 w-4" />
              {notificationsEnabled ? t('ops.notificationsOn') : t('ops.enableNotifications')}
            </Button>
          </>
        }
      />

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertIcon className="h-5 w-5 shrink-0" />
          {error}
        </div>
      ) : null}

      {latestAlert ? (
        <div
          className={`rounded-2xl border p-4 ${
            latestAlert.severity === OPS_SEVERITY.CRITICAL
              ? 'border-red-200 bg-red-50'
              : 'border-amber-200 bg-amber-50'
          }`}
        >
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            <BellIcon className="h-5 w-5" />
            {latestAlert.title}
          </h3>
          <p className="mt-1 text-sm text-slate-700">{latestAlert.message}</p>
        </div>
      ) : null}

      {loading && !dashboard ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
          <TableSkeleton rows={6} cols={4} />
        </>
      ) : dashboard ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t('ops.offlineTerminals')}
              value={summary.offlineTerminals ?? 0}
              icon={PowerIcon}
              tone={(summary.offlineTerminals ?? 0) > 0 ? 'amber' : 'emerald'}
            />
            <StatCard
              label={t('health.pendingSync')}
              value={summary.pendingSyncTotal ?? 0}
              icon={RefreshIcon}
              tone="blue"
            />
            <StatCard
              label={t('ops.openAlerts')}
              value={summary.openAlerts ?? 0}
              icon={AlertIcon}
              tone={(summary.openAlerts ?? 0) > 0 ? 'amber' : 'emerald'}
            />
            <StatCard
              label={t('health.memory')}
              value={`${health?.server?.memoryUsedPercent ?? 0}%`}
              icon={HealthIcon}
              tone={(health?.server?.memoryUsedPercent ?? 0) > 85 ? 'amber' : 'emerald'}
            />
          </div>

          {health?.alerts?.length > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="flex items-center gap-2 font-semibold text-amber-900">
                <AlertIcon className="h-5 w-5" />
                {t('health.alerts')}
              </h3>
              <ul className="mt-2 space-y-1 text-sm text-amber-800">
                {health.alerts.map((a) => (
                  <li key={a.terminalId}>{a.message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <SectionCard title={t('ops.incidents')} flush>
            <DataTable columns={eventColumns} rows={events} rowKey={(row) => row.id} />
          </SectionCard>

          <SectionCard title={t('health.terminal')} flush>
            <DataTable
              columns={terminalColumns}
              rows={health?.terminals ?? []}
              rowKey={(term) => term.id}
            />
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
