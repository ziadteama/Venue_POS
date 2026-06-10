import { isCeo } from '@venue-pos/shared';
import { useAuth } from '../hooks/useAuth.js';
import { DashboardHome } from './DashboardHome.jsx';
import { OperationsOverviewPage } from './OperationsOverviewPage.jsx';

export function DashboardIndex() {
  const { user } = useAuth();
  if (isCeo(user?.role)) return <DashboardHome />;
  return <OperationsOverviewPage />;
}
