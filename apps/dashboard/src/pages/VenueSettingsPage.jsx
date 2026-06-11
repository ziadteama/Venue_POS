import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client.js';
import { friendlyError } from '../utils/apiError.js';
import { useAuth } from '../hooks/useAuth.js';
import { BillingMatrixSection } from '../components/BillingMatrixSection.jsx';
import { HubTablesSection } from '../components/HubTablesSection.jsx';
import { HubTaxMatrixSection } from '../components/HubTaxMatrixSection.jsx';
import { TerminalsSection } from '../components/TerminalsSection.jsx';
import { ReceiptPreviewSection } from '../components/ReceiptPreviewSection.jsx';
import { PageHeader } from '../components/dashboard/PageHeader.jsx';
import { SectionCard } from '../components/ui/Card.jsx';
import { Field, Input, Select } from '../components/ui/Field.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Drawer } from '../components/ui/Drawer.jsx';
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
  PlusIcon,
  ReceiptIcon,
} from '../components/dashboard/icons.jsx';

const RECEIPT_TEMPLATES = ['standard', 'compact', 'detailed'];

function emptyForm() {
  return {
    nameEn: '',
    nameAr: '',
    type: 'standard',
    receiptTemplate: 'standard',
    kitchenPrinterHost: '',
    kitchenPrinterPort: '9100',
    receiptPrinterHost: '',
    receiptPrinterPort: '9100',
    tablesText: '',
  };
}

function emptyConfigureForm() {
  return { nameEn: '', nameAr: '', type: 'standard' };
}

function tablesToText(tables) {
  if (!Array.isArray(tables)) return '';
  return tables
    .map((entry) => (typeof entry === 'string' ? entry : entry?.label))
    .filter(Boolean)
    .join('\n');
}

const VENUE_SECTIONS = ['printers', 'receipts', 'billing', 'terminals', 'audit'];

