import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { AppTopBar } from '../components/layout/topBar/AppTopBar';
import { TopBarBreadcrumbs } from '../components/layout/topBar/TopBarBreadcrumbs';
import { TopBarIconButton } from '../components/layout/topBar/TopBarIconButton';
import { TopBarDivider } from '../components/layout/topBar/TopBarDivider';
import { TopBarShareButton } from '../components/layout/topBar/TopBarShareButton';
import { UserAccountMenu } from '../components/auth/UserAccountMenu';
import { CreateDocMenu, type CreateDocType } from '../components/CreateDocMenu';
import { WikiSpaceSidebar } from '../components/wiki/WikiSpaceSidebar';
import { WikiSpaceHomeContent } from '../components/wiki/WikiSpaceHomeContent';
import { WikiSpaceDocEditor } from '../components/wiki/WikiSpaceDocEditor';
import { KbMembersModal } from '../components/wiki/KbMembersModal';
import { knowledgeBaseStore } from '../stores/knowledgeBaseStore';
import { authStore } from '../stores/authStore';
import { useTemplatePicker } from '../components/templates/TemplatePickerContext';
import { formatRelativeModified } from '../utils/formatDate';
import { appPath } from '../utils/appPaths';
import type { DocumentViewMode } from '../utils/documentViewMode';

