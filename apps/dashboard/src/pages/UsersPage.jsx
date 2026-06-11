import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isCeo, isHubDashboardRole } from '@venue-pos/shared';
import { apiFetch } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { useAuth } from '../hooks/useAuth.js';
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

const emptyForm = { username: '', role: 'cashier', pin: '', password: '', cardUid: '', venueId: '' };

const ROLE_TONES = {
  hub_owner: 'emerald',
  hub_manager: 'indigo',
  venue_manager: 'indigo',
  cashier: 'blue',
  kitchen_staff: 'violet',
};

function venueQuery(venueId) {
  return venueId ? `?venueId=${encodeURIComponent(venueId)}` : '';
}

function userScopeQuery(user, filterVenueId) {
  if (user.venueId) return venueQuery(user.venueId);
  return venueQuery(filterVenueId);
}

export function UsersPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const ownerView = isCeo(user?.role);
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [credentialUser, setCredentialUser] = useState(null);
  const [credentialValue, setCredentialValue] = useState('');
  const [credentialError, setCredentialError] = useState('');

  useEffect(() => {
    apiFetch('/api/v1/venues')
      .then((list) => {
        setVenues(list);
        if (!ownerView && list[0]?.id) setVenueId(list[0].id);
      })
      .catch((err) => setError(friendlyError(err)));
  }, [ownerView]);

  const canLoad = ownerView || Boolean(venueId);

  const load = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (venueId) params.set('venueId', venueId);
      if (search.trim()) params.set('search', search.trim());
      if (showInactive) params.set('includeInactive', 'true');
      const qs = params.toString();
      setUsers(await apiFetch(`/api/v1/manager/users${qs ? `?${qs}` : ''}`));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [canLoad, search, showInactive, venueId]);

  useEffect(() => {
    load();
  }, [load]);

  const formIsDashboardRole = form ? isHubDashboardRole(form.role) : false;

  async function submitCreate(e) {
    e.preventDefault();
    const targetVenueId = formIsDashboardRole ? '' : form.venueId || venueId;
    if (!formIsDashboardRole && !targetVenueId) return;
    setFormError('');
    try {
      const payload = {
        username: form.username,
        role: form.role,
        cardUid: form.cardUid || undefined,
      };
      if (formIsDashboardRole) payload.password = form.password;
      else payload.pin = form.pin;

      await apiFetch(`/api/v1/manager/users${venueQuery(targetVenueId)}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setForm(null);
      await load();
    } catch (err) {
      setFormError(friendlyError(err));
    }
  }

  async function submitCredential(e) {
    e.preventDefault();
    if (!credentialUser) return;
    setCredentialError('');
    try {
      const scope = userScopeQuery(credentialUser, venueId);
      if (isHubDashboardRole(credentialUser.role)) {
        await apiFetch(`/api/v1/manager/users/${credentialUser.id}/password`, {
          method: 'POST',
          body: JSON.stringify({ password: credentialValue }),
        });
      } else {
        await apiFetch(`/api/v1/manager/users/${credentialUser.id}/pin${scope}`, {
          method: 'POST',
          body: JSON.stringify({ pin: credentialValue }),
        });
      }
      setCredentialUser(null);
      setCredentialValue('');
    } catch (err) {
      setCredentialError(friendlyError(err));
    }
  }

  async function toggleActive(u) {
    setError('');
    try {
      await apiFetch(`/api/v1/manager/users/${u.id}/active${userScopeQuery(u, venueId)}`, {
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

  const roleOptions = useMemo(() => {
    if (ownerView) {
      return [
        { value: 'hub_owner', label: t('users.role.hub_owner') },
        { value: 'hub_manager', label: t('users.role.hub_manager') },
        { value: 'cashier', label: t('users.role.cashier') },
      ];
    }
    return [{ value: 'cashier', label: t('users.role.cashier') }];
  }, [ownerView, t]);

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
      key: 'venue',
      header: t('users.venue'),
      render: (u) => {
        if (!u.venueId) return <span className="text-slate-500">—</span>;
        const venue = venues.find((v) => v.id === u.venueId);
        return <span className="text-slate-500">{venue ? labelVenue(venue) : u.venueId}</span>;
      },
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
          {u.role === 'cashier' || (ownerView && isHubDashboardRole(u.role)) ? (
            <Button
              variant="subtle"
              size="sm"
              onClick={() => {
                setCredentialUser(u);
                setCredentialValue('');
                setCredentialError('');
              }}
            >
              <KeyIcon className="h-4 w-4" />
              {isHubDashboardRole(u.role) ? t('users.resetPassword') : t('users.resetPin')}
            </Button>
          ) : null}
          {(ownerView || u.role === 'cashier') && (
            <Button variant="subtle" size="sm" onClick={() => toggleActive(u)}>
              <PowerIcon className="h-4 w-4" />
              {u.isActive ? t('users.deactivate') : t('users.reactivate')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('users.title')}
        subtitle={ownerView ? t('users.subtitleOwner') : t('users.subtitleManager')}
        actions={
          <Button
            variant="primary"
            disabled={!ownerView && !venueId}
            onClick={() =>
              setForm({
                ...emptyForm,
                role: ownerView ? 'hub_manager' : 'cashier',
                venueId: venueId || venues[0]?.id || '',
              })
            }
          >
            <PlusIcon className="h-4 w-4" />
            {t('users.addStaff')}
          </Button>
        }
      />

      <FilterBar
        primary={
          <>
            <Select className="w-auto py-2" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
              {ownerView ? <option value="">{t('analytics.allVenues')}</option> : null}
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
            <Field label={t('users.role')}>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {roleOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </Field>
            {!formIsDashboardRole ? (
              <Field label={t('users.assignVenue')} hint={t('users.assignVenueCashierHint')}>
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
            ) : null}
            <Field label={t('users.username')}>
              <Input
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </Field>
            {formIsDashboardRole ? (
              <Field label={t('users.password')}>
                <Input
                  required
                  type="password"
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </Field>
            ) : (
              <>
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
              </>
            )}
          </form>
        ) : null}
      </Drawer>

      {credentialUser ? (
        <Modal
          onClose={() => setCredentialUser(null)}
          size="sm"
          icon={KeyIcon}
          title={
            isHubDashboardRole(credentialUser.role)
              ? t('users.resetPasswordTitle', { name: credentialUser.username })
              : t('users.resetPinTitle', { name: credentialUser.username })
          }
          error={credentialError}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCredentialUser(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" form="reset-credential-form" variant="primary">
                {isHubDashboardRole(credentialUser.role) ? t('users.resetPassword') : t('users.resetPin')}
              </Button>
            </>
          }
        >
          <form id="reset-credential-form" onSubmit={submitCredential}>
            <Field
              label={isHubDashboardRole(credentialUser.role) ? t('users.password') : t('users.pin')}
            >
              <Input
                required
                type="password"
                inputMode={isHubDashboardRole(credentialUser.role) ? 'text' : 'numeric'}
                maxLength={isHubDashboardRole(credentialUser.role) ? 100 : 6}
                minLength={isHubDashboardRole(credentialUser.role) ? 6 : 4}
                value={credentialValue}
                onChange={(e) => setCredentialValue(e.target.value)}
              />
            </Field>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
