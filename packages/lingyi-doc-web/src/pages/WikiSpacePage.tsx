import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { AppTopBar } from '../components/layout/topBar/AppTopBar';
import { TopBarBreadcrumbs, type TopBarBreadcrumbItem } from '../components/layout/topBar/TopBarBreadcrumbs';
import { TopBarIconButton } from '../components/layout/topBar/TopBarIconButton';
import { TopBarDivider } from '../components/layout/topBar/TopBarDivider';
import { TopBarShareButton } from '../components/layout/topBar/TopBarShareButton';
import { UserAccountMenu } from '../components/auth/UserAccountMenu';
import { CreateDocTopBarTrigger } from '../components/createDoc';
import { useCreateDocument } from '../hooks/useCreateDocument';
import { WikiSpaceSidebar } from '../components/wiki/WikiSpaceSidebar';
import { WikiSpaceHomeContent } from '../components/wiki/WikiSpaceHomeContent';
import { WikiSpaceFolderContent } from '../components/wiki/WikiSpaceFolderContent';
import { WikiSpaceDocEditor } from '../components/wiki/WikiSpaceDocEditor';
import { KbMembersModal } from '../components/wiki/KbMembersModal';
import { knowledgeBaseStore } from '../stores/knowledgeBaseStore';
import { authStore } from '../stores/authStore';
import { formatRelativeModified } from '../utils/formatDate';
import { appPath } from '../utils/appPaths';
import { buildKbNodePath, getKbBreadcrumbPath } from '../utils/kbTreeUtils';

export const WikiSpacePage: React.FC = () => {
  const { kbId = '', nodeId, docId } = useParams<{ kbId: string; nodeId?: string; docId?: string }>();
  const navigate = useNavigate();
  const authState = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const kbRevision = useSyncExternalStore(knowledgeBaseStore.subscribe, knowledgeBaseStore.getRevision);
  const workspaceRevision = useSyncExternalStore(authStore.subscribe, authStore.getWorkspaceRevision);

  const [membersOpen, setMembersOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [kbReady, setKbReady] = useState(false);

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

  const organizationName = useMemo(() => {
    const session = authState.session;
    const tenant = authState.tenants.find(t => t.id === session?.currentTenantId);
    return tenant?.name || '当前企业';
  }, [authState.session, authState.tenants]);

  const tenantId = authState.session?.currentTenantId ?? null;
  const canManageKb = kb?.myRole === 'owner' || kb?.myRole === 'admin';
  const canManageMembers = Boolean(canManageKb && kb?.visibility === 'members');

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

  const homeNode = useMemo(() => nodes.find(node => node.isHome) ?? null, [nodes]);

  const createDoc = useCreateDocument({
    getKbContext: () => {
      if (!kb || !homeNode) return undefined;
      return { kbId: kb.id, parentNodeId: homeNode.id };
    },
  });

  const handleCreateFolder = useCallback(async () => {
    if (!kb) return;
    createDoc.closeMenu();
    const parentId = homeNode?.id ?? null;
    try {
      const folder = await knowledgeBaseStore.createFolder(kb.id, '未命名文件夹', parentId);
      setToast('文件夹已创建');
      navigate(appPath.wikiSpaceNode(kb.id, folder.id));
    } catch (err) {
      setToast(`创建文件夹失败: ${(err as Error).message}`);
    }
  }, [kb, homeNode?.id, createDoc.closeMenu, navigate]);

  const folderChildren = useMemo(() => {
    if (!activeNode || activeNode.type !== 'folder') return [];
    return nodes.filter(node => node.parentId === activeNode.id);
  }, [nodes, activeNode]);

  const breadcrumbItems = useMemo((): TopBarBreadcrumbItem[] => {
    const items: TopBarBreadcrumbItem[] = [
      { label: organizationName, onClick: () => navigate(appPath.home) },
      {
        label: kb?.name ?? '知识库',
        onClick: () => {
          if (!kb) return;
          if (homeNode) navigate(appPath.wikiSpaceNode(kb.id, homeNode.id));
          else navigate(appPath.wikiSpace(kb.id));
        },
      },
    ];

    if (!activeNode) {
      items.push({ label: '首页' });
      return items;
    }

    const path = getKbBreadcrumbPath(buildKbNodePath(nodes, activeNode.id));
    path.forEach((node, index) => {
      const isLast = index === path.length - 1;
      const label = node.title || (node.isHome ? '首页' : '未命名');
      if (isLast) {
        items.push({ label });
        return;
      }
      items.push({
        label,
        onClick: () => {
          if (!kb) return;
          if (node.docId) navigate(appPath.wikiSpaceDoc(kb.id, node.docId));
          else navigate(appPath.wikiSpaceNode(kb.id, node.id));
        },
      });
    });

    return items;
  }, [organizationName, kb, homeNode, activeNode, nodes, navigate]);

  const docBreadcrumbItems = useMemo(() => {
    if (!docId) return undefined;
    if (breadcrumbItems.length <= 1) return breadcrumbItems;
    return breadcrumbItems.slice(0, -1);
  }, [docId, breadcrumbItems]);

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
  const breadcrumbSubtitle = subtitle;

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
        {!docId && (
        <AppTopBar
          left={(
            <TopBarBreadcrumbs
              items={breadcrumbItems}
              subtitle={breadcrumbSubtitle}
            />
          )}
          right={(
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <TopBarShareButton onClick={() => showStub('分享')} />
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
                      {canManageKb && (
                        <button
                          type="button"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            navigate(appPath.wikiSettings(kb.id));
                          }}
                          style={moreMenuItemStyle}
                        >
                          知识库设置
                        </button>
                      )}
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
              <CreateDocTopBarTrigger
                menuOpen={createDoc.menuOpen}
                context="wikiSpace"
                onToggle={() => createDoc.setMenuOpen(v => !v)}
                onClose={createDoc.closeMenu}
                onCreate={createDoc.handlePickDocType}
                onStub={showStub}
                onCreateFolder={handleCreateFolder}
              />
              <TopBarDivider />
              <UserAccountMenu
                variant="avatar"
                displayName={authState.user?.displayName}
                email={authState.user?.email}
              />
            </div>
          )}
        />
        )}

        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column' }}>
          {docId ? (
            <WikiSpaceDocEditor docId={docId} breadcrumbItems={docBreadcrumbItems} />
          ) : activeNode?.isHome || activeNode?.type === 'page' ? (
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <WikiSpaceHomeContent
                spaceName={kb.name}
                lastModified={activeNode?.updatedAt}
              />
            </div>
          ) : activeNode?.type === 'folder' ? (
            <WikiSpaceFolderContent
              folder={activeNode}
              childNodes={folderChildren}
              onSelectNode={handleSelectNode}
            />
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
