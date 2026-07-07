import React, { useEffect, useSyncExternalStore } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { authStore } from './stores/authStore';
import { AdminLayout } from './layouts/AdminLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { ConsumerUsersPage } from './pages/users/ConsumerUsersPage';
import { AdminUsersPage } from './pages/admins/AdminUsersPage';
import { SystemConfigsPage } from './pages/configs/SystemConfigsPage';
import { AuditLogPage } from './pages/audit/AuditLogPage';
import { DemoRequestsPage } from './pages/demo/DemoRequestsPage';
import { DemoRequestDetailPage } from './pages/demo/DemoRequestDetailPage';
import { OrgMembersPage } from './pages/org/OrgMembersPage';
import { TenantDocumentsPage } from './pages/tenant/TenantDocumentsPage';
import { TemplatesPage } from './pages/templates/TemplatesPage';
import { TemplateDetailPage } from './pages/templates/TemplateDetailPage';
import { TemplateEditPage } from './pages/templates/TemplateEditPage';

const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const state = useSyncExternalStore(authStore.subscribe, authStore.getState);
  if (!state.initialized) return <div style={{ padding: 48, textAlign: 'center' }}>加载中…</div>;
  if (!state.accessToken) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const GuestGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const state = useSyncExternalStore(authStore.subscribe, authStore.getState);
  if (!state.initialized) return <div style={{ padding: 48, textAlign: 'center' }}>加载中…</div>;
  if (state.accessToken) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const Bootstrap: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => { void authStore.init(); }, []);
  return <>{children}</>;
};

const App: React.FC = () => (
  <Bootstrap>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<GuestGuard><LoginPage /></GuestGuard>} />
        <Route element={<AuthGuard><AdminLayout /></AuthGuard>}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/users" element={<ConsumerUsersPage />} />
          <Route path="/admins" element={<AdminUsersPage />} />
          <Route path="/configs" element={<SystemConfigsPage />} />
          <Route path="/audit" element={<AuditLogPage />} />
          <Route path="/demo-requests" element={<DemoRequestsPage />} />
          <Route path="/demo-requests/:id" element={<DemoRequestDetailPage />} />
          <Route path="/org/members" element={<OrgMembersPage />} />
          <Route path="/platform/tenants" element={<Navigate to="/org/members" replace />} />
          <Route path="/tenant/members" element={<Navigate to="/org/members" replace />} />
          <Route path="/tenant/documents" element={<TenantDocumentsPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/templates/new" element={<TemplateEditPage />} />
          <Route path="/templates/:id" element={<TemplateDetailPage />} />
          <Route path="/templates/:id/edit" element={<TemplateEditPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </Bootstrap>
);

export default App;
