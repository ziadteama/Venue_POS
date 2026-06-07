import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';

const emptyForm = { username: '', role: 'cashier', pin: '', cardUid: '' };

export function UsersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState(null);
  const [pinUser, setPinUser] = useState(null);
  const [newPin, setNewPin] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (showInactive) params.set('includeInactive', 'true');
      const qs = params.toString() ? `?${params}` : '';
      setUsers(await apiFetch(`/api/v1/manager/users${qs}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, showInactive]);

  useEffect(() => {
    if (user?.role === 'venue_manager') load();
  }, [load, user?.role]);

  async function submitCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/api/v1/manager/users', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitPin(e) {
    e.preventDefault();
    setError('');
    try {
      await apiFetch(`/api/v1/manager/users/${pinUser.id}/pin`, {
        method: 'POST',
        body: JSON.stringify({ pin: newPin }),
      });
      setPinUser(null);
      setNewPin('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleActive(u) {
    setError('');
    try {
      await apiFetch(`/api/v1/manager/users/${u.id}/active`, {
        method: 'POST',
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (user?.role !== 'venue_manager') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-secondary">
        {t('users.venueManagerOnly')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{t('users.title')}</h2>
          <p className="mt-1 text-sm text-secondary">{t('users.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setForm({ ...emptyForm })}
          className="rounded-lg bg-primary-gradient px-4 py-2 text-sm font-medium text-white"
        >
          {t('users.addStaff')}
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder={t('users.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-secondary">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          {t('users.showInactive')}
        </label>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <p className="text-secondary">{t('common.loading')}</p>
      ) : users.length === 0 ? (
        <p className="text-secondary">{t('users.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-secondary">
              <tr>
                <th className="px-4 py-3">{t('users.username')}</th>
                <th className="px-4 py-3">{t('users.role')}</th>
                <th className="px-4 py-3">{t('users.cardUid')}</th>
                <th className="px-4 py-3">{t('users.status')}</th>
                <th className="px-4 py-3">{t('users.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium">{u.username}</td>
                  <td className="px-4 py-3">{t(`users.role.${u.role}`)}</td>
                  <td className="px-4 py-3 text-secondary">{u.cardUid || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        u.isActive
                          ? 'text-emerald-700'
                          : 'text-red-600'
                      }
                    >
                      {u.isActive ? t('users.active') : t('users.inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="text-xs font-medium text-primary-from hover:underline"
                        onClick={() => {
                          setPinUser(u);
                          setNewPin('');
                        }}
                      >
                        {t('users.resetPin')}
                      </button>
                      <button
                        type="button"
                        className="text-xs font-medium text-secondary hover:underline"
                        onClick={() => toggleActive(u)}
                      >
                        {u.isActive ? t('users.deactivate') : t('users.reactivate')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={submitCreate}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <h3 className="text-lg font-semibold">{t('users.addStaff')}</h3>
            <label className="mt-4 block text-sm">
              <span className="text-secondary">{t('users.username')}</span>
              <input
                required
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="text-secondary">{t('users.role')}</span>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="cashier">{t('users.role.cashier')}</option>
                <option value="kitchen_staff">{t('users.role.kitchen_staff')}</option>
              </select>
            </label>
            <label className="mt-3 block text-sm">
              <span className="text-secondary">{t('users.pin')}</span>
              <input
                required
                type="password"
                inputMode="numeric"
                maxLength={6}
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value })}
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="text-secondary">{t('users.cardUid')}</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.cardUid}
                onChange={(e) => setForm({ ...form, cardUid: e.target.value })}
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="rounded-lg border px-4 py-2 text-sm">
                {t('common.cancel')}
              </button>
              <button type="submit" className="rounded-lg bg-primary-gradient px-4 py-2 text-sm font-medium text-white">
                {t('common.save')}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {pinUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={submitPin}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <h3 className="text-lg font-semibold">{t('users.resetPinTitle', { name: pinUser.username })}</h3>
            <input
              required
              type="password"
              inputMode="numeric"
              maxLength={6}
              className="mt-4 w-full rounded-lg border px-3 py-2"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
            />
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setPinUser(null)} className="rounded-lg border px-4 py-2 text-sm">
                {t('common.cancel')}
              </button>
              <button type="submit" className="rounded-lg bg-primary-gradient px-4 py-2 text-sm font-medium text-white">
                {t('users.resetPin')}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
