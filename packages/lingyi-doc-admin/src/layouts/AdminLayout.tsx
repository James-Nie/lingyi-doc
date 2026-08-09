import React, { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Menu, Typography, Select, Dropdown, Avatar, Divider, Segmented } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  SettingOutlined,
  AuditOutlined,
  FormOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  DatabaseOutlined,
  SafetyOutlined,
  ApiOutlined,
  BankOutlined,
  DownOutlined,
  LogoutOutlined,
  RobotOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { authStore } from '../stores/authStore';
import { tenantStore } from '../stores/tenantStore';
import { AppLogoWithName } from '../components/AppLogo';

const { Sider, Header, Content } = Layout;

const MODE_KEY = 'lingyi_doc_admin_mode';
type AdminMode = 'platform' | 'tenant';

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

/** 平台级（全局管理，无租户维度） */
const PLATFORM_MENU: Array<MenuLeaf | MenuGroup> = [
  { key: '/', icon: <DashboardOutlined />, label: '概览', perm: 'dashboard:read' },
  { key: '/demo-requests', icon: <FormOutlined />, label: '商机管理', perm: 'demo:read' },
  { key: '/templates', icon: <AppstoreOutlined />, label: '模板管理', perm: 'template:read' },
  {
    key: 'ai',
    icon: <RobotOutlined />,
    label: 'AI 管理',
    children: [
      { key: '/ai/config', label: '模型配置', perm: 'ai:config:read' },
      { key: '/ai/usage', label: 'Token 监控', perm: 'ai:usage:read' },
    ],
  },
  { key: '/storage', icon: <DatabaseOutlined />, label: '存储管理', perm: 'analytics:read' },
  { key: '/security', icon: <SafetyOutlined />, label: '安全策略', perm: 'config:read' },
  { key: '/api-keys', icon: <ApiOutlined />, label: 'API 集成', perm: 'config:read' },
  { key: '/audit', icon: <AuditOutlined />, label: '审计日志', perm: 'audit:read' },
  {
    key: 'system',
    icon: <SettingOutlined />,
    label: '系统管理',
    children: [
      { key: '/admins', label: '管理员管理', perm: 'admin_user:read' },
      { key: '/configs', label: '系统配置', perm: 'config:read' },
    ],
  },
];

