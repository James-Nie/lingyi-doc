import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocumentManager } from '@lingyi-doc/core';
import type { DocumentListItem } from '@lingyi-doc/core';
import { CreateDocSidebarTrigger } from '../createDoc';
import { useCreateDocument } from '../../hooks/useCreateDocument';
import { SidebarDocContextMenu, type SidebarDocAction } from '../layout/SidebarDocContextMenu';
import { RenameDocumentModal } from '../RenameDocumentModal';
import { SidebarDocumentDirectory } from '../layout/sidebar/SidebarDocumentDirectory';
import { mapKbNodesToDirectoryItems } from '../layout/sidebar/mapToDirectoryItems';
import { SidebarResizeHandle } from '../layout/sidebar/SidebarResizeHandle';
import { useSidebarResize } from '../layout/sidebar/useSidebarResize';
import { useSidebarContextMenu } from '../layout/sidebar/useSidebarContextMenu';
import { ImportCloudDocModal } from './ImportCloudDocModal';
import { KbMoveNodeModal } from './KbMoveNodeModal';
import { MoveDocumentModal } from '../MoveDocumentModal';
import { knowledgeBaseStore, type KnowledgeBase, type WikiSpaceNode } from '../../stores/knowledgeBaseStore';
import { documentLibraryStore } from '../../stores/documentLibraryStore';
import { appPath } from '../../utils/appPaths';
import { confirmDeleteToRecycleBin } from '../../utils/appDialog';
import { collectAncestorIds } from '../../utils/kbTreeUtils';
import {
  canDropKbNode,
  computeKbNodeMove,
  resolveKbDropPosition,
  type KbDropTarget,
} from '../../utils/kbDirectoryDnD';
import { resolveMoveDocumentSource, type MoveDocumentSource } from '../../utils/moveDocument';

interface WikiSpaceSidebarProps {
  kb: KnowledgeBase;
  nodes: WikiSpaceNode[];
  activeNodeId: string;
  onSelectNode: (nodeId: string) => void;
  onStub: (name: string) => void;
  onToast?: (msg: string) => void;
  onOpenMembers?: () => void;
}

const WIKI_SIDEBAR_WIDTH_KEY = 'wiki-space-sidebar-width';
const WIKI_SIDEBAR_DEFAULT_W = 260;

