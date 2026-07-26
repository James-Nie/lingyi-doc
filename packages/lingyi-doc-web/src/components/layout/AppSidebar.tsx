import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { DocumentManager } from '@lingyi-doc/core';
import type { DocumentListItem } from '@lingyi-doc/core';
import { SidebarDocContextMenu, type SidebarDocAction } from './SidebarDocContextMenu';
import { RenameDocumentModal } from '../RenameDocumentModal';
import { MoveDocumentModal } from '../MoveDocumentModal';
import { CreateDocSidebarTrigger } from '../createDoc';
import { useCreateDocument } from '../../hooks/useCreateDocument';
import { documentLibraryStore } from '../../stores/documentLibraryStore';
import { activeDocumentStore } from '../../stores/activeDocumentStore';
import { appPath, isDocPublicPath, decodePathSegment } from '../../utils/appPaths';
import { confirmDeleteToRecycleBin } from '../../utils/appDialog';
import { DocumentShareApi } from '../../api/documentShare';
import {
  lookupDocIdByHref,
  navigateToDoc,
  openDocInNewTab,
  rememberDocPathContext,
  rememberDocPathsFromList,
} from '../../utils/navigateToDoc';
import { resolveMoveDocumentSource, type MoveDocumentSource } from '../../utils/moveDocument';
import { SidebarDocumentDirectory } from './sidebar/SidebarDocumentDirectory';
import { mapDocumentsToDirectoryItems } from './sidebar/mapToDirectoryItems';
import { AppLogoWithName } from '../AppLogo';
import { SidebarResizeHandle } from './sidebar/SidebarResizeHandle';
import { useSidebarContextMenu } from './sidebar/useSidebarContextMenu';
import {
  SIDEBAR_MAX_W,
  SIDEBAR_MIN_W,
  useSidebarResize,
} from './sidebar/useSidebarResize';
import {
  SIDEBAR_ACTIVE_BG,
  SIDEBAR_ACTIVE_COLOR,
  SIDEBAR_HOVER_BG,
  SIDEBAR_MUTED,
  SIDEBAR_TEXT,
} from './sidebar/sidebarTheme';

const SIDEBAR_DEFAULT_W = 220;
const SIDEBAR_WIDTH_KEY = 'app-sidebar-width';
/** @deprecated 使用 SIDEBAR_DEFAULT_W */
const SIDEBAR_W = SIDEBAR_DEFAULT_W;
const BG = '#f5f6f7';
const BORDER = '#dee0e3';

const NAV_ITEMS = [
  { key: 'home', label: '主页', path: appPath.home, icon: HomeIcon },
  { key: 'wiki', label: '知识库', path: appPath.wiki, icon: WikiIcon },
  { key: 'recycle', label: '回收站', path: appPath.recycleBin, icon: RecycleIcon },
] as const;

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function DriveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 8h16l-2 10H6L4 8z" /><path d="M8 8l2-4h4l2 4" />
    </svg>
  );
}

function WikiIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14" /><path d="M8 7h8M8 11h8M8 15h5" />
    </svg>
  );
}

function MinutesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" />
    </svg>
  );
}

function RecycleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

interface AppSidebarProps {
  onStub?: (name: string) => void;
  onToast?: (msg: string) => void;
  workspaceRevision?: number;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({ onStub, onToast, workspaceRevision = 0 }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    docId: routeDocId,
    spaceSlug: routeSpaceSlug,
    bookSlug: routeBookSlug,
    docSlug: routeDocSlug,
  } = useParams<{
    docId?: string;
    spaceSlug?: string;
    bookSlug?: string;
    docSlug?: string;
  }>();
  const createDoc = useCreateDocument();
  const [search, setSearch] = useState('');
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [sortAsc, setSortAsc] = useState(true);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [renameDoc, setRenameDoc] = useState<DocumentListItem | null>(null);
  const [moveSource, setMoveSource] = useState<MoveDocumentSource | null>(null);
  /** 公开路径下编辑页尚未写入 store 时的兜底 doc.id */
  const [pathDocId, setPathDocId] = useState<string | undefined>(() => {
    if (routeDocId) return routeDocId;
    if (isDocPublicPath(location.pathname)) return lookupDocIdByHref(location.pathname);
    return undefined;
  });
  const {
    menuItemId: menuDocId,
    menuAnchor,
    openMenu,
    openMenuAt,
    closeMenu,
    handleMenuClose,
  } = useSidebarContextMenu();
  const {
    sidebarWidth,
    resizeHover,
    resizing,
    setResizeHover,
    handleResizeStart,
  } = useSidebarResize({
    storageKey: SIDEBAR_WIDTH_KEY,
    defaultWidth: SIDEBAR_DEFAULT_W,
    cssVarName: '--app-sidebar-width',
  });

  const libraryRevision = useSyncExternalStore(
    documentLibraryStore.subscribe,
    documentLibraryStore.getRevision,
    documentLibraryStore.getRevision,
  );

  /** 当前打开文档的 doc.id（由 DocPublicEditorPage 写入） */
  const viewingDocId = useSyncExternalStore(
    activeDocumentStore.subscribe,
    activeDocumentStore.getDocId,
    activeDocumentStore.getServerSnapshot,
  );

