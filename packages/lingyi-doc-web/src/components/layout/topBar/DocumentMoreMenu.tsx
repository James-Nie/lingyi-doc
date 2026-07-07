import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { renderDownloadSubmenu } from '../../../utils/downloadAs';
import { TOP_BAR_DANGER, TOP_BAR_HOVER, TOP_BAR_MUTED, TOP_BAR_TEXT } from './styles';

export type DocumentMoreMenuAction =
  | 'followUpdates'
  | 'addShortcut'
  | 'moveTo'
  | 'pin'
  | 'favorite'
  | 'convertTemplate'
  | 'duplicate'
  | 'downloadAs'
  | 'translate'
  | 'print'
  | 'saveVersion'
  | 'permissions'
  | 'docInfo'
  | 'mentions'
  | 'history'
  | 'commentHistory'
  | 'more'
  | 'delete';

export interface DocumentMoreSubMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  group?: string;
}

export interface DocumentMoreMenuItem {
  key: DocumentMoreMenuAction | string;
  label: string;
  icon?: React.ReactNode;
  type?: 'action' | 'toggle' | 'submenu';
  checked?: boolean;
  danger?: boolean;
  dividerBefore?: boolean;
  disabled?: boolean;
  submenu?: DocumentMoreSubMenuItem[];
}

export const DEFAULT_DOCUMENT_MORE_ITEMS: DocumentMoreMenuItem[] = [
  { key: 'moveTo', label: '移动到', type: 'action' },
  { key: 'convertTemplate', label: '转换为模板', type: 'toggle', checked: false, dividerBefore: true },
  { key: 'duplicate', label: '创建副本', type: 'action' },
  { key: 'downloadAs', label: '下载为', type: 'submenu' },
  { key: 'print', label: '打印', type: 'action', dividerBefore: true },
  { key: 'saveVersion', label: '另存为版本', type: 'action' },
  { key: 'permissions', label: '文档权限', type: 'submenu', dividerBefore: true },
  { key: 'docInfo', label: '文档信息', type: 'action', dividerBefore: true },
  { key: 'history', label: '历史记录', type: 'action' },
  { key: 'commentHistory', label: '历史评论', type: 'action' },
  { key: 'delete', label: '删除', type: 'action', danger: true },
];

interface DocumentMoreMenuProps {
  open: boolean;
  anchorRect: DOMRect | null;
  items?: DocumentMoreMenuItem[];
  onClose: () => void;
  onAction: (key: string) => void;
}

export const DocumentMoreMenu: React.FC<DocumentMoreMenuProps> = ({
  open,
  anchorRect,
  items = DEFAULT_DOCUMENT_MORE_ITEMS,
  onClose,
  onAction,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [submenuPos, setSubmenuPos] = useState<{ top: number; left: number } | null>(null);
  const [activeSubmenuKey, setActiveSubmenuKey] = useState<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const activeSubmenu = items.find(item => item.key === activeSubmenuKey)?.submenu;

  const clearCloseTimer = () => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleCloseSubmenu = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setActiveSubmenuKey(null);
      setSubmenuPos(null);
    }, 120);
  };

  useLayoutEffect(() => {
    if (!open || !anchorRect || !menuRef.current) {
      setPos(null);
      return;
    }
    const menu = menuRef.current;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    let left = anchorRect.right - width;
    let top = anchorRect.bottom + 6;
    if (left < 8) left = 8;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (top + height > window.innerHeight - 8) top = anchorRect.top - height - 6;
    setPos({ top, left });
  }, [open, anchorRect, items]);

  useLayoutEffect(() => {
    if (!activeSubmenuKey || !menuRef.current) {
      setSubmenuPos(null);
      return;
    }
    const row = menuRef.current.querySelector<HTMLElement>(`[data-menu-key="${activeSubmenuKey}"]`);
    if (!row) return;

    const rowRect = row.getBoundingClientRect();
    const submenuWidth = submenuRef.current?.offsetWidth ?? 240;
    let left = rowRect.right + 4;
    let top = rowRect.top - 4;

    if (left + submenuWidth > window.innerWidth - 8) {
      left = rowRect.left - submenuWidth - 4;
    }
    if (top + 280 > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - 280 - 8);
    }

    setSubmenuPos({ top, left });
  }, [activeSubmenuKey, activeSubmenu, pos]);

  useEffect(() => {
    if (!open) {
      setActiveSubmenuKey(null);
      setSubmenuPos(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (submenuRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || !anchorRect) return null;

  return createPortal(
    <>
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          top: pos?.top ?? anchorRect.bottom + 6,
          left: pos?.left ?? anchorRect.right - 260,
          width: 260,
          maxHeight: 'min(70vh, 560px)',
          overflowY: 'auto',
          background: '#fff',
          border: '1px solid #dee0e3',
          borderRadius: 8,
          boxShadow: '0 8px 28px rgba(31, 35, 41, 0.12)',
          padding: '6px 0',
          zIndex: 10000,
        }}
      >
        {items.map(item => {
          const isSubmenu = item.type === 'submenu' && !!item.submenu?.length;
          const isActive = activeSubmenuKey === item.key;
          return (
            <React.Fragment key={item.key}>
              {item.dividerBefore && <div style={{ height: 1, background: '#ebebeb', margin: '4px 0' }} />}
              <button
                type="button"
                data-menu-key={item.key}
                disabled={item.disabled}
                onClick={() => {
                  if (item.type === 'toggle') onAction(item.key);
                  else if (!isSubmenu) onAction(item.key);
                }}
                onMouseEnter={e => {
                  clearCloseTimer();
                  if (isSubmenu) {
                    setActiveSubmenuKey(String(item.key));
                  } else {
                    setActiveSubmenuKey(null);
                  }
                  if (!item.disabled) {
                    e.currentTarget.style.background = item.danger ? '#fff1f0' : TOP_BAR_HOVER;
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = isActive && isSubmenu ? TOP_BAR_HOVER : 'transparent';
                  if (isSubmenu) scheduleCloseSubmenu();
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 14px',
                  border: 'none',
                  background: isActive && isSubmenu ? TOP_BAR_HOVER : 'transparent',
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  color: item.danger ? TOP_BAR_DANGER : TOP_BAR_TEXT,
                  textAlign: 'left',
                  opacity: item.disabled ? 0.5 : 1,
                }}
              >
                {item.icon ? (
                  <span style={{ width: 18, display: 'inline-flex', justifyContent: 'center', color: item.danger ? TOP_BAR_DANGER : TOP_BAR_MUTED }}>
                    {item.icon}
                  </span>
                ) : (
                  <span style={{ width: 18 }} />
                )}
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.type === 'toggle' && <Toggle checked={!!item.checked} />}
                {isSubmenu && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {activeSubmenu?.length && submenuPos && (
        <div
          ref={submenuRef}
          style={{
            position: 'fixed',
            top: submenuPos.top,
            left: submenuPos.left,
            zIndex: 10001,
          }}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleCloseSubmenu}
        >
          {renderDownloadSubmenu(activeSubmenu, key => {
            onAction(key);
            onClose();
          })}
        </div>
      )}
    </>,
    document.body,
  );
};

function Toggle({ checked }: { checked: boolean }) {
  return (
    <span style={{
      width: 32,
      height: 18,
      borderRadius: 9,
      background: checked ? '#3370ff' : '#c9cdd4',
      position: 'relative',
      flexShrink: 0,
    }}>
      <span style={{
        position: 'absolute',
        top: 2,
        left: checked ? 16 : 2,
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.15s ease',
      }} />
    </span>
  );
}
