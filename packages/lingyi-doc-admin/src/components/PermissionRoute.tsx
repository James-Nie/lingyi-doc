import React from 'react';
import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';
import { authStore } from '../stores/authStore';

interface Props {
  /** 需要的权限点，满足任意一个即可通过 */
  anyOf: string[];
  children: React.ReactElement;
}

/**
 * 路由级权限守卫（修复评审缺陷 F5：此前只有菜单可见性控制，
 * 直接敲 URL 可进入无权限页，仅靠后端 403 兜底、前端白屏无提示）。
 *
 * 注意：这是**体验层**守卫，不作为安全边界 —— 真正的鉴权仍由服务端
 * `JwtAuthGuard + PermissionsGuard` 负责，前端守卫只避免用户看到空白页。
 */
export const PermissionRoute: React.FC<Props> = ({ anyOf, children }) => {
  const navigate = useNavigate();
  const passed = anyOf.some((code) => authStore.hasPermission(code));

  if (!passed) {
    return (
      <Result
        status="403"
        title="403"
        subTitle={`你没有访问该页面的权限（需要：${anyOf.join(' 或 ')}）`}
        extra={
          <Button type="primary" onClick={() => navigate('/')}>
            返回概览
          </Button>
        }
      />
    );
  }
  return children;
};

export default PermissionRoute;