  /** 与列表项 id 一致：均为文档 doc.id */
  const activeItemId = viewingDocId ?? routeDocId ?? pathDocId;

  const onDocRoute = !!(
    routeDocId
    || (routeSpaceSlug && routeBookSlug && routeDocSlug && isDocPublicPath(location.pathname))
  );

  const reloadDocs = useCallback(() => {
    DocumentManager.list('lastVisited')
      .then(docs => {
        rememberDocPathsFromList(docs);
        setDocuments(docs);
      })
      .catch(() => { /* ignore */ });
  }, []);

  useEffect(() => {
    reloadDocs();
  }, [reloadDocs, workspaceRevision, libraryRevision]);

  // 离开文档页时再清空选中；勿在编辑页 unmount cleanup 里清，否则会冲掉点击时的乐观选中
  // （普通表格加载慢时尤其明显）
  useEffect(() => {
    if (!onDocRoute) activeDocumentStore.setDocId(undefined);
  }, [onDocRoute]);

  useEffect(() => {
    if (routeDocId) {
      setPathDocId(routeDocId);
      return;
    }

    // 优先用路由 params（React Router 已解码），避免 pathname 二次 encode
    const spaceSlug = routeSpaceSlug ? decodePathSegment(routeSpaceSlug) : undefined;
    const bookSlug = routeBookSlug ? decodePathSegment(routeBookSlug) : undefined;
    const docSlug = routeDocSlug ? decodePathSegment(routeDocSlug) : undefined;

    if (spaceSlug && bookSlug && docSlug && isDocPublicPath(location.pathname)) {
      const cachedId = lookupDocIdByHref(location.pathname);
      if (cachedId) {
        setPathDocId(cachedId);
        // 有缓存也同步到 store，保证普通表格等慢加载场景选中不丢
        activeDocumentStore.setDocId(cachedId);
        return;
      }

      let cancelled = false;
      DocumentShareApi.resolveDocByPath(spaceSlug, bookSlug, docSlug)
        .then(ctx => {
          if (cancelled || !ctx?.docId) return;
          rememberDocPathContext(ctx);
          setPathDocId(ctx.docId);
          activeDocumentStore.setDocId(ctx.docId);
        })
        .catch(() => {
          // 失败时保留已有 viewingDocId / pathDocId，避免清空选中
        });
      return () => { cancelled = true; };
    }

    setPathDocId(undefined);
  }, [routeDocId, routeSpaceSlug, routeBookSlug, routeDocSlug, location.pathname]);

  useEffect(() => {
    if (!activeItemId) return;
    setDocuments(prev => {
      const idx = prev.findIndex(d => d.id === activeItemId);
      if (idx <= 0) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.unshift({ ...item, lastVisitedAt: Date.now() });
      return next;
    });
  }, [activeItemId]);

