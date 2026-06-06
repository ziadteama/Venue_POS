import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { DashboardHome } from './pages/DashboardHome.jsx';
import { MenuManagerPage } from './pages/MenuManagerPage.jsx';
import { ChequesPage } from './pages/ChequesPage.jsx';
import { ApprovalsPage } from './pages/ApprovalsPage.jsx';
import { useAuth } from './hooks/useAuth.js';

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
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
        <Route path="menus" element={<MenuManagerPage />} />
        <Route path="cheques" element={<ChequesPage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
      </Route>
    </Routes>
  );
}
