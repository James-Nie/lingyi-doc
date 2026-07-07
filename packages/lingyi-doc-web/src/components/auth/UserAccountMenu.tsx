import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropdown, message } from 'antd';
import type { MenuProps } from 'antd';
import { authStore, type IdentityType, type TenantSummary } from '../../stores/authStore';
import { appPath } from '../../utils/appPaths';
import { confirmDialog } from '../../utils/appDialog';
import { CreateSpaceModal } from './CreateSpaceModal';

const BRAND = '#3370ff';

function SpaceAvatar({ label, color = BRAND, size = 32 }: { label: string; color?: string; size?: number }) {
  const ch = (label || '?').trim().slice(0, 1).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: size > 36 ? 10 : '50%', background: color,
      color: '#fff', fontSize: size > 36 ? 16 : 13, fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {ch}
    </div>
  );
}

function SpaceMenuLabel({
  icon,
  title,
  active,
}: {
  icon: React.ReactNode;
  title: string;
  active?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      minWidth: 200, maxWidth: 260,
    }}>
      {icon}
      <span style={{
        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontSize: 14, color: '#1f2329',
      }}>
        {title}
      </span>
      {active && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="2.5">
          <path d="M5 12l5 5L20 7" />
        </svg>
      )}
    </div>
  );
}

interface UserAccountMenuProps {
  displayName?: string;
  email?: string;
  variant?: 'sidebar' | 'header' | 'avatar';
}

export const UserAccountMenu: React.FC<UserAccountMenuProps> = ({
  displayName,
  email,
  variant = 'sidebar',
}) => {
  const navigate = useNavigate();
  const state = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const [loggingOut, setLoggingOut] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const session = state.session;
  const tenants = state.tenants;
  const isPersonal = session?.currentIdentityType !== 'tenant';
  const currentTenant = tenants.find(t => t.id === session?.currentTenantId);
  const canCreateSpace = state.membershipSummary?.canCreateTeam ?? false;

  const identitySubtitle = isPersonal
    ? '个人用户'
    : (currentTenant?.name || '企业空间');

  const handleSwitch = async (identityType: IdentityType, tenantId?: string) => {
    if (switching) return;
    setSwitching(true);
    try {
      await authStore.switchIdentity(identityType, tenantId);
      message.success(identityType === 'personal' ? '已切换到个人空间' : '已切换企业空间');
      setMenuOpen(false);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '切换失败');
    } finally {
      setSwitching(false);
    }
  };

  const handleCreateSpace = async (name: string) => {
    setCreating(true);
    try {
      const tenant = await authStore.createTenant(name);
      message.success(`「${tenant.name}」创建成功`);
      setCreateOpen(false);
      setMenuOpen(false);
      await authStore.switchIdentity('tenant', tenant.id);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '创建失败');
      throw err;
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = () => {
    void confirmDialog({
      title: '退出登录',
      content: '确定要退出当前账号吗？未保存的编辑内容请先保存。',
      okText: '退出',
      danger: true,
    }).then(async (confirmed) => {
      if (!confirmed) return;
      setLoggingOut(true);
      try {
        await authStore.logout();
        message.success('已退出登录');
        navigate('/login', { replace: true });
      } catch {
        authStore.clear();
        navigate('/login', { replace: true });
      } finally {
        setLoggingOut(false);
      }
    });
  };

  const switchChildren: MenuProps['items'] = useMemo(() => {
    const rows: MenuProps['items'] = [
      {
        key: 'personal',
        label: (
          <SpaceMenuLabel
            icon={<SpaceAvatar label={displayName || '个'} color="#00b96b" size={28} />}
            title="个人空间"
            active={isPersonal}
          />
        ),
        disabled: switching || isPersonal,
        onClick: () => { void handleSwitch('personal'); },
      },
      ...tenants.map((t: TenantSummary) => ({
        key: t.id,
        label: (
          <SpaceMenuLabel
            icon={<SpaceAvatar label={t.name} size={28} />}
            title={t.name}
            active={!isPersonal && session?.currentTenantId === t.id}
          />
        ),
        disabled: switching || (!isPersonal && session?.currentTenantId === t.id),
        onClick: () => { void handleSwitch('tenant', t.id); },
      })),
    ];

    if (canCreateSpace) {
      rows.push({ type: 'divider' });
      rows.push({
        key: 'create-space',
        label: (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: BRAND, fontSize: 14 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /><path d="M19 8v6M22 11h-6" />
            </svg>
            创建新空间
          </span>
        ),
        onClick: () => {
          setMenuOpen(false);
          setCreateOpen(true);
        },
      });
    }

    return rows;
  }, [tenants, isPersonal, session?.currentTenantId, switching, displayName, canCreateSpace]);

  const menuItems: MenuProps['items'] = [
    {
      key: 'header',
      label: (
        <div style={{ padding: '4px 0 8px', cursor: 'default' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SpaceAvatar label={displayName || '?'} size={40} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1f2329' }}>{displayName || '用户'}</div>
              <div style={{ fontSize: 12, color: '#8f959e', marginTop: 2 }}>{identitySubtitle}</div>
            </div>
          </div>
        </div>
      ),
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'switch-account',
      label: '切换账号',
      children: switchChildren,
      popupOffset: [-8, 0],
    },
    { type: 'divider' },
    {
      key: 'profile',
      label: '账号设置',
      onClick: () => navigate(appPath.account),
    },
    {
      key: 'logout',
      label: loggingOut ? '退出中…' : '退出登录',
      danger: true,
      disabled: loggingOut,
      onClick: handleLogout,
    },
  ];

  const isHeader = variant === 'header';
  const isAvatar = variant === 'avatar';

  return (
    <>
      <Dropdown
        menu={{ items: menuItems }}
        trigger={['click']}
        placement={isAvatar || isHeader ? 'bottomRight' : 'topRight'}
        open={menuOpen}
        onOpenChange={setMenuOpen}
      >
        <button
          type="button"
          title={displayName || '账号菜单'}
          style={{
            display: 'flex', alignItems: 'center', gap: isAvatar ? 0 : 8,
            padding: isAvatar ? 0 : isHeader ? '4px 8px' : '8px 10px',
            width: isAvatar ? 'auto' : isHeader ? 'auto' : '100%',
            border: isAvatar ? 'none' : isHeader ? '1px solid #e5e6eb' : 'none',
            borderRadius: isAvatar ? '50%' : isHeader ? 20 : 8,
            background: 'transparent',
            cursor: 'pointer', textAlign: 'left', flexShrink: 0,
          }}
          onMouseEnter={e => {
            if (isAvatar) return;
            if (!isHeader) e.currentTarget.style.background = '#ebecef';
          }}
          onMouseLeave={e => {
            if (isAvatar) return;
            if (!isHeader) e.currentTarget.style.background = 'transparent';
          }}
        >
          <SpaceAvatar label={displayName || '?'} size={isAvatar ? 32 : isHeader ? 28 : 32} />
          {!isAvatar && isHeader && (
            <span style={{
              fontSize: 13, color: '#1f2329', fontWeight: 500,
              maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {displayName || '用户'}
            </span>
          )}
          {!isAvatar && !isHeader && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, color: '#1f2329', fontWeight: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {displayName || '用户'}
              </div>
              <div style={{
                fontSize: 11, color: '#8f959e',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {email}
              </div>
            </div>
          )}
          {!isAvatar && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8f959e" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          )}
        </button>
      </Dropdown>

      <CreateSpaceModal
        open={createOpen}
        loading={creating}
        onCancel={() => setCreateOpen(false)}
        onSubmit={handleCreateSpace}
      />
    </>
  );
};
