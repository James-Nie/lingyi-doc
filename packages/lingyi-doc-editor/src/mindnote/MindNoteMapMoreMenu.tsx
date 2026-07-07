import React, { useEffect, useRef } from 'react';
import { isMacPlatform } from '../components/Toolbar/Tooltip';

export type MindNoteMapMoreAction =
  | 'sibling'
  | 'child'
  | 'parent'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'collapse'
  | 'enterNode';

interface MenuGroup {
  items: { action: MindNoteMapMoreAction; label: string; shortcut?: string }[];
}

const GROUPS: MenuGroup[] = [
  {
    items: [
      { action: 'sibling', label: '插入同级节点', shortcut: 'Enter' },
      { action: 'child', label: '插入子节点', shortcut: 'Tab' },
      { action: 'parent', label: '插入父节点', shortcut: '⇧ Tab' },
    ],
  },
  {
    items: [
      { action: 'copy', label: '复制', shortcut: isMacPlatform() ? '⌘ C' : 'Ctrl+C' },
      { action: 'cut', label: '剪切', shortcut: isMacPlatform() ? '⌘ X' : 'Ctrl+X' },
      { action: 'paste', label: '粘贴', shortcut: isMacPlatform() ? '⌘ V' : 'Ctrl+V' },
      { action: 'duplicate', label: '创建副本', shortcut: isMacPlatform() ? '⌘ D' : 'Ctrl+D' },
      { action: 'delete', label: '删除', shortcut: 'Delete' },
    ],
  },
  {
    items: [
      { action: 'collapse', label: '折叠子节点', shortcut: isMacPlatform() ? '⌘ .' : 'Ctrl+.' },
      { action: 'enterNode', label: '进入当前节点', shortcut: isMacPlatform() ? '⌘ ]' : 'Ctrl+]' },
    ],
  },
];

interface MindNoteMapMoreMenuProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  onAction: (action: MindNoteMapMoreAction) => void;
  onClose: () => void;
}

export const MindNoteMapMoreMenu: React.FC<MindNoteMapMoreMenuProps> = ({
  anchorRef,
  onAction,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ left: 0, bottom: 0 });

  useEffect(() => {
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    const rect = anchor.getBoundingClientRect();
    const menuW = menu.offsetWidth || 240;
    let left = rect.left + rect.width / 2 - menuW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
    setPos({ left, bottom: window.innerHeight - rect.top + 8 });
  }, [anchorRef]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [anchorRef, onClose]);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: pos.left,
        bottom: pos.bottom,
        zIndex: 1200,
        background: 'rgba(31,35,41,0.96)',
        borderRadius: 8,
        padding: '6px 0',
        minWidth: 240,
        boxShadow: '0 8px 24px rgba(0,0,0,0.24)',
      }}
    >
      {GROUPS.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && (
            <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
          )}
          {group.items.map(item => (
            <button
              key={item.action}
              type="button"
              onClick={() => { onAction(item.action); onClose(); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 14px',
                border: 'none',
                background: 'transparent',
                color: '#fff',
                fontSize: 13,
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span>{item.label}</span>
              {item.shortcut && (
                <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginLeft: 16 }}>
                  {item.shortcut}
                </span>
              )}
            </button>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
};
