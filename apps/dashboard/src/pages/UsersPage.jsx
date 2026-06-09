import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { PageHeader } from '../components/dashboard/PageHeader.jsx';
import { FilterBar, SearchInput } from '../components/ui/FilterBar.jsx';
import { Field, Input, Select } from '../components/ui/Field.jsx';
import { Button } from '../components/ui/Button.jsx';
import { DataTable } from '../components/ui/DataTable.jsx';
import { Drawer } from '../components/ui/Drawer.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { Badge, StatusBadge } from '../components/ui/Badge.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { TableSkeleton } from '../components/dashboard/Skeleton.jsx';
import { UsersIcon, PlusIcon, KeyIcon, PowerIcon, AlertIcon } from '../components/dashboard/icons.jsx';

const emptyForm = { username: '', role: 'cashier', pin: '', cardUid: '', venueId: '' };

const ROLE_TONES = {
  venue_manager: 'indigo',
  cashier: 'blue',
  kitchen_staff: 'violet',
};

function venueQuery(venueId) {
  return venueId ? `?venueId=${encodeURIComponent(venueId)}` : '';
}

export function UsersPage() {
  const { t, i18n } = useTranslation();
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [pinUser, setPinUser] = useState(null);
  const [newPin, setNewPin] = useState('');
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    apiFetch('/api/v1/venues')
      .then((list) => {
        setVenues(list);
        if (list[0]?.id) setVenueId(list[0].id);
      })
      .catch((err) => setError(friendlyError(err)));
  }, []);

  const load = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ venueId });
      if (search.trim()) params.set('search', search.trim());
      if (showInactive) params.set('includeInactive', 'true');
      setUsers(await apiFetch(`/api/v1/manager/users?${params}`));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [search, showInactive, venueId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitCreate(e) {
    e.preventDefault();
    const targetVenueId = form.venueId || venueId;
    if (!targetVenueId) return;
    setFormError('');
    try {
      await apiFetch(`/api/v1/manager/users${venueQuery(targetVenueId)}`, {
        method: 'POST',
        body: JSON.stringify({
          username: form.username,
          role: form.role,
          pin: form.pin,
          cardUid: form.cardUid,
        }),
      });
      setForm(null);
      if (targetVenueId !== venueId) {
        setVenueId(targetVenueId);
      } else {
        await load();
      }
    } catch (err) {
      setFormError(friendlyError(err));
    }
  }

  async function submitPin(e) {
    e.preventDefault();
    if (!venueId) return;
    setPinError('');
    try {
      await apiFetch(`/api/v1/manager/users/${pinUser.id}/pin${venueQuery(venueId)}`, {
        method: 'POST',
        body: JSON.stringify({ pin: newPin }),
      });
      setPinUser(null);
      setNewPin('');
    } catch (err) {
      setPinError(friendlyError(err));
    }
  }

  async function toggleActive(u) {
    if (!venueId) return;
    setError('');
    try {
      await apiFetch(`/api/v1/manager/users/${u.id}/active${venueQuery(venueId)}`, {
        method: 'POST',
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      await load();
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  function labelVenue(v) {
    return i18n.language === 'ar' ? v.nameAr || v.nameEn : v.nameEn;
  }

  const columns = [
    {
      key: 'username',
      header: t('users.username'),
      render: (u) => <span className="font-medium text-slate-900">{u.username}</span>,
    },
    {
      key: 'role',
      header: t('users.role'),
      render: (u) => <Badge tone={ROLE_TONES[u.role] ?? 'neutral'}>{t(`users.role.${u.role}`)}</Badge>,
    },
    {
      key: 'cardUid',
      header: t('users.cardUid'),
      render: (u) => <span className="text-slate-500">{u.cardUid || '—'}</span>,
    },
    {
      key: 'status',
      header: t('users.status'),
      render: (u) => (
        <StatusBadge
          status={u.isActive ? 'active' : 'inactive'}
          label={u.isActive ? t('users.active') : t('users.inactive')}
        />
      ),
    },
    {
      key: 'actions',
      header: t('users.actions'),
      align: 'end',
      render: (u) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="subtle"
            size="sm"
            onClick={() => {
              setPinUser(u);
              setNewPin('');
              setPinError('');
            }}
          >
            <KeyIcon className="h-4 w-4" />
            {t('users.resetPin')}
          </Button>
          <Button variant="subtle" size="sm" onClick={() => toggleActive(u)}>
            <PowerIcon className="h-4 w-4" />
            {u.isActive ? t('users.deactivate') : t('users.reactivate')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('users.title')}
        subtitle={t('users.subtitleHub')}
        actions={
          <Button variant="primary" disabled={!venueId} onClick={() => setForm({ ...emptyForm, venueId })}>
            <PlusIcon className="h-4 w-4" />
            {t('users.addStaff')}
          </Button>
        }
      />

      <FilterBar
        primary={
          <>
            <Select className="w-auto py-2" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {labelVenue(v)}
                </option>
              ))}
            </Select>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('users.searchPlaceholder')}
              className="w-full sm:w-64"
            />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500/30"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              {t('users.showInactive')}
            </label>
          </>
        }
      />

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertIcon className="h-5 w-5 shrink-0" />
          {error}
        </div>
      ) : null}

      {loading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : users.length === 0 ? (
        <div className="surface-card">
          <EmptyState icon={UsersIcon} title={t('users.empty')} className="py-16" />
        </div>
      ) : (
        <div className="surface-card overflow-hidden">
          <DataTable columns={columns} rows={users} rowKey={(u) => u.id} />
        </div>
      )}

      <Drawer
        open={Boolean(form)}
        onClose={() => setForm(null)}
        size="md"
        icon={UsersIcon}
        title={t('users.addStaff')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="user-create-form" variant="primary">
              {t('common.save')}
            </Button>
          </>
        }
      >
        {form ? (
          <form id="user-create-form" onSubmit={submitCreate} className="space-y-4">
            {formError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
                {formError}
              </div>
            ) : null}
            <Field
              label={t('users.assignVenue')}
              hint={form.role === 'cashier' ? t('users.assignVenueCashierHint') : t('users.assignVenueHint')}
            >
              <Select
                required
                value={form.venueId}
                onChange={(e) => setForm({ ...form, venueId: e.target.value })}
              >
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {labelVenue(v)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('users.username')}>
              <Input
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </Field>
            <Field label={t('users.role')}>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="cashier">{t('users.role.cashier')}</option>
                <option value="venue_manager">{t('users.role.venue_manager')}</option>
                <option value="kitchen_staff">{t('users.role.kitchen_staff')}</option>
              </Select>
            </Field>
            <Field label={t('users.pin')}>
              <Input
                required
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value })}
              />
            </Field>
            <Field label={t('users.cardUid')}>
              <Input value={form.cardUid} onChange={(e) => setForm({ ...form, cardUid: e.target.value })} />
            </Field>
          </form>
        ) : null}
      </Drawer>

      {pinUser ? (
        <Modal
          onClose={() => setPinUser(null)}
          size="sm"
          icon={KeyIcon}
          title={t('users.resetPinTitle', { name: pinUser.username })}
          error={pinError}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPinUser(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" form="reset-pin-form" variant="primary">
                {t('users.resetPin')}
              </Button>
            </>
          }
        >
          <form id="reset-pin-form" onSubmit={submitPin}>
            <Field label={t('users.pin')}>
              <Input
                required
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
              />
            </Field>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
