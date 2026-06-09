import { Routes, Route, Navigate } from 'react-router-dom';
import { DASHBOARD_ROLES } from '@venue-pos/shared';
import { Layout } from './components/Layout.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { DashboardHome } from './pages/DashboardHome.jsx';
import { MenuManagerPage } from './pages/MenuManagerPage.jsx';
import { ChequesPage } from './pages/ChequesPage.jsx';
import { ActivityPage } from './pages/ActivityPage.jsx';
import { AnalyticsPage } from './pages/AnalyticsPage.jsx';
import { OrdersPage } from './pages/OrdersPage.jsx';
import { ShiftsPage } from './pages/ShiftsPage.jsx';
import { VenueSettingsPage } from './pages/VenueSettingsPage.jsx';
import { UsersPage } from './pages/UsersPage.jsx';
import { HealthPage } from './pages/HealthPage.jsx';
import { useAuth } from './hooks/useAuth.js';

function ProtectedRoute({ children }) {
  const { user, logout } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!DASHBOARD_ROLES.includes(user.role)) {
    logout();
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardHome />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="menus" element={<MenuManagerPage />} />
        <Route path="cheques" element={<ChequesPage />} />
        <Route path="shifts" element={<ShiftsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="health" element={<HealthPage />} />
        <Route path="settings" element={<VenueSettingsPage />} />
      </Route>
    </Routes>
  );
}
