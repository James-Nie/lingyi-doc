import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { message, Spin } from 'antd';
import { authStore, type IdentityType, type TenantSummary } from '../../stores/authStore';
import { appPath } from '../../utils/appPaths';
import { CreateSpaceModal } from '../../components/auth/CreateSpaceModal';

const VISIBLE_COUNT = 3;
const BRAND = '#3370ff';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || local.length <= 2) return email;
  const head = local.slice(0, 2);
  const tail = local.length > 4 ? local.slice(-1) : '';
  return `${head}${'*'.repeat(Math.min(4, local.length - 2))}${tail}@${domain}`;
}

function tenantRoleLabel(role: number): string {
  if (role === 1) return '超级管理员';
  if (role === 2) return '管理员';
  return '成员';
}

function SpaceAvatar({ label, color = BRAND }: { label: string; color?: string }) {
  const ch = (label || '?').trim().slice(0, 1).toUpperCase();
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 10, background: color,
      color: '#fff', fontSize: 18, fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {ch}
    </div>
  );
}

interface SpaceRowProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  loading?: boolean;
  onClick: () => void;
}

const SpaceRow: React.FC<SpaceRowProps> = ({ icon, title, subtitle, loading, onClick }) => (
  <button
    type="button"
    disabled={loading}
    onClick={onClick}
    style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 16px', marginBottom: 10,
      border: '1px solid #e5e6eb', borderRadius: 12, background: '#fff',
      cursor: loading ? 'default' : 'pointer', textAlign: 'left',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}
    onMouseEnter={e => {
      if (!loading) {
        e.currentTarget.style.borderColor = '#c9cdd4';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(31,35,41,0.06)';
      }
    }}
    onMouseLeave={e => {
      e.currentTarget.style.borderColor = '#e5e6eb';
      e.currentTarget.style.boxShadow = 'none';
    }}
  >
    {icon}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#1f2329', lineHeight: 1.4 }}>{title}</div>
      <div style={{
        fontSize: 13, color: '#8f959e', marginTop: 2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {subtitle}
      </div>
    </div>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c9cdd4" strokeWidth="2">
      <path d="M9 6l6 6-6 6" />
    </svg>
  </button>
);

export const WorkspaceSelectPage: React.FC = () => {
  const navigate = useNavigate();
  const state = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const [entering, setEntering] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const user = state.user;
  const tenants = state.tenants;
  const canCreateSpace = state.membershipSummary?.canCreateTeam ?? false;

  useEffect(() => {
    if (!state.accessToken) return;
    setLoadingList(true);
    void authStore.refreshMe()
      .catch(() => { /* ignore */ })
      .finally(() => setLoadingList(false));
  }, [state.accessToken]);

  const visibleTenants = useMemo(() => {
    if (expanded || tenants.length <= VISIBLE_COUNT) return tenants;
    return tenants.slice(0, VISIBLE_COUNT);
  }, [tenants, expanded]);

  const hiddenCount = tenants.length - VISIBLE_COUNT;

  const handleEnter = async (identityType: IdentityType, tenantId?: string, key?: string) => {
    setEntering(key ?? identityType);
    try {
      await authStore.switchIdentity(identityType, tenantId);
      navigate(appPath.home, { replace: true });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '进入失败');
    } finally {
      setEntering(null);
    }
  };

  const handleBack = async () => {
    await authStore.logout();
    navigate('/login', { replace: true });
  };

  const handleCreateSpace = async (name: string) => {
    setCreating(true);
    try {
      const tenant = await authStore.createTenant(name);
      message.success(`「${tenant.name}」创建成功`);
      setCreateOpen(false);
      await authStore.switchIdentity('tenant', tenant.id);
      navigate(appPath.home, { replace: true });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '创建失败');
      throw err;
    } finally {
      setCreating(false);
    }
  };

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(145deg, #eef2ff 0%, #f5f7fa 45%, #e8ecf1 100%)',
      padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <button
          type="button"
          onClick={() => { void handleBack(); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            marginBottom: 20, padding: '6px 4px', border: 'none', background: 'transparent',
            color: '#646a73', fontSize: 14, cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          返回
        </button>

        <div style={{
          padding: '32px 28px 28px',
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 12px 40px rgba(31, 35, 41, 0.08)',
        }}>
          <h1 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 600, color: '#1f2329' }}>
            你可进入以下企业
          </h1>
          <p style={{ margin: '0 0 24px', fontSize: 14, color: '#8f959e', lineHeight: 1.65 }}>
            <span style={{ color: '#1f2329' }}>{maskEmail(user.email)}</span>
            {' '}已在以下企业或组织绑定了账号，你可进入以下任一企业或组织
          </p>

          {loadingList && tenants.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}><Spin /></div>
          ) : (
            <>
              <SpaceRow
                icon={<SpaceAvatar label={user.displayName} color="#00b96b" />}
                title="个人空间"
                subtitle={user.displayName || '个人用户'}
                loading={entering === 'personal'}
                onClick={() => { void handleEnter('personal', undefined, 'personal'); }}
              />

              {visibleTenants.map((t: TenantSummary) => (
            <SpaceRow
              key={t.id}
              icon={<SpaceAvatar label={t.name} />}
              title={t.name}
              subtitle={tenantRoleLabel(t.tenantRole)}
              loading={entering === t.id}
              onClick={() => { void handleEnter('tenant', t.id, t.id); }}
            />
              ))}

              {!expanded && hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  style={{
                    width: '100%', padding: '10px 0', marginTop: 4,
                    border: 'none', background: 'transparent',
                    color: BRAND, fontSize: 14, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}
                >
                  展示其他 {hiddenCount} 个企业
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              )}

              {canCreateSpace && (
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  style={{
                    width: '100%', padding: '12px 0 4px', marginTop: 8,
                    border: 'none', borderTop: '1px solid #e5e6eb', background: 'transparent',
                    color: BRAND, fontSize: 14, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /><path d="M19 8v6M22 11h-6" />
                  </svg>
                  创建新空间
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <CreateSpaceModal
        open={createOpen}
        loading={creating}
        onCancel={() => setCreateOpen(false)}
        onSubmit={handleCreateSpace}
      />
    </div>
  );
};
