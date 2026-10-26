import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Layout,
  Menu,
  Select,
  Dropdown,
  Avatar,
  Breadcrumb,
  Segmented,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  SettingOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  DatabaseOutlined,
  SafetyOutlined,
  BankOutlined,
  DownOutlined,
  LogoutOutlined,
  RobotOutlined,
  TeamOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { authStore } from '../stores/authStore';
import { tenantStore } from '../stores/tenantStore';
import { AppLogo, AppLogoWithName } from '../components/AppLogo';
import { SIZE } from '../styles/theme';

const { Sider, Header, Content } = Layout;

const MODE_KEY = 'lingyi_doc_admin_mode';
const COLLAPSE_KEY = 'lingyi_doc_admin_sider_collapsed';
/** <1024px 自动折叠侧栏；<768px 侧栏转为覆盖式抽屉 */
const COMPACT_QUERY = '(max-width: 1024px)';
const MOBILE_QUERY = '(max-width: 768px)';

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
  {
    key: 'operations',
    icon: <AppstoreOutlined />,
    label: '运营管理',
    children: [
      { key: '/demo-requests', label: '商机管理', perm: 'demo:read' },
      { key: '/templates', label: '模板管理', perm: 'template:read' },
    ],
  },
  {
    key: 'governance',
    icon: <DatabaseOutlined />,
    label: '内容治理',
    children: [
      { key: '/documents', label: '文档治理', perm: 'document:read' },
    ],
  },
  {
    key: 'ai',
    icon: <RobotOutlined />,
    label: 'AI 管理',
    children: [
      { key: '/ai/config', label: '模型配置', perm: 'ai:config:read' },
      { key: '/ai/usage', label: 'Token 监控', perm: 'ai:usage:read' },
    ],
  },
  {
    key: 'security',
    icon: <SafetyOutlined />,
    label: '安全与合规',
    children: [
      { key: '/security', label: '安全策略', perms: ['config:read', 'security:policy:read'] },
      { key: '/audit', label: '审计日志', perm: 'audit:read' },
      { key: '/api-keys', label: 'API 集成', perm: 'config:read' },
    ],
  },
  {
    key: 'people',
    icon: <TeamOutlined />,
    label: '组织与人员',
    children: [
      { key: '/users', label: '用户账号', perm: 'user:read' },
      { key: '/admins', label: '管理员管理', perm: 'admin_user:read' },
      { key: '/roles', label: '角色与权限', perm: 'admin_user:read' },
      { key: '/groups', label: '管理组', perms: ['admin_group:read', 'admin_user:read'] },
    ],
  },
  {
    key: 'system',
    icon: <SettingOutlined />,
    label: '系统',
    children: [
      { key: '/storage', label: '存储管理', perm: 'analytics:read' },
      { key: '/configs', label: '系统配置', perm: 'config:read' },
    ],
  },
];

/**
 * 租户级（租户内部管理，需当前租户上下文）。
 * 修复评审缺陷 F1：此前两个分组都叫「组织管理」，用户无法区分；
 * 现合并为「组织与人员」单组，团队概览与职位维护作为其子项。
 */