export const WikiSpacePage: React.FC = () => {
  const { kbId = '', nodeId, docId } = useParams<{ kbId: string; nodeId?: string; docId?: string }>();
  const navigate = useNavigate();
  const authState = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const kbRevision = useSyncExternalStore(knowledgeBaseStore.subscribe, knowledgeBaseStore.getRevision);
  const workspaceRevision = useSyncExternalStore(authStore.subscribe, authStore.getWorkspaceRevision);
  const { openTemplatePicker } = useTemplatePicker();

  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [kbReady, setKbReady] = useState(false);
  const [docViewMode, setDocViewMode] = useState<{
    readOnly: boolean;
    canEdit: boolean;
    effectiveViewMode: DocumentViewMode;
    togglePreview: () => void;
  } | null>(null);

  const kb = useMemo(() => {
    void kbRevision;
    return knowledgeBaseStore.getById(kbId);
  }, [kbId, kbRevision]);

  const nodes = useMemo(() => {
    void kbRevision;
    return kb ? knowledgeBaseStore.listNodes(kb.id) : [];
  }, [kb, kbRevision]);

  const activeNode = useMemo(() => {
    if (docId) {
      return nodes.find(node => node.docId === docId) ?? null;
    }
    if (nodeId) {
      return nodes.find(node => node.id === nodeId) ?? null;
    }
    return nodes.find(node => node.isHome) ?? nodes[0] ?? null;
  }, [nodes, nodeId, docId]);

  useEffect(() => {
    let cancelled = false;
    setKbReady(false);
    void (async () => {
      const loadedKb = await knowledgeBaseStore.ensureKb(kbId);
      if (cancelled || !loadedKb) {
        if (!cancelled) setKbReady(true);
        return;
      }
      await knowledgeBaseStore.loadNodes(loadedKb.id);
      if (!cancelled) setKbReady(true);
    })();
    return () => { cancelled = true; };
  }, [kbId, workspaceRevision]);

  useEffect(() => {
    if (!kbReady || !kb || nodeId || docId) return;
    const home = nodes.find(node => node.isHome);
    if (home) {
      navigate(appPath.wikiSpaceNode(kb.id, home.id), { replace: true });
    }
  }, [kbReady, kb, nodes, nodeId, docId, navigate]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setDocViewMode(null);
  }, [docId]);

  const organizationName = useMemo(() => {
    const session = authState.session;
    const tenant = authState.tenants.find(t => t.id === session?.currentTenantId);
    return tenant?.name || '当前企业';
  }, [authState.session, authState.tenants]);

  const tenantId = authState.session?.currentTenantId ?? null;
  const canManageMembers = kb?.visibility === 'members' && authState.session?.currentIdentityType === 'tenant';

  const showStub = useCallback((name: string) => setToast(`${name}功能开发中`), []);

  const handleSelectNode = useCallback((selectedNodeId: string) => {
    if (!kb) return;
    const node = nodes.find(item => item.id === selectedNodeId);
    if (!node) return;
    if (node.docId) {
      navigate(appPath.wikiSpaceDoc(kb.id, node.docId));
      return;
    }
    navigate(appPath.wikiSpaceNode(kb.id, node.id));
  }, [kb, nodes, navigate]);

  const handlePickDocType = useCallback((type: CreateDocType) => {
    if (!kb) return;
    setCreateMenuOpen(false);
    const homeNode = nodes.find(node => node.isHome);
    openTemplatePicker({
      typeFilter: type,
      kbContext: homeNode ? { kbId: kb.id, parentNodeId: homeNode.id } : undefined,
    });
  }, [openTemplatePicker, nodes, kb]);

  if (!kbReady) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8f959e' }}>
        加载中…
      </div>
    );
  }

  if (!kb) {
    return <Navigate to={appPath.wiki} replace />;
  }

  if ((nodeId || docId) && nodes.length > 0 && !activeNode) {
    return <Navigate to={appPath.wikiSpace(kb.id)} replace />;
  }

  const subtitle = activeNode?.updatedAt
    ? `最近修改：${formatRelativeModified(activeNode.updatedAt)}`
    : undefined;
  const docPreviewSubtitle = docId && docViewMode?.effectiveViewMode === 'preview'
    ? '预览模式'
    : null;
  const breadcrumbSubtitle = [docPreviewSubtitle, subtitle].filter(Boolean).join(' · ') || undefined;

  return (
    <div style={{ display: 'flex', height: '100%', minWidth: 0, overflow: 'hidden' }}>
      <KbMembersModal
        open={membersOpen}
        kbId={kb.id}
        tenantId={tenantId}
        onClose={() => setMembersOpen(false)}
        onToast={setToast}
      />

      <WikiSpaceSidebar
        kb={kb}
        nodes={nodes}
        activeNodeId={activeNode?.id ?? ''}
        onSelectNode={handleSelectNode}
        onStub={showStub}
        onToast={setToast}
        onOpenMembers={canManageMembers ? () => setMembersOpen(true) : undefined}
      />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AppTopBar
          left={(
            <TopBarBreadcrumbs
              items={[
                { label: organizationName, onClick: () => navigate(appPath.home) },
                { label: kb.name, onClick: () => navigate(appPath.wiki) },
                { label: activeNode?.title ?? '首页' },
              ]}
              subtitle={breadcrumbSubtitle}
            />
          )}
          right={(
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <TopBarShareButton onClick={() => showStub('分享')} />
              {docId && docViewMode?.canEdit ? (
                <button
                  type="button"
                  onClick={docViewMode.togglePreview}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 32,
                    padding: '0 12px',
                    borderRadius: 6,
                    border: '1px solid #dee0e3',
                    background: docViewMode.effectiveViewMode === 'preview' ? '#f0f4ff' : '#fff',
                    color: docViewMode.effectiveViewMode === 'preview' ? '#3370ff' : '#1f2329',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 20h4l11-11-4-4L4 16v4z" />
                  </svg>
                  {docViewMode.effectiveViewMode === 'preview' ? '退出预览' : '预览'}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              ) : docId && docViewMode?.readOnly ? (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 32,
                  padding: '0 10px',
                  borderRadius: 6,
                  background: '#f0f4ff',
                  color: '#3370ff',
                  fontSize: 13,
                }}>
                  只读预览
                </span>
              ) : (
              <button
                type="button"
                onClick={() => showStub('编辑')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 32,
                  padding: '0 12px',
                  borderRadius: 6,
                  border: '1px solid #dee0e3',
                  background: '#fff',
                  color: '#1f2329',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 20h4l11-11-4-4L4 16v4z" />
                </svg>
                编辑
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              )}
              <TopBarIconButton title="通知" onClick={() => showStub('通知')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </TopBarIconButton>
              <div style={{ position: 'relative' }}>
                <TopBarIconButton title="更多" active={moreMenuOpen} onClick={() => setMoreMenuOpen(v => !v)}>
                  <span style={{ fontSize: 16, lineHeight: 1, letterSpacing: 1 }}>···</span>
                </TopBarIconButton>
                {moreMenuOpen && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 50 }}
                      onClick={() => setMoreMenuOpen(false)}
                    />
                    <div style={{
                      position: 'absolute',
                      right: 0,
                      top: '100%',
                      marginTop: 6,
                      minWidth: 160,
                      background: '#fff',
                      border: '1px solid #dee0e3',
                      borderRadius: 8,
                      boxShadow: '0 8px 28px rgba(31,35,41,0.12)',
                      zIndex: 51,
                      padding: '6px 0',
                    }}>
                      {canManageMembers && (
                        <button
                          type="button"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            setMembersOpen(true);
                          }}
                          style={moreMenuItemStyle}
                        >
                          成员管理
                        </button>
                      )}
                      <button type="button" onClick={() => { setMoreMenuOpen(false); showStub('知识库设置'); }} style={moreMenuItemStyle}>
                        知识库设置
                      </button>
                    </div>
                  </>
                )}
              </div>
              <TopBarDivider />
              <TopBarIconButton title="搜索" onClick={() => showStub('搜索')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" /><path d="M20 20l-3-3" />
                </svg>
              </TopBarIconButton>
              <div style={{ position: 'relative' }}>
                <TopBarIconButton
                  title="新建"
                  filled
                  active={createMenuOpen}
                  onClick={() => setCreateMenuOpen(v => !v)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </TopBarIconButton>
                <CreateDocMenu
                  open={createMenuOpen}
                  variant="dropdown"
                  context="wikiSpace"
                  onClose={() => setCreateMenuOpen(false)}
                  onCreate={handlePickDocType}
                  onStub={showStub}
                />
              </div>
              <TopBarDivider />
              <UserAccountMenu
                variant="avatar"
                displayName={authState.user?.displayName}
                email={authState.user?.email}
              />
            </div>
          )}
        />

        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column' }}>
          {docId ? (
            <WikiSpaceDocEditor docId={docId} onViewModeChange={setDocViewMode} />
          ) : activeNode?.isHome || activeNode?.type === 'page' ? (
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <WikiSpaceHomeContent
                spaceName={kb.name}
                lastModified={activeNode?.updatedAt}
              />
            </div>
          ) : (
            <div style={{ padding: 48, textAlign: 'center', color: '#8f959e', fontSize: 14 }}>
              「{activeNode?.title}」内容开发中
            </div>
          )}
        </div>
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

const moreMenuItemStyle: React.CSSProperties = {
  width: '100%',
  display: 'block',
  padding: '8px 14px',
  border: 'none',
  background: 'transparent',
  textAlign: 'left',
  fontSize: 14,
  color: '#1f2329',
  cursor: 'pointer',
};
