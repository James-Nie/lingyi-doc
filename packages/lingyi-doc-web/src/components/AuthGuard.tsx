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
    const returnUrl = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(returnUrl)}`}
        replace
        state={{ from: returnUrl }}
      />
    );
  }

  if (state.user.status === 'suspended') {
    authStore.clear();
    return <Navigate to="/login" replace state={{ reason: 'suspended' }} />;
  }

  // 首次登录强制修改初始密码
  if (state.user.needChangePassword) {
    const returnUrl = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`${appPath.changePassword}?redirect=${encodeURIComponent(returnUrl)}`}
        replace
      />
    );
  }

  return <Outlet />;
};

/** 强制改密页守卫：未登录跳登录，已登录直接放行（AuthGuard 会把 needChangePassword 用户引导到此） */
export const ChangePasswordGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const state = useSyncExternalStore(authStore.subscribe, authStore.getState);

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
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
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