const TENANT_MENU: Array<MenuLeaf | MenuGroup> = [
  {
    key: 'org',
    icon: <ApartmentOutlined />,
    label: '组织与人员',
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
      {
        key: '/org/team',
        label: '团队概览',
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

const ALL_MENUS = [...PLATFORM_MENU, ...TENANT_MENU];

/**
 * 面包屑映射：路由 → { 所属分组, 页面名 }。
 * 直接由菜单配置推导，不额外维护一份路由表，避免两处漂移。
 */
const CRUMB_MAP: Record<string, { group?: string; label: string }> = (() => {
  const map: Record<string, { group?: string; label: string }> = {};
  for (const item of ALL_MENUS) {
    if ('children' in item) {
      for (const child of item.children) {
        map[child.key] = { group: item.label, label: child.label };
      }
    } else {
      map[item.key] = { label: item.label };
    }
  }
  return map;
})();

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

const ROUTE_KEYS = flattenRouteKeys(ALL_MENUS);

function modeOfPath(pathname: string): AdminMode {
  if (pathname.startsWith('/org')) return 'tenant';
  return 'platform';
}

/**
 * C1 决策（双形态、界面分叉）：私有化部署隐藏 SaaS 专有菜单。
 * 商机管理只对 SaaS 有意义 —— 私有化客户自己就是买断方，不存在「预约演示」漏斗。
 */
function forkMenuForDeploy(menu: Array<MenuLeaf | MenuGroup>, isPrivate: boolean): Array<MenuLeaf | MenuGroup> {
  if (!isPrivate) return menu;
  const SAAS_ONLY_KEYS = new Set(['/demo-requests']);
  return menu
    .map((item) => {
      if ('children' in item) {
        const children = item.children.filter((c) => !SAAS_ONLY_KEYS.has(c.key));
        return children.length ? { ...item, children } : null;
      }
      return SAAS_ONLY_KEYS.has(item.key) ? null : item;
    })
    .filter((item): item is MenuLeaf | MenuGroup => item !== null);
}

/** 单一断点订阅，替代在多处写 window.innerWidth 判断 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const authState = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const tenantState = useSyncExternalStore(tenantStore.subscribe, tenantStore.getState);

  const isCompact = useMediaQuery(COMPACT_QUERY);
  const isMobile = useMediaQuery(MOBILE_QUERY);

  const [mode, setMode] = useState<AdminMode>(() => {
    const stored = localStorage.getItem(MODE_KEY) as AdminMode | null;
    return stored === 'tenant' || stored === 'platform' ? stored : modeOfPath(window.location.pathname);
  });

  /** 折叠态：优先读用户上次的选择，没有记录时按视口宽度决定 */
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const stored = localStorage.getItem(COLLAPSE_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
    return window.matchMedia(COMPACT_QUERY).matches;
  });

  /** 只在「进入窄屏」时自动折叠，避免在移动端锁死抽屉无法展开 */
  const prevCompactRef = React.useRef(isCompact);
  useEffect(() => {
    if (isCompact && !prevCompactRef.current) setCollapsed(true);
    prevCompactRef.current = isCompact;
  }, [isCompact]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  };

  const isTenantAdminMode = authStore.hasTenantAdmin();
  /**
   * 是否展示「管理范围」切换：两者取「或」而不是「与」。
   * 只有租户管理员、或握有 dashboard:read 的人，才至少有一个可进入的范围；
   * 两者都没有的人渲染出来只能是两个全禁用选项，属于无效入口。
   */
  const canSwitchMode = isTenantAdminMode || authStore.hasPermission('dashboard:read');
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

  const MENU_CONFIG = useMemo(
    () => forkMenuForDeploy(
      effectiveMode === 'tenant' ? TENANT_MENU : PLATFORM_MENU,
      authState.user?.isPrivateDeploy === true,
    ),
    [effectiveMode, authState.user?.isPrivateDeploy],
  );

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

  const defaultOpenKeys = location.pathname.startsWith('/org')
    ? ['org']
    : ['/demo-requests', '/templates'].includes(location.pathname)
      ? ['operations']
      : location.pathname.startsWith('/documents')
        ? ['governance']
        : location.pathname.startsWith('/ai')
          ? ['ai']
          : ['/security', '/audit', '/api-keys'].includes(location.pathname)
            ? ['security']
            : ['/users', '/admins', '/roles', '/groups'].includes(location.pathname)
              ? ['people']
              : ['/storage', '/configs'].includes(location.pathname)
                ? ['system']
                : undefined;

  /** 面包屑：一级页（概览）不显示，二级以上显示「首页 / 分组 / 页面」 */
  const crumb = CRUMB_MAP[selectedKey];
  const crumbItems = useMemo(() => {
    if (!crumb?.group) return null;
    return [
      { title: <Link to="/">首页</Link> },
      { title: crumb.group },
      { title: crumb.label },
    ];
  }, [crumb?.group, crumb?.label]);

  const roleText = authState.user?.roles?.map((r) => r.name).join('、') || '—';
  const currentTenant = tenantState.tenants.find((t) => t.id === tenantState.tenantId);
  const tenantName = currentTenant?.name ?? '—';

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    navigate(key);
    // 移动端：选中后自动收起抽屉，否则会挡住刚打开的内容
    if (isMobile) setCollapsed(true);
  };

  const userMenu = (
    <div
      className="admin-user-menu"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="admin-user-menu__head">
        <div className="admin-user-menu__name">{authState.user?.displayName ?? '未登录'}</div>
        {authState.user?.email && (
          <div className="admin-user-menu__email">{authState.user.email}</div>
        )}
      </div>

      <div className="admin-user-menu__divider" />

      <div className="admin-user-menu__section">
        <div className="admin-user-menu__label">租户空间</div>
        {tenantState.loaded && tenantState.tenants.length > 1 ? (
          <Select
            size="small"
            value={tenantState.tenantId}
            style={{ width: '100%' }}
            options={tenantState.tenants.map((t) => ({ value: t.id, label: t.name }))}
            onChange={(id) => tenantStore.setTenantId(id)}
          />
        ) : (
          <div className="admin-user-menu__tenant">
            <BankOutlined aria-hidden="true" />
            <span>{tenantName}</span>
          </div>
        )}
      </div>

      {/*
        管理范围切换：从顶栏移入用户菜单。
        原因：顶栏是「定位」区域（面包屑），把范围切换放在这里会和导航抢注意力；
        与「租户空间」同属「我在什么范围内操作」，放一起语义更连贯。
        仅在确实可切换时渲染 —— 此前无论有无权限都渲染一个两选项全禁用的 Segmented，属于无效入口。
      */}
      {canSwitchMode && (
        <div className="admin-user-menu__section">
          <div className="admin-user-menu__label">管理范围</div>
          <Segmented
            size="small"
            block
            value={effectiveMode}
            onChange={(v) => changeMode(v as AdminMode)}
            options={[
              { label: '平台管理', value: 'platform' },
              { label: '租户管理', value: 'tenant' },
            ]}
          />
        </div>
      )}

      <div className="admin-user-menu__section">
        <div className="admin-user-menu__label">角色</div>
        <div className="admin-user-menu__value">{roleText}</div>
      </div>

      <div className="admin-user-menu__divider" />

      <button
        type="button"
        className="admin-user-menu__logout"
        onClick={() => { void authStore.logout().then(() => navigate('/login')); }}
      >
        <LogoutOutlined aria-hidden="true" />
        退出登录
      </button>
    </div>
  );

  return (
    <Layout className="admin-layout">
      {/* 移动端抽屉展开时的遮罩；≥768px 由 CSS 恒定为不显示 */}
      {isMobile && !collapsed && (
        <div
          className="admin-sider-mask"
          onClick={() => setCollapsed(true)}
          aria-hidden="true"
        />
      )}

      <Sider
        theme="light"
        width={SIZE.siderW}
        collapsedWidth={SIZE.siderCollapsedW}
        collapsed={collapsed}
        trigger={null}
        className={`admin-sider${isMobile && !collapsed ? ' admin-sider--open' : ''}`}
      >
        <div className="admin-sider__logo">
          {collapsed ? (
            <AppLogo size={28} />
          ) : (
            <AppLogoWithName size={28} fontSize={15} suffix="- 管理后台" />
          )}
        </div>
        <div className="admin-sider__scroll">
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            defaultOpenKeys={defaultOpenKeys}
            items={menuItems}
            onClick={handleMenuClick}
          />
        </div>
      </Sider>

      <Layout>
        <Header className="admin-header">
          <div className="admin-header__left">
            <button
              type="button"
              className="admin-sider-toggle"
              onClick={toggleCollapsed}
              aria-label={collapsed ? '展开导航' : '收起导航'}
              aria-expanded={!collapsed}
            >
              {collapsed ? <MenuUnfoldOutlined aria-hidden="true" /> : <MenuFoldOutlined aria-hidden="true" />}
            </button>
            {crumbItems && (
              <Breadcrumb className="admin-header__crumb" items={crumbItems} />
            )}
          </div>

          <div className="admin-header__right">
            <Dropdown
              trigger={['click']}
              placement="bottomRight"
              popupRender={() => userMenu}
            >
              <button type="button" className="admin-header-user">
                <Avatar size={32} icon={<UserOutlined />} src={authState.user?.avatarUrl ?? undefined} />
                <span className="admin-header-user__meta">
                  <span className="admin-header-user__name">
                    {authState.user?.displayName ?? '管理员'}
                  </span>
                  {tenantState.loaded && currentTenant && (
                    <span className="admin-header-user__tenant">{currentTenant.name}</span>
                  )}
                </span>
                <DownOutlined className="admin-header-user__caret" aria-hidden="true" />
              </button>
            </Dropdown>
          </div>
        </Header>

        <Content className="admin-content">
          <div className="admin-content-inner">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};