/** 租户级（租户内部管理，需当前租户上下文） */
const TENANT_MENU: Array<MenuLeaf | MenuGroup> = [
  {
    key: 'org',
    icon: <ApartmentOutlined />,
    label: '组织管理',
    children: [
      {
        key: '/org/members',
        label: '成员管理',
        perms: ['platform:tenant:read', 'tenant:member:read', 'tenant:org:read'],
      },
      {
        key: '/org/roles',
        label: '角色管理',
        perms: ['tenant:member:read'],
      },
    ],
  },
  {
    key: 'team',
    icon: <TeamOutlined />,
    label: '组织管理',
    children: [
      {
        key: '/org/team',
        label: '团队管理',
        perms: ['tenant:member:read', 'tenant:org:read'],
      },
      {
        key: '/org/positions',
        label: '职位维护',
        perms: ['tenant:member:read', 'tenant:org:read'],
      },
    ],
  },
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

const ROUTE_KEYS = flattenRouteKeys([...PLATFORM_MENU, ...TENANT_MENU]);

function modeOfPath(pathname: string): AdminMode {
  if (pathname.startsWith('/org')) return 'tenant';
  if (pathname.startsWith('/admins') || pathname.startsWith('/configs') || pathname.startsWith('/ai')
    || pathname.startsWith('/storage') || pathname.startsWith('/security') || pathname.startsWith('/api-keys')
    || pathname.startsWith('/audit') || pathname.startsWith('/demo-requests') || pathname.startsWith('/templates')) {
    return 'platform';
  }
  return 'platform';
}

export const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const authState = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const tenantState = useSyncExternalStore(tenantStore.subscribe, tenantStore.getState);
  const [mode, setMode] = React.useState<AdminMode>(() => {
    const stored = localStorage.getItem(MODE_KEY) as AdminMode | null;
    return stored === 'tenant' || stored === 'platform' ? stored : modeOfPath(window.location.pathname);
  });
  const isTenantAdminMode = authStore.hasTenantAdmin();
  const effectiveMode: AdminMode = mode === 'tenant' && !isTenantAdminMode ? 'platform' : mode;

  const changeMode = (m: AdminMode) => {
    localStorage.setItem(MODE_KEY, m);
    setMode(m);
    const fallback = m === 'tenant' ? '/org/members' : '/';
    const currentMode = modeOfPath(location.pathname);
    if (currentMode !== m) navigate(fallback, { replace: true });
  };

  useEffect(() => {
    if (authState.accessToken) {
      void tenantStore.load();
    } else {
      tenantStore.reset();
    }
  }, [authState.accessToken]);

  const MENU_CONFIG = effectiveMode === 'tenant' ? TENANT_MENU : PLATFORM_MENU;
  const currentTenant = tenantState.tenants.find(t => t.id === tenantState.tenantId);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [authState.user?.permissions, effectiveMode, MENU_CONFIG]);

  const selectedKey = ROUTE_KEYS
    .filter((k) => k !== '/')
    .find((k) => location.pathname === k || location.pathname.startsWith(`${k}/`))
    ?? (location.pathname === '/' ? '/' : location.pathname);

  const defaultOpenKeys = location.pathname.startsWith('/org/team') || location.pathname.startsWith('/org/positions')
    ? ['team']
    : location.pathname.startsWith('/org')
      ? ['org']
      : location.pathname.startsWith('/ai')
        ? ['ai']
        : location.pathname.startsWith('/admins') || location.pathname.startsWith('/configs')
          ? ['system']
          : undefined;

  const roleText = authState.user?.roles?.map(r => r.name).join('、') || '—';
  const tenantName = currentTenant?.name ?? '—';

  const userMenu = (
    <div
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      style={{
        width: 280,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 6px 16px rgba(0, 0, 0, 0.08)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 16px 12px' }}>
        <Typography.Text strong style={{ fontSize: 15 }}>
          {authState.user?.displayName ?? '未登录'}
        </Typography.Text>
        {authState.user?.email && (
          <Typography.Paragraph
            type="secondary"
            style={{ margin: '4px 0 0', fontSize: 12, wordBreak: 'break-all' }}
          >
            {authState.user.email}
          </Typography.Paragraph>
        )}
      </div>
      <Divider style={{ margin: 0 }} />
      <div style={{ padding: '12px 16px' }}>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
          租户空间
        </Typography.Text>
        {tenantState.loaded && tenantState.tenants.length > 1 ? (
          <Select
            size="small"
            value={tenantState.tenantId}
            style={{ width: '100%' }}
            options={tenantState.tenants.map(t => ({ value: t.id, label: t.name }))}
            onChange={id => tenantStore.setTenantId(id)}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <BankOutlined style={{ color: '#1677ff' }} />
            <span>{tenantName}</span>
          </div>
        )}
      </div>
      <div style={{ padding: '0 16px 12px' }}>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
          角色
        </Typography.Text>
        <Typography.Text style={{ fontSize: 13 }}>{roleText}</Typography.Text>
      </div>
      <Divider style={{ margin: 0 }} />
      <button
        type="button"
        onClick={() => { void authStore.logout().then(() => navigate('/login')); }}
        style={{
          width: '100%',
          border: 'none',
          background: 'transparent',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          color: '#ff4d4f',
          fontSize: 14,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#fff1f0'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      >
        <LogoutOutlined />
        退出登录
      </button>
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <style>{`
        .admin-content {
          background: #f5f6f7 !important;
        }
        .admin-content .ant-card {
          background: #fff;
          border: 1px solid #e8e9eb;
          border-radius: 8px;
          box-shadow: none;
        }
        .admin-content .ant-card .ant-card-body {
          padding: 20px 24px;
        }
      `}</style>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <Segmented
              value={effectiveMode}
              onChange={(v) => changeMode(v as AdminMode)}
              options={[
                { label: '平台管理', value: 'platform', disabled: !hasMenuAccess({ perm: 'dashboard:read' }) },
                { label: '租户管理', value: 'tenant', disabled: !authStore.hasTenantAdmin() },
              ]}
            />
            <Typography.Text type="secondary">
              {effectiveMode === 'tenant' ? '租户内部管理' : '平台级运营管理'}
            </Typography.Text>
          </div>
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            popupRender={() => userMenu}
          >
            <button
              type="button"
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '4px 8px',
                borderRadius: 8,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Avatar size={32} icon={<UserOutlined />} src={authState.user?.avatarUrl ?? undefined} />
              <div style={{ textAlign: 'left', lineHeight: 1.35 }}>
                <Typography.Text strong style={{ fontSize: 14, display: 'block' }}>
                  {authState.user?.displayName ?? '管理员'}
                </Typography.Text>
                {tenantState.loaded && currentTenant && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {currentTenant.name}
                  </Typography.Text>
                )}
              </div>
              <DownOutlined style={{ fontSize: 10, color: '#8c8c8c' }} />
            </button>
          </Dropdown>
        </Header>
        <Content className="admin-content" style={{ margin: 24, borderRadius: 8 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};
