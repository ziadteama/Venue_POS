import { useTranslation } from 'react-i18next';
import { canManageHubConfig } from '@venue-pos/shared';
import { useAuth } from '../hooks/useAuth.js';
import { FeaturesSection } from '../components/FeaturesSection.jsx';
import { PageHeader } from '../components/dashboard/PageHeader.jsx';

export function HubSettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  if (!canManageHubConfig(user?.role)) {
    return (
      <div className="surface-card p-8 text-center text-sm text-slate-500">
        {t('hubSettings.devOpsOnly')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('hubSettings.title')} subtitle={t('hubSettings.subtitle')} />
      <FeaturesSection />
    </div>
  );
}
