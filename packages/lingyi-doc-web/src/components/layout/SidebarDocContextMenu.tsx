import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const VIEWPORT_PAD = 8;
const MENU_MIN_WIDTH = 220;

export type SidebarDocAction =
  | 'openNewTab'
  | 'share'
  | 'copyLink'
  | 'duplicate'
  | 'moveTo'
  | 'addShortcut'
  | 'pin'
  | 'favorite'
  | 'transfer'
  | 'rename'
  | 'delete';

interface MenuItem {
  action: SidebarDocAction;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  dividerBefore?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  { action: 'openNewTab', label: '在新标签页打开', icon: <TabIcon /> },
  { action: 'share', label: '分享', icon: <ShareIcon />, dividerBefore: true },
  { action: 'copyLink', label: '复制链接', icon: <LinkIcon /> },
  { action: 'duplicate', label: '创建副本', icon: <CopyIcon />, dividerBefore: true },
  { action: 'moveTo', label: '移动到', icon: <MoveIcon /> },
  { action: 'transfer', label: '转移所有权', icon: <TransferIcon /> },
  { action: 'rename', label: '重命名', icon: <RenameIcon />, dividerBefore: true },
  { action: 'delete', label: '删除', icon: <DeleteIcon />, danger: true, dividerBefore: true },
];

interface SidebarDocContextMenuProps {
  open: boolean;
  anchorRect: DOMRect | null;
  busy?: boolean;
  onClose: () => void;
  onAction: (action: SidebarDocAction) => void;
}

export const SidebarDocContextMenu: React.FC<SidebarDocContextMenuProps> = ({
  open,
  anchorRect,
  busy,
  onClose,
  onAction,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRect || !menuRef.current) {
      setMenuStyle(null);
      return;
    }

    const menu = menuRef.current;
    const menuHeight = menu.offsetHeight;
    const menuWidth = menu.offsetWidth;

    let left = anchorRect.right + 4;
    if (left + menuWidth > window.innerWidth - VIEWPORT_PAD) {
      left = anchorRect.left - menuWidth - 4;
    }
    left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - menuWidth - VIEWPORT_PAD));

    const maxHeight = window.innerHeight - VIEWPORT_PAD * 2;
    let top = anchorRect.top;
    const spaceBelow = window.innerHeight - VIEWPORT_PAD - top;
    const spaceAbove = anchorRect.bottom - VIEWPORT_PAD;

    if (menuHeight > spaceBelow && spaceAbove >= spaceBelow) {
      top = anchorRect.bottom - menuHeight;
    }
    if (top + menuHeight > window.innerHeight - VIEWPORT_PAD) {
      top = window.innerHeight - VIEWPORT_PAD - Math.min(menuHeight, maxHeight);
    }
    top = Math.max(VIEWPORT_PAD, top);

    setMenuStyle({ top, left, maxHeight });
  }, [open, anchorRect]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, onClose]);

  if (!open || !anchorRect) return null;

  const fallbackLeft = Math.min(
    anchorRect.right + 4,
    typeof window !== 'undefined' ? window.innerWidth - MENU_MIN_WIDTH - VIEWPORT_PAD : anchorRect.right + 4,
  );

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: menuStyle?.top ?? anchorRect.top,
        left: menuStyle?.left ?? fallbackLeft,
        minWidth: MENU_MIN_WIDTH,
        maxHeight: menuStyle?.maxHeight,
        overflowY: 'auto',
        background: '#fff',
        border: '1px solid #dee0e3',
        borderRadius: 8,
        boxShadow: '0 6px 24px rgba(31, 35, 41, 0.12)',
        padding: '6px 0',
        zIndex: 10000,
        visibility: menuStyle ? 'visible' : 'hidden',
      }}
      onClick={e => e.stopPropagation()}
    >
      {MENU_ITEMS.map(item => (
        <React.Fragment key={item.action}>
          {item.dividerBefore && (
            <div style={{ height: 1, background: '#ebebeb', margin: '4px 0' }} />
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(item.action)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '8px 14px',
              border: 'none',
              background: 'transparent',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: 14,
              color: item.danger ? '#f54a45' : '#1f2329',
              textAlign: 'left',
              opacity: busy ? 0.6 : 1,
            }}
            onMouseEnter={e => {
              if (!busy) e.currentTarget.style.background = item.danger ? '#fff1f0' : '#f5f6f7';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span style={{
              width: 18, height: 18, display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center', color: item.danger ? '#f54a45' : '#646a73', flexShrink: 0,
            }}>
              {item.icon}
            </span>
            {item.label}
          </button>
        </React.Fragment>
      ))}
    </div>,
    document.body,
  );
};

function TabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 6h12" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="4" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 7l4-2M6 9l4 2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6.2 9.8a3 3 0 0 0 4.24 0l2.12-2.12a3 3 0 1 0-4.24-4.24L7.7 4.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M9.8 6.2a3 3 0 0 0-4.24 0L3.44 8.32a3 3 0 1 0 4.24 4.24l.34-.34" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="5" y="5" width="8" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 11V3.8A.8.8 0 0 1 4.8 3H11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function MoveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2v12M8 2l-2.5 2.5M8 2l2.5 2.5M8 14l-2.5-2.5M8 14l2.5-2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function ShortcutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M8 3v10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2l1.5 4.5H14l-3.5 2.5 1.5 4.5L8 11l-4 2.5 1.5-4.5L2 6.5h4.5L8 2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2.5l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4L2.2 6.7l4-.6L8 2.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

function TransferIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.5 13.5c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M12 5.5l1.5 1.5M13.5 5.5L12 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function RenameIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M11.5 2.5l2 2L6 12H4v-2l7.5-7.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3.5 4.5h9M6 4.5V3.8a.8.8 0 0 1 .8-.8h2.4a.8.8 0 0 1 .8.8V4.5M6.5 7v4M9.5 7v4M4.5 4.5l.5 8.2a.8.8 0 0 0 .8.8h4.4a.8.8 0 0 0 .8-.8l.5-8.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
