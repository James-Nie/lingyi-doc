import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { DocumentManager } from '@lingyi-doc/core';
import type { DocumentListItem } from '@lingyi-doc/core';
import { SidebarDocContextMenu, type SidebarDocAction } from './SidebarDocContextMenu';
import { RenameDocumentModal } from '../RenameDocumentModal';
import { useTemplatePicker } from '../templates/TemplatePickerContext';
import { documentLibraryStore } from '../../stores/documentLibraryStore';
import { appPath, isDocPublicPath } from '../../utils/appPaths';
import { confirmDeleteToRecycleBin } from '../../utils/appDialog';
import { DocumentShareApi } from '../../api/documentShare';
import { navigateToDoc, openDocInNewTab } from '../../utils/navigateToDoc';
import { SidebarDirectorySection } from './sidebar/SidebarDirectorySection';
import { SidebarIconBtn } from './sidebar/SidebarIconBtn';
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
  const { docId: routeDocId } = useParams<{ docId?: string }>();
  const [activeDocId, setActiveDocId] = useState<string | undefined>(routeDocId);
  const { openTemplatePicker } = useTemplatePicker();
  const [search, setSearch] = useState('');
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [libraryExpanded, setLibraryExpanded] = useState(true);
  const [sortAsc, setSortAsc] = useState(true);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [renameDoc, setRenameDoc] = useState<DocumentListItem | null>(null);
  const {
    hoveredItemId: hoveredDocId,
    setHoveredItemId: setHoveredDocId,
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
  );

  const reloadDocs = useCallback(() => {
    DocumentManager.list('lastVisited').then(setDocuments).catch(() => { /* ignore */ });
  }, []);

  useEffect(() => {
    reloadDocs();
  }, [reloadDocs, workspaceRevision, libraryRevision]);

  useEffect(() => {
    if (routeDocId) {
      setActiveDocId(routeDocId);
      return;
    }
    if (isDocPublicPath(location.pathname)) {
      const [spaceSlug, bookSlug, docSlug] = location.pathname.split('/').filter(Boolean);
      let cancelled = false;
      DocumentShareApi.resolveDocByPath(spaceSlug, bookSlug, docSlug)
        .then(ctx => {
          if (!cancelled) setActiveDocId(ctx.docId);
        })
        .catch(() => {
          if (!cancelled) setActiveDocId(undefined);
        });
      return () => { cancelled = true; };
    }
    setActiveDocId(undefined);
  }, [routeDocId, location.pathname]);

  useEffect(() => {
    if (!activeDocId) return;
    setDocuments(prev => {
      const idx = prev.findIndex(d => d.id === activeDocId);
      if (idx <= 0) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.unshift({ ...item, lastVisitedAt: Date.now() });
      return next;
    });
  }, [activeDocId]);

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
    () => filteredDocs.map(doc => ({
      id: doc.id,
      title: doc.title || '未命名文档',
      docType: doc.docType,
    })),
    [filteredDocs],
  );

  const handleDocAction = async (action: SidebarDocAction) => {
    if (!menuDoc) return;
    const doc = menuDoc;

    if (action === 'openNewTab') {
      void openDocInNewTab(doc.id);
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
    if (action === 'delete') {
      closeMenu();
      const confirmed = await confirmDeleteToRecycleBin();
      if (!confirmed) return;
      setBusyDocId(doc.id);
      try {
        await DocumentManager.delete(doc.id);
        toast('文档已移入回收站');
        reloadDocs();
        if (activeDocId === doc.id) navigate(appPath.home);
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
      moveTo: '移动到',
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

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 8px 16px' }}>

        <SidebarDirectorySection
          title="我的文档库"
          expanded={libraryExpanded}
          onToggleExpanded={() => setLibraryExpanded(v => !v)}
          onToggleSort={() => setSortAsc(v => !v)}
          items={directoryItems}
          activeItemId={activeDocId}
          hoveredItemId={hoveredDocId}
          menuItemId={menuDocId}
          onItemClick={item => { void navigateToDoc(navigate, item.id); }}
          onItemMouseEnter={setHoveredDocId}
          onItemMouseLeave={id => {
            if (menuDocId !== id) setHoveredDocId(null);
          }}
          onItemQuickAdd={(id, e) => {
            e.stopPropagation();
            stub('添加快捷方式');
          }}
          onItemMore={(id, btn) => openMenu(id, btn)}
          onItemContextMenu={(id, e) => {
            openMenuAt(id, new DOMRect(e.clientX, e.clientY, 0, 0));
          }}
          addAction={(
            <SidebarIconBtn title="新建" onClick={() => openTemplatePicker()}>
              +
            </SidebarIconBtn>
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
