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
}

interface SidebarDocRowProps {
  item: SidebarDirectoryItem;
  active: boolean;
  hovered: boolean;
  showActions: boolean;
  onNavigate: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onQuickAdd: (e: React.MouseEvent) => void;
  onMore: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export const SidebarDocRow: React.FC<SidebarDocRowProps> = ({
  item,
  active,
  hovered,
  showActions,
  onNavigate,
  onMouseEnter,
  onMouseLeave,
  onQuickAdd,
  onMore,
  onContextMenu,
}) => {
  const bg = active ? SIDEBAR_ACTIVE_BG : hovered ? SIDEBAR_HOVER_BG : 'transparent';
  const color = active ? SIDEBAR_ACTIVE_COLOR : SIDEBAR_TEXT;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onNavigate}
      onKeyDown={e => { if (e.key === 'Enter') onNavigate(); }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onContextMenu={onContextMenu}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 8px 5px 10px',
        marginBottom: 1,
        borderRadius: active ? '6px 0 0 6px' : 6,
        background: bg,
        color,
        cursor: 'pointer',
        fontSize: 13,
        position: 'relative',
        minHeight: 32,
      }}
    >
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