function emptyNewVenue() {
  return { nameEn: '', nameAr: '', type: 'standard' };
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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newVenue, setNewVenue] = useState(emptyNewVenue());
  const [section, setSection] = useState('restaurants');
  const [configureVenueId, setConfigureVenueId] = useState(null);
  const [configureForm, setConfigureForm] = useState(emptyConfigureForm());
  const [configureLoading, setConfigureLoading] = useState(false);
  const [configureSaving, setConfigureSaving] = useState(false);

  const loadVenues = useCallback(async () => {
    const list = await apiFetch('/api/v1/venues');
    setVenues(list);
    return list;
  }, []);

  const sections = useMemo(
    () => [
      { id: 'restaurants', label: t('venueConfig.restaurants'), icon: StoreIcon },
      { id: 'tax', label: t('venueConfig.taxAndService'), icon: RevenueIcon },
      { id: 'tables', label: t('venueConfig.tables'), icon: TablesIcon },
      { id: 'printers', label: t('venueConfig.printers'), icon: PrinterIcon },
      { id: 'receipts', label: t('receiptPreview.title'), icon: ReceiptIcon },
      { id: 'billing', label: t('billing.title'), icon: SettingsIcon },
      { id: 'terminals', label: t('terminals.title'), icon: PowerIcon },
      { id: 'audit', label: t('venueConfig.recentChanges'), icon: ActivityIcon },
    ],
    [t],
  );

  const loadVenueConfig = useCallback(async (id) => {
    if (!id) return null;
    const config = await apiFetch(`/api/v1/manager/venues/${id}/config`);
    setForm({
      nameEn: config.nameEn,
      nameAr: config.nameAr,
      type: config.type,
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
    return config;
  }, []);

  const load = useCallback(
    async (id) => {
      if (!id) return;
      setLoading(true);
      setError('');
      try {
        await loadVenueConfig(id);
      } catch (err) {
        setError(friendlyError(err));
      } finally {
        setLoading(false);
      }
    },
    [loadVenueConfig],
  );

  useEffect(() => {
    if (user?.role !== 'hub_manager') return;
    loadVenues()
      .then((list) => {
        setVenueId((current) => current || list[0]?.id || '');
      })
      .catch((err) => setError(friendlyError(err)));
  }, [user?.role, loadVenues]);

  useEffect(() => {
    if (venueId && VENUE_SECTIONS.includes(section)) load(venueId);
  }, [venueId, section, load]);

  const configuringVenue = venues.find((v) => v.id === configureVenueId);

  async function openConfigure(id) {
    setConfigureVenueId(id);
    setConfigureLoading(true);
    setError('');
    try {
      const config = await apiFetch(`/api/v1/manager/venues/${id}/config`);
      setConfigureForm({
        nameEn: config.nameEn,
        nameAr: config.nameAr,
        type: config.type,
      });
    } catch (err) {
      setError(friendlyError(err));
      setConfigureVenueId(null);
    } finally {
      setConfigureLoading(false);
    }
  }

  function closeConfigure() {
    if (configureSaving) return;
    setConfigureVenueId(null);
    setConfigureForm(emptyConfigureForm());
  }

  async function saveConfigure(e) {
    e.preventDefault();
    if (!configureVenueId) return;
    setConfigureSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await apiFetch(`/api/v1/manager/venues/${configureVenueId}/config`, {
        method: 'PATCH',
        body: JSON.stringify({
          nameEn: configureForm.nameEn.trim(),
          nameAr: configureForm.nameAr.trim(),
          type: configureForm.type,
        }),
      });
      setVenues((prev) =>
        prev.map((v) =>
          v.id === configureVenueId
            ? {
                ...v,
                nameEn: result.config.nameEn,
                nameAr: result.config.nameAr,
                type: result.config.type,
              }
            : v,
        ),
      );
      if (venueId === configureVenueId) {
        await loadVenueConfig(configureVenueId);
      }
      setSuccess(t('venueConfig.saved', { count: result.changes?.length ?? 0 }));
      closeConfigure();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setConfigureSaving(false);
    }
  }

  async function createRestaurant(e) {
    e.preventDefault();
    setCreating(true);
    setError('');
    setSuccess('');
    try {
      const created = await apiFetch('/api/v1/manager/venues', {
        method: 'POST',
        body: JSON.stringify({
          nameEn: newVenue.nameEn.trim(),
          nameAr: newVenue.nameAr.trim(),
          type: newVenue.type,
        }),
      });
      const list = await loadVenues();
      setVenueId(created.id);
      setNewVenue(emptyNewVenue());
      if (!list.some((v) => v.id === created.id)) {
        setVenues((prev) => [
          ...prev,
          { id: created.id, nameEn: created.nameEn, nameAr: created.nameAr, type: created.type },
        ]);
      }
      setSuccess(t('venueConfig.restaurantCreated', { name: created.nameEn }));
      await openConfigure(created.id);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setCreating(false);
    }
  }

  async function savePrinters(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await apiFetch(`/api/v1/manager/venues/${venueId}/config`, {
        method: 'PATCH',
        body: JSON.stringify({
          receiptTemplate: form.receiptTemplate,
          kitchenPrinterHost: form.kitchenPrinterHost.trim() || null,
          kitchenPrinterPort: Number(form.kitchenPrinterPort),
          receiptPrinterHost: form.receiptPrinterHost.trim() || null,
          receiptPrinterPort: Number(form.receiptPrinterPort),
        }),
      });
      setSuccess(t('venueConfig.saved', { count: result.changes?.length ?? 0 }));
      await loadVenueConfig(venueId);
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

  const needsVenuePicker = VENUE_SECTIONS.includes(section);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('venueConfig.title')}
        subtitle={t('venueConfig.subtitle')}
        actions={
          venues.length > 0 && needsVenuePicker ? (
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
          {loading && needsVenuePicker ? (
            <SectionCard>
              <p className="text-sm text-slate-500">{t('common.loading')}</p>
            </SectionCard>
          ) : section === 'restaurants' ? (
            <div className="space-y-6">
              <SectionCard title={t('venueConfig.restaurants')} icon={StoreIcon}>
                <p className="mb-4 text-sm text-slate-500">{t('venueConfig.restaurantsHint')}</p>
                {venues.length > 0 ? (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {venues.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                        <div>
                          <p className="font-medium text-slate-900">
                            {i18n.language === 'ar' ? v.nameAr || v.nameEn : v.nameEn}
                          </p>
                          <p className="text-xs text-slate-500">
                            {v.type === 'anchor'
                              ? t('venueConfig.typeAnchor')
                              : t('venueConfig.typeStandard')}
                          </p>
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => openConfigure(v.id)}>
                          {t('venueConfig.configureRestaurant')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">{t('venueConfig.noRestaurants')}</p>
                )}
              </SectionCard>

              <SectionCard title={t('venueConfig.addRestaurant')} icon={PlusIcon}>
                <form onSubmit={createRestaurant} className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('venueConfig.nameEn')}>
                    <Input
                      required
                      value={newVenue.nameEn}
                      onChange={(e) => setNewVenue((v) => ({ ...v, nameEn: e.target.value }))}
                    />
                  </Field>
                  <Field label={t('venueConfig.nameAr')}>
                    <Input
                      required
                      dir="rtl"
                      value={newVenue.nameAr}
                      onChange={(e) => setNewVenue((v) => ({ ...v, nameAr: e.target.value }))}
                    />
                  </Field>
                  <Field label={t('venueConfig.type')}>
                    <Select
                      value={newVenue.type}
                      onChange={(e) => setNewVenue((v) => ({ ...v, type: e.target.value }))}
                    >
                      <option value="standard">{t('venueConfig.typeStandard')}</option>
                      <option value="anchor">{t('venueConfig.typeAnchor')}</option>
                    </Select>
                  </Field>
                  <div className="flex items-end sm:col-span-2">
                    <Button type="submit" variant="primary" loading={creating}>
                      <PlusIcon className="h-4 w-4" />
                      {t('venueConfig.createRestaurant')}
                    </Button>
                  </div>
                </form>
              </SectionCard>
            </div>
          ) : section === 'tables' ? (
            <HubTablesSection />
          ) : section === 'tax' ? (
            <HubTaxMatrixSection />
          ) : section === 'printers' ? (
            <form onSubmit={savePrinters} className="space-y-6">
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

              <div className="sticky bottom-0 -mx-1 flex items-center justify-end gap-3 rounded-xl border border-slate-200 bg-white/90 px-4 py-3 shadow-card backdrop-blur">
                <Button type="submit" variant="primary" loading={saving}>
                  {t('common.save')}
                </Button>
              </div>
            </form>
          ) : section === 'receipts' ? (
            <ReceiptPreviewSection venueId={venueId} />
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

      <Drawer
        open={Boolean(configureVenueId)}
        onClose={closeConfigure}
        title={
          configuringVenue
            ? t('venueConfig.configureRestaurantTitle', {
                name: i18n.language === 'ar' ? configuringVenue.nameAr || configuringVenue.nameEn : configuringVenue.nameEn,
              })
            : t('venueConfig.configureRestaurant')
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeConfigure} disabled={configureSaving}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              form="configure-restaurant-form"
              variant="primary"
              loading={configureSaving}
              disabled={configureLoading}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        {configureLoading ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : (
          <form id="configure-restaurant-form" onSubmit={saveConfigure} className="space-y-4">
            <Field label={t('venueConfig.nameEn')}>
              <Input
                required
                value={configureForm.nameEn}
                onChange={(e) => setConfigureForm((f) => ({ ...f, nameEn: e.target.value }))}
              />
            </Field>
            <Field label={t('venueConfig.nameAr')}>
              <Input
                required
                dir="rtl"
                value={configureForm.nameAr}
                onChange={(e) => setConfigureForm((f) => ({ ...f, nameAr: e.target.value }))}
              />
            </Field>
            <Field label={t('venueConfig.type')}>
              <Select
                value={configureForm.type}
                onChange={(e) => setConfigureForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="standard">{t('venueConfig.typeStandard')}</option>
                <option value="anchor">{t('venueConfig.typeAnchor')}</option>
              </Select>
            </Field>
          </form>
        )}
      </Drawer>
    </div>
  );
}
