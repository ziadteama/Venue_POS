import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch, API_URL } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { Modal } from './ui/Modal.jsx';
import { Button } from './ui/Button.jsx';
import { Field, Input, Select } from './ui/Field.jsx';
import { StatusBadge } from './ui/Badge.jsx';
import { SectionCard } from './ui/Card.jsx';
import { PlusIcon } from './dashboard/icons.jsx';

async function copyText(value) {
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function CopyRow({ label, value, mono = true }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    const ok = await copyText(value);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className={`mt-0.5 break-all text-sm text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onCopy} disabled={!value}>
          {copied ? t('terminals.copied') : t('terminals.copy')}
        </Button>
      </div>
    </div>
  );
}

export function OpsTerminalsSection() {
  const { t, i18n } = useTranslation();
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState('');
  const [terminals, setTerminals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [credentials, setCredentials] = useState(null);

  const hubApiUrl = API_URL || window.location.origin;

  const loadVenues = useCallback(async () => {
    try {
      const rows = await apiFetch('/api/v1/venues');
      const list = Array.isArray(rows) ? rows : [];
      setVenues(list);
      setVenueId((prev) => prev || list[0]?.id || '');
    } catch (err) {
      setError(friendlyError(err, t('ops.provision.loadVenuesFailed')));
    }
  }, [t]);

  const loadTerminals = useCallback(async () => {
    if (!venueId) {
      setTerminals([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const q = `?venueId=${encodeURIComponent(venueId)}`;
      const rows = await apiFetch(`/api/v1/ops/terminals${q}`);
      setTerminals(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(friendlyError(err, t('terminals.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [venueId, t]);

  useEffect(() => {
    loadVenues();
  }, [loadVenues]);

  useEffect(() => {
    loadTerminals();
  }, [loadTerminals]);

  async function submitCreate(e) {
    e.preventDefault();
    if (!venueId) return;
    setCreating(true);
    setCreateError('');
    try {
      const payload = { venueId };
      const trimmed = createName.trim();
      if (trimmed) payload.name = trimmed;
      const created = await apiFetch('/api/v1/ops/terminals', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setCreateOpen(false);
      setCreateName('');
      setCredentials({
        apiUrl: hubApiUrl,
        terminalId: created.id,
        terminalSecret: created.secret,
        venueId: created.venueId,
        name: created.name,
      });
      await loadTerminals();
    } catch (err) {
      setCreateError(friendlyError(err, t('terminals.createFailed')));
    } finally {
      setCreating(false);
    }
  }

  function statusLabel(status) {
    if (status === 'pending') return t('terminals.status.pending');
    if (status === 'online') return t('terminals.status.online');
    return t('terminals.status.offline');
  }

  function venueLabel(venue) {
    return i18n.language === 'ar' ? venue.nameAr || venue.nameEn : venue.nameEn;
  }

  return (
    <>
      <SectionCard
        title={t('ops.provision.title')}
        hint={t('ops.provision.subtitle')}
        action={
          <>
            {venues.length > 0 ? (
              <Select className="w-auto py-2" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {venueLabel(v)}
                  </option>
                ))}
              </Select>
            ) : null}
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!venueId}
              onClick={() => {
                setCreateError('');
                setCreateName('');
                setCreateOpen(true);
              }}
            >
              <PlusIcon className="h-4 w-4" />
              {t('terminals.addTerminal')}
            </Button>
          </>
        }
        flush
      >
        {error ? (
          <p className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
        <div className="px-6 py-5">
          {loading ? (
            <p className="text-sm text-slate-500">{t('common.loading')}</p>
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {terminals.map((terminal) => (
                  <li key={terminal.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{terminal.name ?? terminal.id}</p>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">{terminal.id}</p>
                    </div>
                    <StatusBadge
                      status={terminal.status ?? 'pending'}
                      label={statusLabel(terminal.status)}
                    />
                  </li>
                ))}
              </ul>
              {!terminals.length ? (
                <p className="text-sm text-slate-500">{t('terminals.empty')}</p>
              ) : null}
            </>
          )}
        </div>
      </SectionCard>

      <Modal
        open={createOpen}
        onClose={() => !creating && setCreateOpen(false)}
        title={t('terminals.createTitle')}
        subtitle={t('terminals.createSubtitle')}
        size="md"
        error={createError}
        footer={
          <>
            <Button type="button" variant="secondary" disabled={creating} onClick={() => setCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="ops-create-terminal-form" variant="primary" loading={creating}>
              {t('terminals.createSubmit')}
            </Button>
          </>
        }
      >
        <form id="ops-create-terminal-form" onSubmit={submitCreate} className="space-y-4">
          <Field label={t('ops.provision.venueLabel')}>
            <Select value={venueId} onChange={(e) => setVenueId(e.target.value)} disabled={creating}>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {venueLabel(v)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('terminals.createNameLabel')}>
            <Input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder={t('terminals.deviceNamePlaceholder')}
            />
          </Field>
          <p className="text-xs text-slate-500">{t('terminals.createNameHint')}</p>
        </form>
      </Modal>

      <Modal
        open={Boolean(credentials)}
        onClose={() => setCredentials(null)}
        title={t('terminals.credentialsTitle')}
        subtitle={credentials?.name ? t('terminals.credentialsSubtitle', { name: credentials.name }) : undefined}
        size="lg"
        footer={
          <Button type="button" variant="primary" onClick={() => setCredentials(null)}>
            {t('terminals.credentialsDone')}
          </Button>
        }
      >
        <p className="mb-4 text-sm text-amber-800 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
          {t('terminals.credentialsWarning')}
        </p>
        <div className="space-y-3">
          <CopyRow label={t('setup.apiUrl')} value={credentials?.apiUrl ?? ''} mono={false} />
          <CopyRow label={t('setup.terminalId')} value={credentials?.terminalId ?? ''} />
          <CopyRow label={t('setup.terminalSecret')} value={credentials?.terminalSecret ?? ''} />
          <CopyRow label={t('setup.venueId')} value={credentials?.venueId ?? ''} />
        </div>
        <p className="mt-4 text-xs text-slate-500">{t('terminals.credentialsHint')}</p>
      </Modal>
    </>
  );
}
