import React from 'react';
import { SidebarDocRow, type SidebarDirectoryItem } from './SidebarDocRow';
import { SidebarIconBtn } from './SidebarIconBtn';
import { SIDEBAR_MUTED } from './sidebarTheme';
import type { KbDropTarget } from '../../../utils/kbDirectoryDnD';

interface SidebarDirectorySectionProps {
  title: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleSort: () => void;
  emptyText?: string;
  items: SidebarDirectoryItem[];
  activeItemId?: string | null;
  hoveredItemId?: string | null;
  menuItemId?: string | null;
  onItemClick: (item: SidebarDirectoryItem) => void;
  onItemMouseEnter: (id: string) => void;
  onItemMouseLeave: (id: string) => void;
  onItemQuickAdd: (id: string, e: React.MouseEvent) => void;
  onItemMore: (id: string, btn: HTMLButtonElement) => void;
  onItemContextMenu: (id: string, e: React.MouseEvent) => void;
  onItemToggleExpand?: (id: string, e: React.MouseEvent) => void;
  addAction?: React.ReactNode;
  dragEnabled?: boolean;
  draggingId?: string | null;
  dropTarget?: KbDropTarget | null;
  onItemDragStart?: (id: string, e: React.DragEvent) => void;
  onItemDragEnd?: () => void;
  onItemDragOver?: (id: string, e: React.DragEvent) => void;
  onItemDragLeave?: (id: string, e: React.DragEvent) => void;
  onItemDrop?: (id: string, e: React.DragEvent) => void;
}

export const SidebarDirectorySection: React.FC<SidebarDirectorySectionProps> = ({
  title,
  expanded,
  onToggleExpanded,
  onToggleSort,
  emptyText = '暂无文档',
  items,
  activeItemId,
  hoveredItemId,
  menuItemId,
  onItemClick,
  onItemMouseEnter,
  onItemMouseLeave,
  onItemQuickAdd,
  onItemMore,
  onItemContextMenu,
  onItemToggleExpand,
  addAction,
  dragEnabled = false,
  draggingId = null,
  dropTarget = null,
  onItemDragStart,
  onItemDragEnd,
  onItemDragOver,
  onItemDragLeave,
  onItemDrop,
}) => (
  <div style={{ marginBottom: 4 }}>
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      padding: '4px 6px',
      fontSize: 13,
      color: '#646a73',
    }}>
      <button
        type="button"
        onClick={onToggleExpanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flex: 1,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          padding: '4px 2px',
          color: '#646a73',
          fontSize: 13,
          textAlign: 'left',
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
          }}
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span style={{ fontWeight: 500 }}>{title}</span>
      </button>
      {addAction}
      <SidebarIconBtn title="排序" onClick={onToggleSort}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h12M4 12h8M4 18h4" />
        </svg>
      </SidebarIconBtn>
    </div>

    {expanded && (
      <div style={{ paddingLeft: 2 }}>
        {items.length === 0 ? (
          <div style={{ padding: '8px 10px', fontSize: 12, color: SIDEBAR_MUTED }}>{emptyText}</div>
        ) : items.map(item => {
          const isActive = activeItemId === item.id;
          const isHovered = hoveredItemId === item.id || menuItemId === item.id;

          return (
            <SidebarDocRow
              key={item.id}
              item={item}
              active={isActive}
              hovered={isHovered}
              showActions={isHovered}
              draggable={dragEnabled}
              dragging={draggingId === item.id}
              dropIndicator={
                dropTarget?.nodeId === item.id
                  ? dropTarget.position
                  : null
              }
              onNavigate={() => onItemClick(item)}
              onMouseEnter={() => onItemMouseEnter(item.id)}
              onMouseLeave={() => onItemMouseLeave(item.id)}
              onQuickAdd={e => onItemQuickAdd(item.id, e)}
              onMore={e => {
                e.stopPropagation();
                onItemMore(item.id, e.currentTarget);
              }}
              onContextMenu={e => {
                e.preventDefault();
                e.stopPropagation();
                onItemContextMenu(item.id, e);
              }}
              onToggleExpand={e => onItemToggleExpand?.(item.id, e)}
              showQuickAdd={item.isFolder || item.docType === 'page'}
              onDragStart={e => onItemDragStart?.(item.id, e)}
              onDragEnd={() => onItemDragEnd?.()}
              onDragOver={e => onItemDragOver?.(item.id, e)}
              onDragLeave={e => onItemDragLeave?.(item.id, e)}
              onDrop={e => onItemDrop?.(item.id, e)}
            />
          );
        })}
      </div>
    )}
  </div>
);
