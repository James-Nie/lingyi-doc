import React, { useSyncExternalStore } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { authStore } from '../stores/authStore';
import { appPath } from '../utils/appPaths';

export const AuthGuard: React.FC = () => {
  const state = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const location = useLocation();

  if (!state.initialized) {
    return (
      <div style={{
        flex: 1, minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Spin tip="正在验证登录状态…" />
      </div>
    );
  }

  if (!state.accessToken || !state.user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (state.user.status === 'suspended') {
    authStore.clear();
    return <Navigate to="/login" replace state={{ reason: 'suspended' }} />;
  }

  return <Outlet />;
};

export const GuestGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const state = useSyncExternalStore(authStore.subscribe, authStore.getState);

  if (!state.initialized) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Spin tip="加载中…" />
      </div>
    );
  }

  if (state.accessToken && state.user) {
    return <Navigate to={appPath.workspaceSelect} replace />;
  }

  return <>{children}</>;
};
