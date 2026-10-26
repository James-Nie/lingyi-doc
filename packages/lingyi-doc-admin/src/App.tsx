import React, { useEffect, useSyncExternalStore } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { authStore } from './stores/authStore';
import { tenantStore } from './stores/tenantStore';
import { AdminLayout } from './layouts/AdminLayout';
import { PermissionRoute } from './components/PermissionRoute';
import { TenantRequired } from './components/TenantRequired';
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { SystemConfigsPage } from './pages/configs/SystemConfigsPage';
import { AuditLogPage } from './pages/audit/AuditLogPage';
import { DemoRequestsPage } from './pages/demo/DemoRequestsPage';
import { DemoRequestDetailPage } from './pages/demo/DemoRequestDetailPage';
import { OrgManagementPage } from './pages/org/OrgManagementPage';
import { OrgRolesPage } from './pages/org/OrgRolesPage';
import { OrgTeamPage } from './pages/org/OrgTeamPage';
import { OrgPositionsPage } from './pages/org/OrgPositionsPage';
import { TemplatesPage } from './pages/templates/TemplatesPage';
import { TemplateDetailPage } from './pages/templates/TemplateDetailPage';
import { TemplateEditPage } from './pages/templates/TemplateEditPage';
import { AiModelConfigPage } from './pages/ai/AiModelConfigPage';
import { AiUsageMonitorPage } from './pages/ai/AiUsageMonitorPage';
import { StorageManagementPage } from './pages/storage/StorageManagementPage';
import { SecurityPolicyPage } from './pages/security/SecurityPolicyPage';
import { ApiKeysPage } from './pages/api-keys/ApiKeysPage';
import { DocumentsPage } from './pages/documents/DocumentsPage';
import { ConsumerUsersPage } from './pages/users/ConsumerUsersPage';
import { RolesPage } from './pages/admins/RolesPage';
import { AdminGroupsPage } from './pages/admins/AdminGroupsPage';
import AdminUsersPage from './pages/admins/AdminUsersPage';

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
  useEffect(() => {
    void (async () => {
      await authStore.init();
      if (authStore.getAccessToken()) {
        await tenantStore.load();
      }
    })();
  }, []);
  return <>{children}</>;
};

/**
 * 管理后台路由表。
 *
 * 自 2026-09-19（P0 能力建设）起，所有业务路由都包在 `PermissionRoute` 中，
 * 修复评审缺陷 F5（此前只有菜单可见性控制，直接敲 URL 可进入无权限页）。
 *
 * 另：已删除 `PlatformTenantsPage` / `TenantMembersPage` 两个死代码页（缺陷 F4），
 * 其路由此前已统一重定向到 `/org/members`。
 */
const App: React.FC = () => (
  <Bootstrap>
    <BrowserRouter basename="/admin">
      <Routes>
        <Route path="/login" element={<GuestGuard><LoginPage /></GuestGuard>} />
        <Route element={<AuthGuard><AdminLayout /></AuthGuard>}>
          <Route path="/" element={<PermissionRoute anyOf={['dashboard:read']}><DashboardPage /></PermissionRoute>} />

          <Route path="/documents" element={<PermissionRoute anyOf={['document:read']}><DocumentsPage /></PermissionRoute>} />

          <Route path="/demo-requests" element={<PermissionRoute anyOf={['demo:read']}><DemoRequestsPage /></PermissionRoute>} />
          <Route path="/demo-requests/:id" element={<PermissionRoute anyOf={['demo:read']}><DemoRequestDetailPage /></PermissionRoute>} />

          <Route path="/templates" element={<PermissionRoute anyOf={['template:read']}><TemplatesPage /></PermissionRoute>} />
          <Route path="/templates/new" element={<PermissionRoute anyOf={['template:write']}><TemplateEditPage /></PermissionRoute>} />
          <Route path="/templates/:id" element={<PermissionRoute anyOf={['template:read']}><TemplateDetailPage /></PermissionRoute>} />
          <Route path="/templates/:id/edit" element={<PermissionRoute anyOf={['template:write']}><TemplateEditPage /></PermissionRoute>} />

          <Route path="/ai/config" element={<PermissionRoute anyOf={['ai:config:read']}><AiModelConfigPage /></PermissionRoute>} />
          <Route path="/ai/usage" element={<PermissionRoute anyOf={['ai:usage:read']}><AiUsageMonitorPage /></PermissionRoute>} />

          <Route path="/security" element={<PermissionRoute anyOf={['config:read', 'security:policy:read']}><SecurityPolicyPage /></PermissionRoute>} />
          <Route path="/audit" element={<PermissionRoute anyOf={['audit:read']}><AuditLogPage /></PermissionRoute>} />
          <Route path="/api-keys" element={<PermissionRoute anyOf={['config:read']}><ApiKeysPage /></PermissionRoute>} />

          <Route path="/users" element={<PermissionRoute anyOf={['user:read']}><ConsumerUsersPage /></PermissionRoute>} />
          <Route path="/admins" element={<PermissionRoute anyOf={['admin_user:read']}><AdminUsersPage /></PermissionRoute>} />
          <Route path="/roles" element={<PermissionRoute anyOf={['admin_user:read']}><RolesPage /></PermissionRoute>} />
          <Route path="/groups" element={<PermissionRoute anyOf={['admin_group:read', 'admin_user:read']}><AdminGroupsPage /></PermissionRoute>} />

          <Route path="/storage" element={<PermissionRoute anyOf={['analytics:read']}><StorageManagementPage /></PermissionRoute>} />
          <Route path="/configs" element={<PermissionRoute anyOf={['config:read']}><SystemConfigsPage /></PermissionRoute>} />

          <Route path="/org/members" element={<PermissionRoute anyOf={['platform:tenant:read', 'tenant:member:read', 'tenant:org:read']}><TenantRequired><OrgManagementPage /></TenantRequired></PermissionRoute>} />
          <Route path="/org/roles" element={<PermissionRoute anyOf={['tenant:member:read']}><TenantRequired><OrgRolesPage /></TenantRequired></PermissionRoute>} />
          <Route path="/org/team" element={<PermissionRoute anyOf={['tenant:member:read', 'tenant:org:read']}><TenantRequired><OrgTeamPage /></TenantRequired></PermissionRoute>} />
          <Route path="/org/positions" element={<PermissionRoute anyOf={['tenant:member:read', 'tenant:org:read']}><TenantRequired><OrgPositionsPage /></TenantRequired></PermissionRoute>} />

          {/* 历史路径兼容 */}
          <Route path="/platform/tenants" element={<Navigate to="/org/members" replace />} />
          <Route path="/tenant/members" element={<Navigate to="/org/members" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </Bootstrap>
);

export default App;
