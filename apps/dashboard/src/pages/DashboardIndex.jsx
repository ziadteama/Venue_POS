import { isHubManager } from '@venue-pos/shared';
import { useAuth } from '../hooks/useAuth.js';
import { DashboardHome } from './DashboardHome.jsx';
import { OperationsOverviewPage } from './OperationsOverviewPage.jsx';

export function DashboardIndex() {
  const { user } = useAuth();
  return isHubManager(user?.role) ? <OperationsOverviewPage /> : <DashboardHome />;
}
