import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { useAuth } from '../hooks/useAuth.js';
import { BillingMatrixSection } from '../components/BillingMatrixSection.jsx';
import { HubTablesSection } from '../components/HubTablesSection.jsx';
import { HubTaxMatrixSection } from '../components/HubTaxMatrixSection.jsx';
import { TerminalsSection } from '../components/TerminalsSection.jsx';
import { PageHeader } from '../components/dashboard/PageHeader.jsx';
import { SectionCard } from '../components/ui/Card.jsx';
import { Field, Input, Select } from '../components/ui/Field.jsx';
import { Button } from '../components/ui/Button.jsx';
import {
  SettingsIcon,
  RevenueIcon,
  TablesIcon,
  PrinterIcon,
  StoreIcon,
  PowerIcon,
  ActivityIcon,
  AlertIcon,
  CheckCircleIcon,
} from '../components/dashboard/icons.jsx';

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

const FORM_SECTIONS = ['general', 'printers'];
const HUB_SECTIONS = ['tax', 'tables'];

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
  const [section, setSection] = useState('general');

  const sections = useMemo(
    () => [
      { id: 'general', label: t('venueConfig.general'), icon: StoreIcon },
      { id: 'tax', label: t('venueConfig.taxAndService'), icon: RevenueIcon },
      { id: 'tables', label: t('venueConfig.tables'), icon: TablesIcon },
      { id: 'printers', label: t('venueConfig.printers'), icon: PrinterIcon },
      { id: 'billing', label: t('billing.title'), icon: SettingsIcon },
      { id: 'terminals', label: t('terminals.title'), icon: PowerIcon },
      { id: 'audit', label: t('venueConfig.recentChanges'), icon: ActivityIcon },
    ],
    [t],
  );

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
      setError(friendlyError(err));
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
      .catch((err) => setError(friendlyError(err)));
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
        }),
      });
      setSuccess(t('venueConfig.saved', { count: result.changes?.length ?? 0 }));
      await load(venueId);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  if (user?.role !== 'hub_manager') {
    return (
      <div className="surface-card p-8 text-center text-sm text-slate-500">
        {t('venueConfig.hubManagerOnly')}
      </div>
    );
  }

  const isFormSection = FORM_SECTIONS.includes(section);
  const isHubSection = HUB_SECTIONS.includes(section);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('venueConfig.title')}
        subtitle={t('venueConfig.subtitle')}
        actions={
          venues.length > 0 && !isHubSection ? (
            <Select className="w-auto py-2" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {i18n.language === 'ar' ? v.nameAr || v.nameEn : v.nameEn}
                </option>
              ))}
            </Select>
          ) : null
        }
      />

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertIcon className="h-5 w-5 shrink-0" />
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="flex items-center gap-2 rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm font-medium text-accent-700">
          <CheckCircleIcon className="h-5 w-5 shrink-0" />
          {success}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <nav className="surface-card h-max overflow-hidden p-2 lg:sticky lg:top-20">
          {sections.map((s) => {
            const active = section === s.id;
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-start text-sm font-medium transition ${
                  active
                    ? 'bg-accent-50 text-accent-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {s.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          {loading ? (
            <SectionCard>
              <p className="text-sm text-slate-500">{t('common.loading')}</p>
            </SectionCard>
          ) : section === 'tables' ? (
            <HubTablesSection />
          ) : section === 'tax' ? (
            <HubTaxMatrixSection />
          ) : isFormSection ? (
            <form onSubmit={save} className="space-y-6">
              {section === 'general' ? (
                <SectionCard title={t('venueConfig.general')} icon={StoreIcon}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('venueConfig.nameEn')}>
                      <Input
                        required
                        value={form.nameEn}
                        onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
                      />
                    </Field>
                    <Field label={t('venueConfig.nameAr')}>
                      <Input
                        required
                        dir="rtl"
                        value={form.nameAr}
                        onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))}
                      />
                    </Field>
                    <Field label={t('venueConfig.type')}>
                      <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                        <option value="standard">{t('venueConfig.typeStandard')}</option>
                        <option value="anchor">{t('venueConfig.typeAnchor')}</option>
                      </Select>
                    </Field>
                  </div>
                </SectionCard>
              ) : null}

              {section === 'printers' ? (
                <SectionCard title={t('venueConfig.printers')} icon={PrinterIcon}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field className="sm:col-span-2" label={t('venueConfig.kitchenPrinterHost')}>
                      <Input
                        placeholder="192.168.1.50"
                        value={form.kitchenPrinterHost}
                        onChange={(e) => setForm((f) => ({ ...f, kitchenPrinterHost: e.target.value }))}
                      />
                    </Field>
                    <Field label={t('venueConfig.kitchenPrinterPort')}>
                      <Input
                        type="number"
                        value={form.kitchenPrinterPort}
                        onChange={(e) => setForm((f) => ({ ...f, kitchenPrinterPort: e.target.value }))}
                      />
                    </Field>
                    <Field className="sm:col-span-2" label={t('venueConfig.receiptPrinterHost')}>
                      <Input
                        placeholder={t('venueConfig.receiptPrinterOptional')}
                        value={form.receiptPrinterHost}
                        onChange={(e) => setForm((f) => ({ ...f, receiptPrinterHost: e.target.value }))}
                      />
                    </Field>
                    <Field label={t('venueConfig.receiptTemplate')}>
                      <Select
                        value={form.receiptTemplate}
                        onChange={(e) => setForm((f) => ({ ...f, receiptTemplate: e.target.value }))}
                      >
                        {RECEIPT_TEMPLATES.map((key) => (
                          <option key={key} value={key}>
                            {t(`venueConfig.template.${key}`)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                </SectionCard>
              ) : null}

              <div className="sticky bottom-0 -mx-1 flex items-center justify-end gap-3 rounded-xl border border-slate-200 bg-white/90 px-4 py-3 shadow-card backdrop-blur">
                <span className="me-auto text-xs text-slate-400">{t('venueConfig.subtitle')}</span>
                <Button type="submit" variant="primary" loading={saving}>
                  {t('common.save')}
                </Button>
              </div>
            </form>
          ) : section === 'billing' ? (
            venueId ? (
              <BillingMatrixSection anchorVenueId={venueId} anchorType={form.type} />
            ) : null
          ) : section === 'terminals' ? (
            <TerminalsSection venueId={venueId || undefined} />
          ) : section === 'audit' ? (
            <SectionCard title={t('venueConfig.recentChanges')} icon={ActivityIcon}>
              {audits.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {audits.map((row) => (
                    <li key={row.id} className="rounded-xl border border-slate-100 bg-surface-overlay px-3 py-2">
                      <span className="font-medium text-slate-900">{row.user}</span>
                      <span className="text-slate-400"> · {new Date(row.createdAt).toLocaleString()}</span>
                      <pre className="scrollbar-slim mt-1 overflow-x-auto text-xs text-slate-600">
                        {JSON.stringify(row.changes, null, 2)}
                      </pre>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">{t('dashboard.noRecentChanges')}</p>
              )}
            </SectionCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
