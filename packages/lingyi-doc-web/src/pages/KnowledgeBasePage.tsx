import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppTopBar } from '../components/layout/topBar/AppTopBar';
import { TopBarIconButton } from '../components/layout/topBar/TopBarIconButton';
import { TopBarDivider } from '../components/layout/topBar/TopBarDivider';
import { UserAccountMenu } from '../components/auth/UserAccountMenu';
import { CreateDocMenu, type CreateDocType } from '../components/CreateDocMenu';
import { useTemplatePicker } from '../components/templates/TemplatePickerContext';
import { CreateKnowledgeBaseModal } from '../components/wiki/CreateKnowledgeBaseModal';
import { knowledgeBaseStore, type KnowledgeBase } from '../stores/knowledgeBaseStore';
import { authStore } from '../stores/authStore';
import { appPath } from '../utils/appPaths';

export const KnowledgeBasePage: React.FC = () => {
  const navigate = useNavigate();
  const authState = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const kbRevision = useSyncExternalStore(knowledgeBaseStore.subscribe, knowledgeBaseStore.getRevision);
  const workspaceRevision = useSyncExternalStore(authStore.subscribe, authStore.getWorkspaceRevision);
  const { openTemplatePicker } = useTemplatePicker();

  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createKbOpen, setCreateKbOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const knowledgeBases = useMemo(() => {
    void kbRevision;
    const query = search.trim().toLowerCase();
    const items = knowledgeBaseStore.list();
    if (!query) return items;
    return items.filter(item =>
      item.name.toLowerCase().includes(query)
      || item.description.toLowerCase().includes(query),
    );
  }, [kbRevision, search]);

  const organizationName = useMemo(() => {
    const session = authState.session;
    const tenant = authState.tenants.find(t => t.id === session?.currentTenantId);
    return tenant?.name || '当前企业';
  }, [authState.session, authState.tenants]);

  const showStub = useCallback((name: string) => setToast(`${name}功能开发中`), []);
  const showToast = useCallback((msg: string) => setToast(msg), []);

  useEffect(() => {
    void knowledgeBaseStore.reload();
  }, [workspaceRevision]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handlePickDocType = useCallback((type: CreateDocType) => {
    setCreateMenuOpen(false);
    openTemplatePicker({ typeFilter: type });
  }, [openTemplatePicker]);

  const handleCreateKnowledgeBase = useCallback(async (payload: {
    name: string;
    description: string;
    emoji: string;
    visibility: 'members' | 'organization';
  }) => {
    try {
      const { kb, defaultNodeId } = await knowledgeBaseStore.create(payload);
      setCreateKbOpen(false);
      showToast('知识库已创建');
      navigate(appPath.wikiSpaceNode(kb.id, defaultNodeId));
    } catch (err) {
      showToast(`创建失败: ${(err as Error).message}`);
    }
  }, [navigate, showToast]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, overflow: 'hidden' }}>
      <CreateKnowledgeBaseModal
        open={createKbOpen}
        organizationName={organizationName}
        onClose={() => setCreateKbOpen(false)}
        onCreate={handleCreateKnowledgeBase}
      />

      <AppTopBar
        left={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <h1 style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              color: '#1f2329',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              知识库
            </h1>
            <button
              type="button"
              title="知识库说明"
              onClick={() => showStub('知识库说明')}
              style={{
                width: 28,
                height: 28,
                border: '1px solid #dee0e3',
                borderRadius: 6,
                background: '#fff',
                color: '#646a73',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6 4h12v16H6V4z" /><path d="M9 8h6M9 12h4" />
              </svg>
            </button>
          </div>
        )}
        right={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <TopBarIconButton title="搜索" onClick={() => showStub('搜索')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" /><path d="M20 20l-3-3" />
              </svg>
            </TopBarIconButton>
            <TopBarIconButton title="组织" onClick={() => showStub('组织')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="6" cy="12" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="18" cy="18" r="2" />
                <path d="M8 11h8M16 7l-2 3M16 17l-2-3" />
              </svg>
            </TopBarIconButton>
            <TopBarIconButton title="帮助" onClick={() => showStub('帮助')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M9 18h6" /><path d="M10 22h4" />
                <path d="M12 2a7 7 0 0 0-4 12c1 .8 2 2.2 2 3.8V18h4v-.2c0-1.6 1-3 2-3.8A7 7 0 0 0 12 2z" />
              </svg>
            </TopBarIconButton>
            <TopBarIconButton title="应用" onClick={() => showStub('应用')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="5" r="1.6" /><circle cx="12" cy="5" r="1.6" /><circle cx="19" cy="5" r="1.6" />
                <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
                <circle cx="5" cy="19" r="1.6" /><circle cx="12" cy="19" r="1.6" /><circle cx="19" cy="19" r="1.6" />
              </svg>
            </TopBarIconButton>
            <TopBarDivider />
            <UserAccountMenu
              variant="avatar"
              displayName={authState.user?.displayName}
              email={authState.user?.email}
            />
          </div>
        )}
      />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 16,
        padding: '0 24px 24px',
        flexShrink: 0,
      }}>
        <div style={{ minWidth: 0, position: 'relative' }}>
          <QuickActionCard
            active={createMenuOpen}
            icon={(
              <span style={{
                width: 36, height: 36, borderRadius: 8, background: '#e8f0fe', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M4 7a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z" fill="#3370ff" opacity="0.18" />
                  <path d="M13 5v4h4M12 11v6M9 14h6" stroke="#3370ff" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
            )}
            title="新建"
            subtitle="新建文档开始协作"
            chevron
            onClick={() => setCreateMenuOpen(v => !v)}
          />
          <CreateDocMenu
            open={createMenuOpen}
            onClose={() => setCreateMenuOpen(false)}
            onCreate={handlePickDocType}
            onStub={showStub}
          />
        </div>

        <QuickActionCard
          icon={(
            <span style={{
              width: 36, height: 36, borderRadius: 8, background: '#fff7e6', flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 2,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#ff9800' }} />
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f54a45' }} />
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#3370ff' }} />
            </span>
          )}
          title="模板库"
          subtitle="选择模板快速新建"
          onClick={() => openTemplatePicker()}
        />

        <QuickActionCard
          icon={(
            <span style={{
              width: 36, height: 36, borderRadius: 8, background: '#e8f7ff', flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="5" y="6" width="10" height="10" rx="2" fill="#36cfc9" opacity="0.85" />
                <rect x="9" y="8" width="10" height="10" rx="2" fill="#3370ff" opacity="0.9" />
              </svg>
            </span>
          )}
          title="新建知识库"
          subtitle="让知识创造价值"
          onClick={() => setCreateKbOpen(true)}
        />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 24px 32px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1f2329' }}>全部知识库</h2>
            <button
              type="button"
              title="设置"
              onClick={() => showStub('知识库设置')}
              style={{
                width: 24,
                height: 24,
                border: 'none',
                borderRadius: 4,
                background: 'transparent',
                color: '#8f959e',
                cursor: 'pointer',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            </button>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: 220,
            maxWidth: '100%',
            height: 32,
            border: '1px solid #dee0e3',
            borderRadius: 16,
            padding: '0 12px',
            background: '#fff',
          }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索知识库"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: 13,
                background: 'transparent',
                minWidth: 0,
              }}
            />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8f959e" strokeWidth="2">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3-3" />
            </svg>
          </div>
        </div>

        {knowledgeBases.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#8f959e', fontSize: 14 }}>
            暂无知识库，点击「新建知识库」开始创建
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 16,
          }}>
            {knowledgeBases.map(item => (
              <KnowledgeBaseCard
                key={item.id}
                item={item}
                onClick={() => navigate(appPath.wikiSpace(item.id))}
              />
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '10px 18px',
          background: '#1f2329',
          color: '#fff',
          borderRadius: 8,
          fontSize: 13,
          zIndex: 200,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
};

function QuickActionCard({
  icon,
  title,
  subtitle,
  chevron,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  chevron?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        border: '1px solid #e8e9eb',
        borderRadius: 8,
        background: active ? '#fafafa' : '#fff',
        cursor: 'pointer',
        textAlign: 'left',
        boxSizing: 'border-box',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#fafafa'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = '#fff'; }}
    >
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#1f2329' }}>{title}</div>
        <div style={{ fontSize: 12, color: '#8f959e', marginTop: 2 }}>{subtitle}</div>
      </div>
      {chevron && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2">
          <path d="M18 15l-6-6-6 6" />
        </svg>
      )}
    </button>
  );
}

function KnowledgeBaseCard({
  item,
  onClick,
}: {
  item: KnowledgeBase;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 'none',
        padding: 0,
        background: 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <div style={{
        position: 'relative',
        height: 120,
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid #ebebeb',
        background: item.cover === 'sunset'
          ? 'linear-gradient(180deg, #4a3b63 0%, #ff8a4c 55%, #ffd27d 100%)'
          : 'linear-gradient(180deg, #eaf3ff 0%, #d8ebff 55%, #c8e2ff 100%)',
      }}>
        {item.tag && (
          <span style={{
            position: 'absolute',
            top: 10,
            left: 10,
            padding: '2px 8px',
            borderRadius: 4,
            background: 'rgba(51, 112, 255, 0.92)',
            color: '#fff',
            fontSize: 11,
            lineHeight: '18px',
          }}>
            {item.tag}
          </span>
        )}
        {item.cover === 'blue' && (
          <div style={{
            position: 'absolute',
            right: -8,
            bottom: -12,
            width: 88,
            height: 88,
            borderRadius: 18,
            background: 'rgba(255,255,255,0.45)',
            transform: 'rotate(18deg)',
          }} />
        )}
        {item.cover === 'sunset' && (
          <div style={{
            position: 'absolute',
            left: '50%',
            bottom: 18,
            transform: 'translateX(-50%)',
            width: 4,
            height: 42,
            background: 'rgba(255,255,255,0.85)',
            borderRadius: 2,
          }} />
        )}
        <div style={{
          position: 'absolute',
          left: 12,
          top: item.tag ? 38 : 12,
          right: 12,
          fontSize: 14,
          fontWeight: 600,
          color: item.cover === 'sunset' ? '#fff' : '#1f2329',
          lineHeight: '20px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {item.name}
        </div>
      </div>
    </button>
  );
}
