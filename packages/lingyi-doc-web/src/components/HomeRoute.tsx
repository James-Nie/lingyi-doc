import React, { useSyncExternalStore } from 'react';
import { Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { authStore } from '../stores/authStore';
import { appPath } from '../utils/appPaths';
import HomePage from '../pages/home/HomePage';

/** 根路径：已登录用户进工作台，未登录展示营销首页 */
export const HomeRoute: React.FC = () => {
  const state = useSyncExternalStore(authStore.subscribe, authStore.getState);

  if (!state.initialized) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin tip="加载中…" />
      </div>
    );
  }

  if (state.accessToken) {
    return <Navigate to={appPath.home} replace />;
  }

  return <HomePage />;
};
