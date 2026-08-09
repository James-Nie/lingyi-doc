import React, { useState } from 'react';
import { SidebarDirectorySection } from './SidebarDirectorySection';
import type { SidebarDirectoryItem } from './SidebarDocRow';
import type { KbDropTarget } from '../../../utils/kbDirectoryDnD';

export type { SidebarDirectoryItem };

export interface SidebarDocumentDirectoryProps {
  title: string;
  emptyText?: string;
  items: SidebarDirectoryItem[];
  activeItemId?: string | null;
  menuItemId?: string | null;
  addAction?: React.ReactNode;
  onToggleSort: () => void;
  onItemClick: (item: SidebarDirectoryItem) => void;
  onItemQuickAdd?: (id: string, e: React.MouseEvent) => void;
  onItemMore: (id: string, btn: HTMLButtonElement) => void;
  onItemContextMenu: (id: string, e: React.MouseEvent) => void;
  onItemToggleExpand?: (id: string, e: React.MouseEvent) => void;
  /** 可选：知识库目录拖拽 */
  dragEnabled?: boolean;
  draggingId?: string | null;
  dropTarget?: KbDropTarget | null;
  onItemDragStart?: (id: string, e: React.DragEvent) => void;
  onItemDragEnd?: () => void;
  onItemDragOver?: (id: string, e: React.DragEvent) => void;
  onItemDragLeave?: (id: string, e: React.DragEvent) => void;
  onItemDrop?: (id: string, e: React.DragEvent) => void;
  /** 受控展开（不传则组件内部管理） */
  expanded?: boolean;
  onToggleExpanded?: () => void;
  defaultExpanded?: boolean;
}

/**
 * 侧栏文档目录列表（知识库目录 / 我的文档库共用）。
 * 统一选中、悬停、右键与行操作样式。
 */
export const SidebarDocumentDirectory: React.FC<SidebarDocumentDirectoryProps> = ({
  title,
  emptyText = '暂无文档',
  items,
  activeItemId,
  menuItemId,
  addAction,
  onToggleSort,
  onItemClick,
  onItemQuickAdd,
  onItemMore,
  onItemContextMenu,
  onItemToggleExpand,
  dragEnabled = false,
  draggingId = null,
  dropTarget = null,
  onItemDragStart,
  onItemDragEnd,
  onItemDragOver,
  onItemDragLeave,
  onItemDrop,
  expanded: controlledExpanded,
  onToggleExpanded,
  defaultExpanded = true,
}) => {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(defaultExpanded);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  const expanded = controlledExpanded ?? uncontrolledExpanded;
  const toggleExpanded = onToggleExpanded
    ?? (() => setUncontrolledExpanded(v => !v));

  return (
    <SidebarDirectorySection
      title={title}
      expanded={expanded}
      onToggleExpanded={toggleExpanded}
      onToggleSort={onToggleSort}
      emptyText={emptyText}
      items={items}
      activeItemId={activeItemId}
      hoveredItemId={hoveredItemId}
      menuItemId={menuItemId}
      onItemClick={onItemClick}
      onItemMouseEnter={setHoveredItemId}
      onItemMouseLeave={id => {
        if (menuItemId !== id) setHoveredItemId(null);
      }}
      onItemQuickAdd={(id, e) => onItemQuickAdd?.(id, e)}
      onItemMore={onItemMore}
      onItemContextMenu={onItemContextMenu}
      onItemToggleExpand={onItemToggleExpand}
      addAction={addAction}
      dragEnabled={dragEnabled}
      draggingId={draggingId}
      dropTarget={dropTarget}
      onItemDragStart={onItemDragStart}
      onItemDragEnd={onItemDragEnd}
      onItemDragOver={onItemDragOver}
      onItemDragLeave={onItemDragLeave}
      onItemDrop={onItemDrop}
    />
  );
};
