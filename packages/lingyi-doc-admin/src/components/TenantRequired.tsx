import React, { useEffect, useSyncExternalStore } from 'react';
import { Button, Empty, Skeleton } from 'antd';
import { authStore } from '../stores/authStore';
import { tenantStore } from '../stores/tenantStore';

interface Props {
  children: React.ReactNode;
}

/**
 * 租户上下文守卫（修复评审缺陷 F10）。
 *
 * 此前各 org 页面在 `tenantId` 为空时直接 `return`，导致**整页白屏且无任何提示**。
 * 现在统一在路由层拦截：
 * - 租户列表加载中 → 骨架屏
 * - 加载完成但没有可管理的租户 → 明确的空态与重试入口
 */
export const TenantRequired: React.FC<Props> = ({ children }) => {
  const tenantState = useSyncExternalStore(tenantStore.subscribe, tenantStore.getState);

  useEffect(() => {
    if (!tenantState.loaded && authStore.getAccessToken()) {
      void tenantStore.load();
    }
  }, [tenantState.loaded]);

  if (!tenantState.loaded) {
    return <Skeleton active paragraph={{ rows: 6 }} />;
  }

  if (!tenantState.tenantId) {
    return (
      <Empty
        description={
          <span>
            当前账号没有可管理的租户空间。
            <br />
            请联系平台超级管理员把你加入某个企业，或确认你是否拥有该租户的后台权限。
          </span>
        }
      >
        <Button type="primary" onClick={() => void tenantStore.load()}>
          重新加载
        </Button>
      </Empty>
    );
  }

  return <>{children}</>;
};

export default TenantRequired;
