import React, { useMemo, useSyncExternalStore } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Menu, Button, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  TeamOutlined,
  SettingOutlined,
  AuditOutlined,
  FormOutlined,
  ApartmentOutlined,
  FileTextOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { authStore } from '../stores/authStore';
import { AppLogoWithName } from '../components/AppLogo';

const { Sider, Header, Content } = Layout;

type MenuLeaf = {
  key: string;
  icon?: React.ReactNode;
  label: string;
  perm?: string;
  perms?: string[];
};

type MenuGroup = {
  key: string;
  icon: React.ReactNode;
  label: string;
  children: MenuLeaf[];
};

const MENU_CONFIG: Array<MenuLeaf | MenuGroup> = [
  { key: '/', icon: <DashboardOutlined />, label: '概览', perm: 'dashboard:read' },
  { key: '/users', icon: <UserOutlined />, label: 'C 端用户', perm: 'user:read' },
  { key: '/admins', icon: <TeamOutlined />, label: '管理员', perm: 'admin_user:read' },
  { key: '/configs', icon: <SettingOutlined />, label: '系统配置', perm: 'config:read' },
  { key: '/demo-requests', icon: <FormOutlined />, label: '商机管理', perm: 'demo:read' },
  { key: '/templates', icon: <AppstoreOutlined />, label: '模板管理', perm: 'template:read' },
  {
    key: 'org',
    icon: <ApartmentOutlined />,
    label: '组织管理',
    children: [
      {
        key: '/org/members',
        label: '成员与部门',
        perms: ['platform:tenant:read', 'tenant:member:read', 'tenant:org:read'],
      },
    ],
  },
  { key: '/tenant/documents', icon: <FileTextOutlined />, label: '团队文档', perm: 'tenant:document:read' },
  { key: '/audit', icon: <AuditOutlined />, label: '审计日志', perm: 'audit:read' },
];

function hasMenuAccess(item: Pick<MenuLeaf, 'perm' | 'perms'>): boolean {
  if (item.perm) return authStore.hasPermission(item.perm);
  if (item.perms) return item.perms.some((p) => authStore.hasPermission(p));
  return true;
}

function flattenRouteKeys(items: Array<MenuLeaf | MenuGroup>): string[] {
  const keys: string[] = [];
  for (const item of items) {
    if ('children' in item) {
      keys.push(...item.children.map((c) => c.key));
    } else {
      keys.push(item.key);
    }
  }
  return keys;
}

const ROUTE_KEYS = flattenRouteKeys(MENU_CONFIG);

export const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = useSyncExternalStore(authStore.subscribe, authStore.getState);

  const menuItems: MenuProps['items'] = useMemo(() => MENU_CONFIG.flatMap((item) => {
    if ('children' in item) {
      const visibleChildren = item.children.filter(hasMenuAccess);
      if (!visibleChildren.length) return [];
      return [{
        key: item.key,
        icon: item.icon,
        label: item.label,
        children: visibleChildren.map(({ key, label }) => ({ key, label })),
      }];
    }
    if (!hasMenuAccess(item)) return [];
    return [{ key: item.key, icon: item.icon, label: item.label }];
  }), [state.user?.permissions]);

  const selectedKey = ROUTE_KEYS
    .filter((k) => k !== '/')
    .find((k) => location.pathname === k || location.pathname.startsWith(`${k}/`))
    ?? (location.pathname === '/' ? '/' : location.pathname);

  const defaultOpenKeys = location.pathname.startsWith('/org') ? ['org'] : undefined;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="light" width={220} style={{ borderRight: '1px solid #f0f0f0' }}>
        <div style={{ padding: '16px 16px 20px', display: 'flex', alignItems: 'center' }}>
          <AppLogoWithName size={28} fontSize={15} suffix="- 管理后台" />
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={defaultOpenKeys}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{
          background: '#fff', padding: '0 24px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0',
        }}>
          <Typography.Text type="secondary">运营管理工作台</Typography.Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>{state.user?.displayName}</span>
            <Button size="small" onClick={() => { void authStore.logout().then(() => navigate('/login')); }}>
              退出
            </Button>
          </div>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};
