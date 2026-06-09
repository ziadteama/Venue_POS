import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isHubStaff } from '@venue-pos/shared';
import { apiFetch, apiFetchBlob } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { useAuth } from '../hooks/useAuth.js';
import { PageHeader } from '../components/dashboard/PageHeader.jsx';
import { StatCard } from '../components/dashboard/StatCard.jsx';
import { StatCardSkeleton, TableSkeleton } from '../components/dashboard/Skeleton.jsx';
import { SectionCard } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Select } from '../components/ui/Field.jsx';
import { DataTable } from '../components/ui/DataTable.jsx';
import { StatusBadge } from '../components/ui/Badge.jsx';
import {
  DownloadIcon,
  PowerIcon,
  RefreshIcon,
  HealthIcon,
  AlertIcon,
} from '../components/dashboard/icons.jsx';

export function HealthPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState(null);
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState(user?.venueId ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const canPickVenue = isHubStaff(user?.role);
  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      const scoped = canPickVenue ? venueId : user?.venueId;
      if (scoped) params.set('venueId', scoped);
      const qs = params.toString() ? `?${params}` : '';
      const [data, venueList] = await Promise.all([
        apiFetch(`/api/v1/manager/health${qs}`),
        canPickVenue ? apiFetch('/api/v1/venues') : Promise.resolve([]),
      ]);
      setSnapshot(data);
      if (canPickVenue) setVenues(venueList);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [canPickVenue, venueId, user?.venueId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  async function exportCsv() {
    const params = new URLSearchParams({ format: 'csv' });
    const scoped = canPickVenue ? venueId : user?.venueId;
    if (scoped) params.set('venueId', scoped);
    const blob = await apiFetchBlob(`/api/v1/manager/health?${params}`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'system-health.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns = [
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
      key: 'lastSeen',
      header: t('health.lastSeen'),
      render: (term) => (
        <span className="text-slate-500">
          {term.lastSeenAt ? new Date(term.lastSeenAt).toLocaleString(locale) : '—'}
        </span>
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('health.title')}
        subtitle={t('health.subtitle')}
        meta={
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-500 animate-pulse" />
            {t('health.autoRefresh')}
          </span>
        }
        actions={
          <>
            {canPickVenue && venues.length > 0 ? (
              <Select className="w-auto py-2" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
                <option value="">{t('orders.allVenues')}</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {i18n.language === 'ar' ? v.nameAr || v.nameEn : v.nameEn}
                  </option>
                ))}
              </Select>
            ) : null}
            <Button variant="secondary" onClick={() => load()}>
              <RefreshIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {t('common.retry')}
            </Button>
            <Button variant="secondary" onClick={() => exportCsv().catch((e) => setError(friendlyError(e)))}>
              <DownloadIcon className="h-4 w-4" />
              {t('health.exportCsv')}
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

      {loading && !snapshot ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
          <TableSkeleton rows={6} cols={5} />
        </>
      ) : snapshot ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t('health.onlineTerminals')}
              value={`${snapshot.summary.onlineCount}/${snapshot.summary.terminalCount}`}
              icon={PowerIcon}
              tone={snapshot.summary.onlineCount < snapshot.summary.terminalCount ? 'amber' : 'emerald'}
            />
            <StatCard
              label={t('health.pendingSync')}
              value={snapshot.summary.pendingSyncTotal}
              icon={RefreshIcon}
              tone="blue"
            />
            <StatCard
              label={t('health.wsConnections')}
              value={snapshot.summary.wsConnections.total}
              icon={HealthIcon}
              tone="violet"
            />
            <StatCard
              label={t('health.memory')}
              value={`${snapshot.server.memoryUsedPercent}%`}
              icon={HealthIcon}
              tone={snapshot.server.memoryUsedPercent > 85 ? 'amber' : 'emerald'}
            />
          </div>

          {snapshot.alerts?.length > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="flex items-center gap-2 font-semibold text-amber-900">
                <AlertIcon className="h-5 w-5" />
                {t('health.alerts')}
              </h3>
              <ul className="mt-2 space-y-1 text-sm text-amber-800">
                {snapshot.alerts.map((a) => (
                  <li key={a.terminalId}>{a.message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <SectionCard title={t('health.terminal')} flush>
            <DataTable columns={columns} rows={snapshot.terminals} rowKey={(term) => term.id} />
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
