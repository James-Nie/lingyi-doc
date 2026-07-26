import React from 'react';
import { SidebarDocTypeIcon } from './SidebarDocTypeIcon';
import {
  SIDEBAR_ACTIVE_BG,
  SIDEBAR_ACTIVE_COLOR,
  SIDEBAR_HOVER_BG,
  SIDEBAR_TEXT,
} from './sidebarTheme';

export interface SidebarDirectoryItem {
  id: string;
  title: string;
  docType?: string;
  depth?: number;
  hasChildren?: boolean;
  isFolder?: boolean;
  expanded?: boolean;
}

interface SidebarDocRowProps {
  item: SidebarDirectoryItem;
  active: boolean;
  hovered: boolean;
  showActions: boolean;
  draggable?: boolean;
  dragging?: boolean;
  dropIndicator?: 'before' | 'after' | 'inside' | null;
  onNavigate: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onQuickAdd: (e: React.MouseEvent) => void;
  onMore: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggleExpand?: (e: React.MouseEvent) => void;
  showQuickAdd?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export const SidebarDocRow: React.FC<SidebarDocRowProps> = ({
  item,
  active,
  hovered,
  showActions,
  draggable = false,
  dragging = false,
  dropIndicator = null,
  onNavigate,
  onMouseEnter,
  onMouseLeave,
  onQuickAdd,
  onMore,
  onContextMenu,
  onToggleExpand,
  showQuickAdd = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}) => {
  const bg = dropIndicator === 'inside'
    ? 'rgba(51, 112, 255, 0.1)'
    : active
      ? SIDEBAR_ACTIVE_BG
      : hovered
        ? SIDEBAR_HOVER_BG
        : 'transparent';
  const color = active ? SIDEBAR_ACTIVE_COLOR : SIDEBAR_TEXT;
  const depth = item.depth ?? 0;
  const indent = 10 + depth * 14;
  const dropShadow = dropIndicator === 'before'
    ? 'inset 0 2px 0 #3370ff'
    : dropIndicator === 'after'
      ? 'inset 0 -2px 0 #3370ff'
      : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onNavigate}
      onKeyDown={e => { if (e.key === 'Enter') onNavigate(); }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onContextMenu={onContextMenu}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: `5px 10px 5px ${indent}px`,
        marginBottom: 1,
        borderRadius: active ? '6px 0 0 6px' : 6,
        background: bg,
        color,
        cursor: draggable ? 'grab' : 'pointer',
        fontSize: 13,
        position: 'relative',
        minHeight: 32,
        opacity: dragging ? 0.45 : 1,
        outline: dropIndicator === 'inside' ? '1px solid rgba(51, 112, 255, 0.45)' : undefined,
        boxShadow: dropShadow,
        transition: 'background 0.12s ease, color 0.12s ease',
      }}
    >
      {active && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 4,
            right: 0,
            bottom: 4,
            width: 3,
            borderRadius: '2px 0 0 2px',
            background: SIDEBAR_ACTIVE_COLOR,
          }}
        />
      )}
      {item.isFolder ? (
        <button
          type="button"
          title={item.expanded ? '收起' : '展开'}
          onClick={e => {
            e.stopPropagation();
            onToggleExpand?.(e);
          }}
          style={{
            width: 18,
            height: 18,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: 0,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#8f959e',
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
              transform: item.expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s',
              opacity: item.hasChildren ? 1 : 0.3,
            }}
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      ) : (
        <span style={{ width: 18, flexShrink: 0 }} />
      )}
      <SidebarDocTypeIcon docType={item.docType} active={active} />
      <span style={{
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontWeight: active ? 500 : 400,
      }}>
        {item.title || '未命名文档'}
      </span>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          opacity: showActions ? 1 : 0,
          pointerEvents: showActions ? 'auto' : 'none',
          transition: 'opacity 0.12s ease',
          flexShrink: 0,
        }}
        onClick={e => e.stopPropagation()}
      >
        {showQuickAdd && (
          <RowActionBtn title="添加" onClick={onQuickAdd}>+</RowActionBtn>
        )}
        <RowActionBtn title="更多" onClick={onMore}>···</RowActionBtn>
      </div>
    </div>
  );
};

function RowActionBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: 22,
        height: 22,
        border: 'none',
        borderRadius: 4,
        background: 'rgba(255,255,255,0.85)',
        cursor: 'pointer',
        color: '#646a73',
        fontSize: 14,
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.04)',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#fff'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.85)'; }}
    >
      {children}
    </button>
  );
}