export const WikiSpaceSidebar: React.FC<WikiSpaceSidebarProps> = ({
  kb,
  nodes,
  activeNodeId,
  onSelectNode,
  onStub,
  onToast,
  onOpenMembers,
}) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [busyNodeId, setBusyNodeId] = useState<string | null>(null);
  const [renameNode, setRenameNode] = useState<WikiSpaceNode | null>(null);
  const [moveNode, setMoveNode] = useState<WikiSpaceNode | null>(null);
  const [moveDocSource, setMoveDocSource] = useState<MoveDocumentSource | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [userExpanded, setUserExpanded] = useState<Record<string, boolean>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<KbDropTarget | null>(null);
  const {
    sidebarWidth,
    resizeHover,
    resizing,
    setResizeHover,
    handleResizeStart,
  } = useSidebarResize({
    storageKey: WIKI_SIDEBAR_WIDTH_KEY,
    defaultWidth: WIKI_SIDEBAR_DEFAULT_W,
  });
  const {
    menuItemId,
    menuAnchor,
    openMenu,
    openMenuAt,
    closeMenu,
    handleMenuClose,
  } = useSidebarContextMenu();

  const toast = useCallback((msg: string) => onToast?.(msg), [onToast]);

  useEffect(() => {
    DocumentManager.listOwned('lastVisited').then(setDocuments).catch(() => { /* ignore */ });
  }, []);

  const homeNode = useMemo(() => nodes.find(node => node.isHome) ?? null, [nodes]);
  const createDoc = useCreateDocument({
    getKbContext: () => {
      const parentNodeId = createParentId ?? homeNode?.id;
      return parentNodeId ? { kbId: kb.id, parentNodeId } : undefined;
    },
  });
  const isSearching = search.trim().length > 0;

  const defaultExpandedIds = useMemo(() => {
    const ids = new Set<string>();
    if (activeNodeId) {
      collectAncestorIds(nodes, activeNodeId).forEach(id => ids.add(id));
    }
    return ids;
  }, [nodes, activeNodeId]);

  const expandedIds = useMemo(() => {
    const set = new Set(defaultExpandedIds);
    for (const [id, expanded] of Object.entries(userExpanded)) {
      if (expanded) set.add(id);
      else set.delete(id);
    }
    return set;
  }, [defaultExpandedIds, userExpanded]);

  const openCreateMenu = useCallback((parentId: string | null, anchor: DOMRect) => {
    setCreateParentId(parentId);
    createDoc.openMenuAt(anchor);
  }, [createDoc.openMenuAt]);

  const closeCreateMenu = useCallback(() => {
    createDoc.closeMenu();
    setCreateParentId(null);
  }, [createDoc.closeMenu]);

  const handlePickDocType = useCallback((type: Parameters<typeof createDoc.handlePickDocType>[0]) => {
    createDoc.handlePickDocType(type);
    setCreateParentId(null);
  }, [createDoc]);

  const handleCreateFolder = useCallback(async () => {
    const parentId = createParentId ?? homeNode?.id ?? null;
    closeCreateMenu();
    try {
      const folder = await knowledgeBaseStore.createFolder(kb.id, '未命名文件夹', parentId);
      if (parentId) {
        setUserExpanded(prev => {
          const next = { ...prev, [parentId]: true };
          collectAncestorIds(nodes, parentId).forEach(id => { next[id] = true; });
          return next;
        });
      }
      setRenameNode(folder);
      navigate(appPath.wikiSpaceNode(kb.id, folder.id));
      toast('文件夹已创建');
    } catch (err) {
      toast(`创建文件夹失败: ${(err as Error).message}`);
    }
  }, [closeCreateMenu, createParentId, homeNode?.id, kb.id, navigate, nodes, toast]);

  const handleSidebarStub = (name: string) => {
    if (name === '迁入已有云文档') {
      closeCreateMenu();
      setImportOpen(true);
      return;
    }
    onStub(name);
  };

  const filteredNodes = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = nodes.filter(node => !node.isHome);
    let list = query
      ? base.filter(node => node.title.toLowerCase().includes(query))
      : [...base];
    if (isSearching) {
      list.sort((a, b) => {
        const cmp = a.title.localeCompare(b.title, 'zh-CN');
        return sortAsc ? cmp : -cmp;
      });
    }
    return list;
  }, [nodes, search, sortAsc, isSearching]);

  const directoryItems = useMemo(
    () => mapKbNodesToDirectoryItems({
      nodes: filteredNodes,
      documents,
      expandedIds,
      isSearching,
    }),
    [filteredNodes, documents, expandedIds, isSearching],
  );

  const existingDocIds = useMemo(
    () => nodes.map(node => node.docId).filter((id): id is string => Boolean(id)),
    [nodes],
  );

  const menuNode = menuItemId ? nodes.find(node => node.id === menuItemId) : null;

  const handleNodeClick = useCallback((nodeId: string) => {
    onSelectNode(nodeId);
  }, [onSelectNode]);

  const navigateAfterDelete = useCallback(() => {
    if (homeNode) {
      navigate(appPath.wikiSpaceNode(kb.id, homeNode.id));
    } else {
      navigate(appPath.wikiSpace(kb.id));
    }
  }, [homeNode, kb.id, navigate]);

  const handleToggleExpand = useCallback((nodeId: string) => {
    setUserExpanded(prev => ({
      ...prev,
      [nodeId]: !expandedIds.has(nodeId),
    }));
  }, [expandedIds]);

  const handleItemDragStart = useCallback((nodeId: string, e: React.DragEvent) => {
    if (isSearching) return;
    e.dataTransfer.setData('text/plain', nodeId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(nodeId);
    setDropTarget(null);
  }, [isSearching]);

  const handleItemDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTarget(null);
  }, []);

  const handleItemDragOver = useCallback((nodeId: string, e: React.DragEvent) => {
    if (!draggingId || isSearching) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const item = directoryItems.find(entry => entry.id === nodeId);
    if (!item) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const position = resolveKbDropPosition(e.clientY, rect, !!item.isFolder);
    if (!canDropKbNode(nodes, draggingId, nodeId, position)) {
      setDropTarget(null);
      return;
    }
    setDropTarget({ nodeId, position });
  }, [draggingId, directoryItems, isSearching, nodes]);

  const handleItemDragLeave = useCallback((nodeId: string, e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
    setDropTarget(current => (current?.nodeId === nodeId ? null : current));
  }, []);

  const handleItemDrop = useCallback(async (nodeId: string, e: React.DragEvent) => {
    e.preventDefault();
    if (!draggingId || isSearching || busyNodeId) return;

    const item = directoryItems.find(entry => entry.id === nodeId);
    if (!item) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const position = dropTarget?.nodeId === nodeId
      ? dropTarget.position
      : resolveKbDropPosition(e.clientY, rect, !!item.isFolder);
    const patch = computeKbNodeMove(nodes, draggingId, nodeId, position, homeNode?.id);
    if (!patch) return;

    setDraggingId(null);
    setDropTarget(null);
    setBusyNodeId(draggingId);
    try {
      await knowledgeBaseStore.moveNode(kb.id, draggingId, patch);
      if (position === 'inside') {
        setUserExpanded(prev => ({ ...prev, [nodeId]: true }));
      }
      toast('已更新位置');
    } catch (err) {
      toast(`移动失败: ${(err as Error).message}`);
    } finally {
      setBusyNodeId(null);
    }
  }, [
    busyNodeId,
    directoryItems,
    draggingId,
    dropTarget,
    homeNode?.id,
    isSearching,
    kb.id,
    nodes,
    toast,
  ]);

  const handleNodeAction = useCallback(async (action: SidebarDocAction) => {
    if (!menuNode) return;
    const node = menuNode;

    if (action === 'openNewTab') {
      if (node.docId) {
        window.open(appPath.wikiSpaceDoc(kb.id, node.docId), '_blank');
      } else {
        window.open(appPath.wikiSpaceNode(kb.id, node.id), '_blank');
      }
      closeMenu();
      return;
    }

    if (action === 'copyLink') {
      closeMenu();
      try {
        const url = node.docId
          ? `${window.location.origin}${appPath.wikiSpaceDoc(kb.id, node.docId)}`
          : `${window.location.origin}${appPath.wikiSpaceNode(kb.id, node.id)}`;
        await navigator.clipboard.writeText(url);
        toast('链接已复制');
      } catch {
        if (node.docId) {
          try {
            await DocumentManager.copyLink(node.docId);
            toast('链接已复制');
          } catch (err) {
            toast(`复制失败: ${(err as Error).message}`);
          }
        } else {
          onStub('复制链接');
        }
      }
      return;
    }

    if (action === 'duplicate') {
      closeMenu();
      if (!node.docId) {
        onStub('创建副本');
        return;
      }
      setBusyNodeId(node.id);
      try {
        const newId = await DocumentManager.duplicate(node.docId);
        await knowledgeBaseStore.addNode({
          kbId: kb.id,
          title: `${node.title} 副本`,
          type: 'doc',
          docId: newId,
          parentId: node.parentId ?? homeNode?.id ?? null,
        });
        toast('副本已创建');
        navigate(appPath.wikiSpaceDoc(kb.id, newId));
      } catch (err) {
        toast(`创建副本失败: ${(err as Error).message}`);
      } finally {
        setBusyNodeId(null);
      }
      return;
    }

    if (action === 'moveTo') {
      closeMenu();
      if (node.docId) {
        void resolveMoveDocumentSource({
          docId: node.docId,
          title: node.title || '未命名文档',
          kbNode: {
            kbId: kb.id,
            nodeId: node.id,
            parentId: node.parentId,
          },
          kbName: kb.name,
        }).then(setMoveDocSource);
      } else {
        setMoveNode(node);
      }
      return;
    }

    if (action === 'rename') {
      closeMenu();
      setRenameNode(node);
      return;
    }

    if (action === 'delete') {
      closeMenu();
      if (node.isHome) {
        toast('首页不可删除');
        return;
      }
      const confirmed = await confirmDeleteToRecycleBin();
      if (!confirmed) return;
      setBusyNodeId(node.id);
      try {
        await knowledgeBaseStore.removeNode(kb.id, node.id, {
          deleteDocument: Boolean(node.docId),
        });
        if (node.docId) documentLibraryStore.bump();
        toast(node.docId ? '文档已移入回收站' : '已从目录移除');
        if (activeNodeId === node.id) navigateAfterDelete();
      } catch (err) {
        toast(`删除失败: ${(err as Error).message}`);
      } finally {
        setBusyNodeId(null);
      }
      return;
    }

    closeMenu();
    const stubLabels: Partial<Record<SidebarDocAction, string>> = {
      share: '分享',
      pin: '置顶',
      transfer: '转移所有权',
    };
    onStub(stubLabels[action] || action);
  }, [
    menuNode,
    kb.id,
    closeMenu,
    toast,
    onStub,
    navigate,
    activeNodeId,
    homeNode,
    navigateAfterDelete,
  ]);

  const spaceInitial = kb.name.trim().charAt(0) || '空';

  return (
    <aside style={{
      width: sidebarWidth,
      flexShrink: 0,
      height: '100%',
      background: '#f5f6f7',
      borderRight: '1px solid #dee0e3',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      position: 'relative',
      userSelect: 'none',
    }}>
      <ImportCloudDocModal
        open={importOpen}
        existingDocIds={existingDocIds}
        onClose={() => setImportOpen(false)}
        onImport={async (doc) => {
          await knowledgeBaseStore.addNode({
            kbId: kb.id,
            title: doc.title || '未命名文档',
            type: doc.docType === 'freeform' || doc.docType === 'standard' ? 'sheet' : 'doc',
            docId: doc.id,
            parentId: createParentId ?? homeNode?.id ?? null,
          });
          setImportOpen(false);
          toast('文档已迁入');
          navigate(appPath.wikiSpaceDoc(kb.id, doc.id));
        }}
      />

      <KbMoveNodeModal
        open={moveNode !== null && !moveNode.docId}
        node={moveNode}
        nodes={nodes}
        onClose={() => setMoveNode(null)}
        onMove={async (targetParentId) => {
          if (!moveNode) return;
          const parentId = targetParentId ?? homeNode?.id ?? null;
          await knowledgeBaseStore.moveNode(kb.id, moveNode.id, { parentId });
          setMoveNode(null);
          toast('已移动');
        }}
      />

      <MoveDocumentModal
        open={moveDocSource !== null}
        source={moveDocSource}
        onClose={() => setMoveDocSource(null)}
        onMoved={target => {
          toast('已移动');
          documentLibraryStore.bump();
          if (target.scope === 'library') {
            navigate(appPath.home);
            return;
          }
          if (target.kbId === kb.id) {
            const docId = moveDocSource?.docId;
            if (docId) navigate(appPath.wikiSpaceDoc(kb.id, docId));
            return;
          }
          navigate(appPath.wikiSpace(target.kbId));
        }}
        onError={msg => toast(`移动失败: ${msg}`)}
      />

      <div style={{ padding: '14px 16px 10px' }}>
        <button
          type="button"
          onClick={() => navigate(appPath.wiki)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: 0,
            color: '#646a73',
            fontSize: 13,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
          </svg>
          <span>云文档</span>
        </button>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 16px 12px',
      }}>
        <span style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: '#ffc9d6',
          color: '#d83989',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 600,
          flexShrink: 0,
        }}>
          {spaceInitial}
        </span>
        <span style={{
          flex: 1,
          fontSize: 15,
          fontWeight: 600,
          color: '#1f2329',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {kb.name}
        </span>
        {onOpenMembers && (
          <button
            type="button"
            title="成员管理"
            onClick={onOpenMembers}
            style={{
              width: 28,
              height: 28,
              border: 'none',
              borderRadius: 6,
              background: 'transparent',
              color: '#646a73',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="9" cy="8" r="3" /><circle cx="16" cy="10" r="2.5" />
              <path d="M4 19c0-3 2.5-5 5-5s5 2 5 5M13 19c0-2.2 1.8-4 4-4" />
            </svg>
          </button>
        )}
      </div>

      <div style={{ padding: '0 12px 12px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 32,
          borderRadius: 16,
          background: '#fff',
          border: '1px solid #e5e6eb',
          padding: '0 12px',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8f959e" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3-3" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 13,
              minWidth: 0,
            }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => onStub('问问知识库')}
        style={{
          margin: '0 12px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: 36,
          border: 'none',
          borderRadius: 8,
          background: 'transparent',
          cursor: 'pointer',
          padding: '0 10px',
          textAlign: 'left',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#ebecef'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #7c5cff, #36cfc9)',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 14, color: '#1f2329' }}>问问知识库</span>
      </button>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 0 16px 8px' }}>
        <SidebarDocumentDirectory
          title="目录"
          emptyText="暂无目录项"
          items={directoryItems}
          activeItemId={activeNodeId}
          menuItemId={menuItemId}
          onToggleSort={() => setSortAsc(v => !v)}
          onItemClick={item => handleNodeClick(item.id)}
          onItemQuickAdd={(id, e) => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            openCreateMenu(id, rect);
          }}
          onItemMore={(id, btn) => openMenu(id, btn)}
          onItemContextMenu={(id, e) => {
            openMenuAt(id, new DOMRect(e.clientX, e.clientY, 0, 0));
          }}
          onItemToggleExpand={id => handleToggleExpand(id)}
          dragEnabled={!isSearching}
          draggingId={draggingId}
          dropTarget={dropTarget}
          onItemDragStart={handleItemDragStart}
          onItemDragEnd={handleItemDragEnd}
          onItemDragOver={handleItemDragOver}
          onItemDragLeave={handleItemDragLeave}
          onItemDrop={handleItemDrop}
          addAction={(
            <CreateDocSidebarTrigger
              title="添加文档"
              context="wikiSpace"
              menuOpen={createDoc.menuOpen}
              menuAnchor={createDoc.menuAnchor}
              onToggle={(anchor) => {
                if (createDoc.menuOpen) closeCreateMenu();
                else openCreateMenu(homeNode?.id ?? null, anchor);
              }}
              onClose={closeCreateMenu}
              onCreate={handlePickDocType}
              onStub={handleSidebarStub}
              onCreateFolder={handleCreateFolder}
              onMigrate={() => {
                closeCreateMenu();
                setImportOpen(true);
              }}
            />
          )}
        />
      </div>

      <SidebarDocContextMenu
        open={!!menuItemId}
        anchorRect={menuAnchor}
        busy={!!busyNodeId}
        onClose={handleMenuClose}
        onAction={handleNodeAction}
      />

      <RenameDocumentModal
        open={renameNode !== null}
        initialTitle={renameNode?.title ?? '未命名'}
        loading={renameNode !== null && busyNodeId === renameNode.id}
        onCancel={() => setRenameNode(null)}
        onSubmit={async (title) => {
          if (!renameNode) return;
          setBusyNodeId(renameNode.id);
          try {
            if (renameNode.docId) {
              await DocumentManager.renameTitle(renameNode.docId, title);
              documentLibraryStore.bump();
            }
            await knowledgeBaseStore.renameNode(kb.id, renameNode.id, title);
            toast('已重命名');
            setRenameNode(null);
          } catch (err) {
            toast(`重命名失败: ${(err as Error).message}`);
          } finally {
            setBusyNodeId(null);
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
