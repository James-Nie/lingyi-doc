import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateDocQuickCard, CreateDocTemplateLibraryCard } from '../components/createDoc';
import { PageTopBar } from '../components/layout/topBar';
import { useCreateDocument } from '../hooks/useCreateDocument';
import { canManageKnowledgeBase } from '../api/knowledgeBase';
import { knowledgeBaseStore, type KnowledgeBase } from '../stores/knowledgeBaseStore';
import { authStore } from '../stores/authStore';
import { appPath } from '../utils/appPaths';

export const KnowledgeBasePage: React.FC = () => {
  const navigate = useNavigate();
  const kbRevision = useSyncExternalStore(knowledgeBaseStore.subscribe, knowledgeBaseStore.getRevision);
  const workspaceRevision = useSyncExternalStore(authStore.subscribe, authStore.getWorkspaceRevision);
  const createDoc = useCreateDocument();

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

  const showStub = useCallback((name: string) => setToast(`${name}功能开发中`), []);

  useEffect(() => {
    void knowledgeBaseStore.reload();
  }, [workspaceRevision]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, overflow: 'hidden' }}>
      <PageTopBar
        title="知识库"
        onStub={showStub}
        titleExtra={(
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
        )}
      />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 16,
        padding: '0 24px 24px',
        flexShrink: 0,
      }}>
        <CreateDocQuickCard
          menuOpen={createDoc.menuOpen}
          onToggle={() => createDoc.setMenuOpen(v => !v)}
          onClose={createDoc.closeMenu}
          onCreate={createDoc.handlePickDocType}
          onStub={showStub}
          onCreateKnowledgeBase={createDoc.openCreateKnowledgeBase}
        />

        <CreateDocTemplateLibraryCard onClick={createDoc.openTemplateLibrary} />

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
          onClick={() => createDoc.openCreateKnowledgeBase()}
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
                onOpen={() => navigate(appPath.wikiSpace(item.id))}
                onSettings={canManageKnowledgeBase(item.myRole)
                  ? () => navigate(appPath.wikiSettings(item.id))
                  : undefined}
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
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
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
        background: '#fff',
        cursor: 'pointer',
        textAlign: 'left',
        boxSizing: 'border-box',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#fafafa'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
    >
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#1f2329' }}>{title}</div>
        <div style={{ fontSize: 12, color: '#8f959e', marginTop: 2 }}>{subtitle}</div>
      </div>
    </button>
  );
}

function KnowledgeBaseCard({
  item,
  onOpen,
  onSettings,
}: {
  item: KnowledgeBase;
  onOpen: () => void;
  onSettings?: () => void;
}) {
  const isSunset = item.cover === 'sunset';
  const titleColor = isSunset ? '#fff' : '#1f2329';
  const descColor = isSunset ? 'rgba(255,255,255,0.88)' : '#646a73';

  return (
    <div
      style={{
        position: 'relative',
        height: onSettings ? 200 : 164,
        borderRadius: 12,
        overflow: 'hidden',
        border: isSunset ? '1px solid rgba(255,255,255,0.18)' : '1px solid #d6e6ff',
        background: isSunset
          ? 'linear-gradient(165deg, #3d2f55 0%, #ff8a4c 52%, #ffd27d 100%)'
          : 'linear-gradient(165deg, #4c7dff 0%, #6a9bff 42%, #9ec3ff 100%)',
        boxShadow: '0 2px 10px rgba(31, 35, 41, 0.06)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {!isSunset && (
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'repeating-linear-gradient(-32deg, rgba(255,255,255,0.14) 0 1px, transparent 1px 10px)',
          opacity: 0.35,
          pointerEvents: 'none',
        }} />
      )}

      <button
        type="button"
        onClick={onOpen}
        style={{
          flex: 1,
          minHeight: 0,
          border: 'none',
          padding: '16px 14px 12px',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{
          fontSize: 16,
          fontWeight: 700,
          color: titleColor,
          lineHeight: '22px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {item.emoji ? `${item.emoji} ` : ''}{item.name}
        </div>
        <div style={{
          marginTop: 8,
          fontSize: 12,
          color: descColor,
          lineHeight: '18px',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {item.description?.trim() || '暂无简介'}
        </div>
      </button>

      {onSettings && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSettings();
          }}
          style={{
            position: 'relative',
            zIndex: 2,
            height: 36,
            flexShrink: 0,
            border: 'none',
            borderTop: '1px solid rgba(255,255,255,0.18)',
            background: 'rgba(20, 24, 32, 0.42)',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: 13,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
          知识库设置
        </button>
      )}
    </div>
  );
}
