import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';

const RECEIPT_TEMPLATES = ['standard', 'compact', 'detailed'];

function emptyForm() {
  return {
    nameEn: '',
    nameAr: '',
    type: 'standard',
    taxRate: '0',
    taxInclusive: false,
    serviceRate: '0',
    serviceEnabled: false,
    receiptTemplate: 'standard',
    kitchenPrinterHost: '',
    kitchenPrinterPort: '9100',
    receiptPrinterHost: '',
    receiptPrinterPort: '9100',
    tablesText: '',
  };
}

function tablesToText(tables) {
  if (!Array.isArray(tables)) return '';
  return tables
    .map((entry) => (typeof entry === 'string' ? entry : entry?.label))
    .filter(Boolean)
    .join('\n');
}

function textToTables(text) {
  const seen = new Set();
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const label = line.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label });
  }
  return out;
}

export function VenueSettingsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState('');
  const [form, setForm] = useState(emptyForm());
  const [audits, setAudits] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const config = await apiFetch(`/api/v1/manager/venues/${id}/config`);
      setForm({
        nameEn: config.nameEn,
        nameAr: config.nameAr,
        type: config.type,
        taxRate: String((config.taxRate ?? 0) * 100),
        taxInclusive: config.taxInclusive,
        serviceRate: String((config.serviceRate ?? 0) * 100),
        serviceEnabled: config.serviceEnabled ?? false,
        receiptTemplate: config.receiptTemplate,
        kitchenPrinterHost: config.kitchenPrinterHost ?? '',
        kitchenPrinterPort: String(config.kitchenPrinterPort ?? 9100),
        receiptPrinterHost: config.receiptPrinterHost ?? '',
        receiptPrinterPort: String(config.receiptPrinterPort ?? 9100),
        tablesText: tablesToText(config.tables),
      });
      try {
        const auditList = await apiFetch(`/api/v1/manager/venues/${id}/config/audits`);
        setAudits(auditList);
      } catch {
        setAudits([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role !== 'hub_manager') return;
    apiFetch('/api/v1/venues')
      .then((list) => {
        setVenues(list);
        if (list[0]?.id) setVenueId(list[0].id);
      })
      .catch((err) => setError(err.message));
  }, [user?.role]);

  useEffect(() => {
    if (venueId) load(venueId);
  }, [venueId, load]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const taxPercent = Number(form.taxRate);
      const servicePercent = Number(form.serviceRate);
      const result = await apiFetch(`/api/v1/manager/venues/${venueId}/config`, {
        method: 'PATCH',
        body: JSON.stringify({
          nameEn: form.nameEn.trim(),
          nameAr: form.nameAr.trim(),
          type: form.type,
          taxRate: taxPercent / 100,
          taxInclusive: form.taxInclusive,
          serviceRate: servicePercent / 100,
          serviceEnabled: form.serviceEnabled,
          receiptTemplate: form.receiptTemplate,
          kitchenPrinterHost: form.kitchenPrinterHost.trim() || null,
          kitchenPrinterPort: Number(form.kitchenPrinterPort),
          receiptPrinterHost: form.receiptPrinterHost.trim() || null,
          receiptPrinterPort: Number(form.receiptPrinterPort),
          tables: textToTables(form.tablesText),
        }),
      });
      setSuccess(t('venueConfig.saved', { count: result.changes?.length ?? 0 }));
      await load(venueId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (user?.role !== 'hub_manager') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-secondary">
        {t('venueConfig.hubManagerOnly')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">{t('venueConfig.title')}</h2>
        <p className="mt-1 text-sm text-secondary">{t('venueConfig.subtitle')}</p>
      </div>

      {venues.length > 0 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-secondary">
            {t('venueConfig.venue')}
          </span>
          <select
            className="max-w-xs rounded-lg border border-slate-200 px-3 py-2"
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
          >
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {i18n.language === 'ar' ? v.nameAr || v.nameEn : v.nameEn}
              </option>
            ))}
          </select>
        </label>
      )}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </p>
      ) : null}

      {loading ? (
        <p className="text-secondary">{t('common.loading')}</p>
      ) : (
        <form onSubmit={save} className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold">{t('venueConfig.general')}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-secondary">{t('venueConfig.nameEn')}</span>
                <input
                  required
                  className="w-full rounded border px-3 py-2"
                  value={form.nameEn}
                  onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-secondary">{t('venueConfig.nameAr')}</span>
                <input
                  required
                  className="w-full rounded border px-3 py-2"
                  value={form.nameAr}
                  onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-secondary">{t('venueConfig.type')}</span>
                <select
                  className="w-full rounded border px-3 py-2"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                >
                  <option value="standard">{t('venueConfig.typeStandard')}</option>
                  <option value="anchor">{t('venueConfig.typeAnchor')}</option>
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold">{t('venueConfig.taxAndService')}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-secondary">{t('venueConfig.taxRate')}</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="w-full rounded border px-3 py-2"
                  value={form.taxRate}
                  onChange={(e) => setForm((f) => ({ ...f, taxRate: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-secondary">{t('venueConfig.serviceRate')}</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="w-full rounded border px-3 py-2"
                  value={form.serviceRate}
                  disabled={!form.serviceEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, serviceRate: e.target.value }))}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.taxInclusive}
                  onChange={(e) => setForm((f) => ({ ...f, taxInclusive: e.target.checked }))}
                />
                {t('venueConfig.taxInclusive')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.serviceEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, serviceEnabled: e.target.checked }))}
                />
                {t('venueConfig.serviceEnabled')}
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 text-lg font-semibold">{t('venueConfig.tables')}</h3>
            <p className="mb-4 text-sm text-secondary">{t('venueConfig.tablesHint')}</p>
            <textarea
              rows={8}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
              placeholder={t('venueConfig.tablesPlaceholder')}
              value={form.tablesText}
              onChange={(e) => setForm((f) => ({ ...f, tablesText: e.target.value }))}
            />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold">{t('venueConfig.printers')}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-secondary">{t('venueConfig.kitchenPrinterHost')}</span>
                <input
                  className="w-full rounded border px-3 py-2"
                  placeholder="192.168.1.50"
                  value={form.kitchenPrinterHost}
                  onChange={(e) => setForm((f) => ({ ...f, kitchenPrinterHost: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-secondary">{t('venueConfig.kitchenPrinterPort')}</span>
                <input
                  type="number"
                  className="w-full rounded border px-3 py-2"
                  value={form.kitchenPrinterPort}
                  onChange={(e) => setForm((f) => ({ ...f, kitchenPrinterPort: e.target.value }))}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-secondary">{t('venueConfig.receiptPrinterHost')}</span>
                <input
                  className="w-full rounded border px-3 py-2"
                  placeholder={t('venueConfig.receiptPrinterOptional')}
                  value={form.receiptPrinterHost}
                  onChange={(e) => setForm((f) => ({ ...f, receiptPrinterHost: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-secondary">{t('venueConfig.receiptTemplate')}</span>
                <select
                  className="w-full rounded border px-3 py-2"
                  value={form.receiptTemplate}
                  onChange={(e) => setForm((f) => ({ ...f, receiptTemplate: e.target.value }))}
                >
                  {RECEIPT_TEMPLATES.map((key) => (
                    <option key={key} value={key}>
                      {t(`venueConfig.template.${key}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary-to px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      )}

      {audits.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-lg font-semibold">{t('venueConfig.recentChanges')}</h3>
          <ul className="space-y-2 text-sm">
            {audits.map((row) => (
              <li key={row.id} className="rounded border border-slate-100 px-3 py-2">
                <span className="font-medium">{row.user}</span>
                <span className="text-secondary"> · {new Date(row.createdAt).toLocaleString()}</span>
                <pre className="mt-1 overflow-x-auto text-xs text-slate-600">
                  {JSON.stringify(row.changes, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
