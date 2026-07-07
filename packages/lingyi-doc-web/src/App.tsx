import React, { useEffect, useSyncExternalStore } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { message } from 'antd';
import { SheetAntdProvider } from '@lingyi-doc/editor';
import { configureDocumentManager } from '@lingyi-doc/core';
import { AppShell, AppShellFrame } from './components/layout/AppLayout';
import { AuthGuard, GuestGuard } from './components/AuthGuard';
import { DocumentListPage } from './pages/DocumentListPage';
import { KnowledgeBasePage } from './pages/KnowledgeBasePage';
import { WikiSpacePage } from './pages/WikiSpacePage';
import { WikiSpaceShell } from './components/wiki/WikiSpaceShell';
import { RecycleBinPage } from './pages/RecycleBinPage';
import { DocIdCanonicalRedirect } from './pages/DocIdCanonicalRedirect';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { WorkspaceSelectPage } from './pages/auth/WorkspaceSelectPage';
import { AccountPage } from './pages/account/AccountPage';
import { HomeRoute } from './components/HomeRoute';
import { ShareLegacyRedirectPage } from './pages/ShareLegacyRedirectPage';
import { CollaboratorJoinPage, PublicLinkJoinPage } from './pages/CollaboratorJoinPage';
import { DocPublicEditorPage } from './pages/DocPublicEditorPage';
import { authStore } from './stores/authStore';
import { documentLibraryStore } from './stores/documentLibraryStore';
import { appPath, RESERVED_PATH_ROOTS } from './utils/appPaths';

configureDocumentManager({
  getAccessToken: () => authStore.getAccessToken(),
  refreshAccessToken: () => authStore.tryRefresh(),
  onSessionExpired: () => {
    authStore.clear();
    message.warning('登录已过期，请重新登录');
    window.location.assign('/login');
  },
  onDocumentListChanged: () => documentLibraryStore.bump(),
});

const Bootstrap: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();

  useEffect(() => {
    authStore.setSessionExpiredHandler(() => {
      authStore.clear();
      message.warning('登录已过期，请重新登录');
      navigate('/login', { replace: true });
    });
    void authStore.init();
    return () => authStore.setSessionExpiredHandler(null);
  }, [navigate]);

  return <>{children}</>;
};

const LegacyDocRedirect: React.FC = () => {
  const { docId } = useParams<{ docId: string }>();
  if (!docId) return <Navigate to={appPath.home} replace />;
  return <DocIdCanonicalRedirect />;
};

const DocPublicRoute: React.FC = () => {
  const { spaceSlug = '' } = useParams<{ spaceSlug: string }>();
  const authed = useSyncExternalStore(
    authStore.subscribe,
    () => authStore.isAuthenticated(),
  );
  if (RESERVED_PATH_ROOTS.has(spaceSlug)) {
    return <Navigate to="/" replace />;
  }
  if (authed) {
    return (
      <AppShellFrame>
        <DocPublicEditorPage inShell />
      </AppShellFrame>
    );
  }
  return <DocPublicEditorPage />;
};

const AppRoutes: React.FC = () => (
  <Routes>
    <Route path="/" element={<HomeRoute />} />
    <Route path="/login" element={<GuestGuard><LoginPage /></GuestGuard>} />
    <Route path="/register" element={<GuestGuard><RegisterPage /></GuestGuard>} />
    <Route path="/share/:token" element={<ShareLegacyRedirectPage />} />
    <Route path="/g/:spaceSlug/:bookSlug/:docSlug/collaborator/join" element={<CollaboratorJoinPage />} />
    <Route path="/g/:spaceSlug/:bookSlug/:docSlug/link/join" element={<PublicLinkJoinPage />} />
    <Route path="/:spaceSlug/:bookSlug/:docSlug" element={<DocPublicRoute />} />
    <Route element={<AuthGuard />}>
      <Route path={appPath.workspaceSelect} element={<WorkspaceSelectPage />} />
      <Route element={<AppShell />}>
        <Route path={appPath.home} element={<DocumentListPage />} />
        <Route path={appPath.wiki} element={<KnowledgeBasePage />} />
        <Route path={appPath.recycleBin} element={<RecycleBinPage />} />
        <Route path={appPath.account} element={<AccountPage />} />
        <Route path={`${appPath.home}/doc/:docId`} element={<DocIdCanonicalRedirect />} />
      </Route>
      <Route element={<WikiSpaceShell />}>
        <Route path={`${appPath.wiki}/:kbId`} element={<WikiSpacePage />} />
        <Route path={`${appPath.wiki}/:kbId/n/:nodeId`} element={<WikiSpacePage />} />
        <Route path={`${appPath.wiki}/:kbId/doc/:docId`} element={<WikiSpacePage />} />
      </Route>
    </Route>
    {/* 旧路径兼容 */}
    <Route path="/recycle-bin" element={<Navigate to={appPath.recycleBin} replace />} />
    <Route path="/account" element={<Navigate to={appPath.account} replace />} />
    <Route path="/doc/:docId" element={<LegacyDocRedirect />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

const App: React.FC = () => (
  <SheetAntdProvider>
    <BrowserRouter>
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column' }}>
        <Bootstrap>
          <AppRoutes />
        </Bootstrap>
      </div>
    </BrowserRouter>
  </SheetAntdProvider>
);

export default App;