  const stub = (name: string) => onStub?.(name);
  const toast = (msg: string) => onToast?.(msg);

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? documents.filter(d => (d.title || '').toLowerCase().includes(q))
      : [...documents];
    list.sort((a, b) => {
      const cmp = (a.title || '').localeCompare(b.title || '', 'zh-CN');
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [documents, search, sortAsc]);

  const menuDoc = menuDocId ? documents.find(d => d.id === menuDocId) : null;

  const directoryItems = useMemo(
    () => mapDocumentsToDirectoryItems(filteredDocs),
    [filteredDocs],
  );

  const handleDocAction = async (action: SidebarDocAction) => {
    if (!menuDoc) return;
    const doc = menuDoc;

    if (action === 'openNewTab') {
      void openDocInNewTab(
        doc.id,
        doc.spaceSlug && doc.bookSlug && doc.docSlug
          ? { spaceSlug: doc.spaceSlug, bookSlug: doc.bookSlug, docSlug: doc.docSlug }
          : null,
      );
      closeMenu();
      return;
    }
    if (action === 'copyLink') {
      closeMenu();
      try {
        await DocumentManager.copyLink(doc.id);
        toast('链接已复制');
      } catch (err) {
        toast(`复制失败: ${(err as Error).message}`);
      }
      return;
    }
    if (action === 'duplicate') {
      closeMenu();
      setBusyDocId(doc.id);
      try {
        const newId = await DocumentManager.duplicate(doc.id);
        toast('副本已创建');
        reloadDocs();
        void navigateToDoc(navigate, newId);
      } catch (err) {
        toast(`创建副本失败: ${(err as Error).message}`);
      } finally {
        setBusyDocId(null);
      }
      return;
    }
    if (action === 'rename') {
      closeMenu();
      setRenameDoc(doc);
      return;
    }
    if (action === 'moveTo') {
      closeMenu();
      void resolveMoveDocumentSource({
        docId: doc.id,
        title: doc.title || '未命名文档',
      }).then(setMoveSource);
      return;
    }
    if (action === 'delete') {
      closeMenu();
      const confirmed = await confirmDeleteToRecycleBin();
      if (!confirmed) return;
      setBusyDocId(doc.id);
      try {
        await DocumentManager.delete(doc.id);
        toast('文档已移入回收站');
        reloadDocs();
        if (activeItemId === doc.id) navigate(appPath.home);
      } catch (err) {
        toast(`删除失败: ${(err as Error).message}`);
      } finally {
        setBusyDocId(null);
      }
      return;
    }

    closeMenu();
    const stubLabels: Partial<Record<SidebarDocAction, string>> = {
      share: '分享',
      pin: '置顶',
      transfer: '转移所有权',
    };
    stub(stubLabels[action] || action);
  };

  return (
    <aside
      style={{
        width: sidebarWidth,
        flexShrink: 0,
        height: '100%',
        background: BG,
        borderRight: `1px solid ${BORDER}`,
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        position: 'relative',
      }}
    >
      {/* Logo */}
      <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center' }}>
        <AppLogoWithName size={28} fontSize={15} color={SIDEBAR_TEXT} />
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 12px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', background: '#fff', borderRadius: 6,
          border: `1px solid ${BORDER}`,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={SIDEBAR_MUTED} strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3-3" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索"
            style={{
              flex: 1, border: 'none', outline: 'none', fontSize: 13,
              background: 'transparent', color: SIDEBAR_TEXT,
            }}
          />
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '0 8px' }}>
        {NAV_ITEMS.map(item => {
          const active = item.path
            ? (item.key === 'wiki'
              ? location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
              : location.pathname === item.path)
            : false;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                if (item.path) navigate(item.path);
                else stub(item.label);
              }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', marginBottom: 2, border: 'none', borderRadius: 6,
                background: active ? SIDEBAR_ACTIVE_BG : 'transparent',
                color: active ? SIDEBAR_ACTIVE_COLOR : SIDEBAR_TEXT,
                fontSize: 14, cursor: 'pointer', textAlign: 'left',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = SIDEBAR_HOVER_BG; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = active ? SIDEBAR_ACTIVE_BG : 'transparent'; }}
            >
              <Icon />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0 16px 8px' }}>
        <SidebarDocumentDirectory
          title="我的文档库"
          emptyText="暂无文档"
          items={directoryItems}
          activeItemId={activeItemId}
          menuItemId={menuDocId}
          onToggleSort={() => setSortAsc(v => !v)}
          onItemClick={item => {
            // item.id === doc.id；navigateToDoc 内会写入 activeDocumentStore
            const doc = documents.find(d => d.id === item.id);
            void navigateToDoc(navigate, item.id, {
              path: doc?.spaceSlug && doc.bookSlug && doc.docSlug
                ? { spaceSlug: doc.spaceSlug, bookSlug: doc.bookSlug, docSlug: doc.docSlug }
                : null,
            });
          }}
          onItemQuickAdd={(_id, e) => {
            e.stopPropagation();
            stub('添加快捷方式');
          }}
          onItemMore={(id, btn) => openMenu(id, btn)}
          onItemContextMenu={(id, e) => {
            openMenuAt(id, new DOMRect(e.clientX, e.clientY, 0, 0));
          }}
          addAction={(
            <CreateDocSidebarTrigger
              title="新建"
              menuOpen={createDoc.menuOpen}
              menuAnchor={createDoc.menuAnchor}
              onToggle={createDoc.toggleMenuAt}
              onClose={createDoc.closeMenu}
              onCreate={createDoc.handlePickDocType}
              onStub={stub}
              onCreateKnowledgeBase={createDoc.openCreateKnowledgeBase}
            />
          )}
        />
      </div>

      <SidebarDocContextMenu
        open={!!menuDocId}
        anchorRect={menuAnchor}
        busy={!!busyDocId}
        onClose={handleMenuClose}
        onAction={handleDocAction}
      />

      <RenameDocumentModal
        open={renameDoc !== null}
        initialTitle={renameDoc?.title ?? '未命名文档'}
        loading={renameDoc !== null && busyDocId === renameDoc.id}
        onCancel={() => setRenameDoc(null)}
        onSubmit={async (title) => {
          if (!renameDoc) return;
          setBusyDocId(renameDoc.id);
          try {
            await DocumentManager.renameTitle(renameDoc.id, title);
            toast('已重命名');
            reloadDocs();
            setRenameDoc(null);
          } catch (err) {
            toast(`重命名失败: ${(err as Error).message}`);
          } finally {
            setBusyDocId(null);
          }
        }}
      />

      <MoveDocumentModal
        open={moveSource !== null}
        source={moveSource}
        onClose={() => setMoveSource(null)}
        onMoved={() => {
          toast('已移动');
          reloadDocs();
          documentLibraryStore.bump();
        }}
        onError={msg => toast(`移动失败: ${msg}`)}
      />

      <SidebarResizeHandle
        sidebarWidth={sidebarWidth}
        resizeHover={resizeHover}
        resizing={resizing}
        onResizeStart={handleResizeStart}
        onResizeHover={setResizeHover}
      />
    </aside>
  );
};

export { SIDEBAR_W, SIDEBAR_MIN_W, SIDEBAR_MAX_W, SIDEBAR_DEFAULT_W };
