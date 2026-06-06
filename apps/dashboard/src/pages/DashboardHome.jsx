import { useTranslation } from 'react-i18next';

export function DashboardHome() {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8">
      <h2 className="text-xl font-semibold">{t('dashboard.title')}</h2>
      <p className="mt-2 text-secondary">Phase 0 scaffold — modules coming in Phase 5.</p>
    </div>
  );
}
