import React from 'react';

interface MindNoteContextMenuProps {
  x: number;
  y: number;
  onAction: (action: MindNoteMenuAction) => void;
  onClose: () => void;
}

export type MindNoteMenuAction =
  | 'sibling'
  | 'child'
  | 'parent'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'expand'
  | 'comment';

const ITEMS: { action: MindNoteMenuAction; label: string; shortcut?: string }[] = [
  { action: 'sibling', label: '插入同级节点', shortcut: 'Enter' },
  { action: 'child', label: '插入子节点', shortcut: 'Tab' },
  { action: 'parent', label: '插入父节点', shortcut: '⇧ Tab' },
  { action: 'copy', label: '复制', shortcut: '⌘ C' },
  { action: 'cut', label: '剪切', shortcut: '⌘ X' },
  { action: 'paste', label: '粘贴', shortcut: '⌘ V' },
  { action: 'duplicate', label: '创建副本', shortcut: '⌘ D' },
  { action: 'delete', label: '删除', shortcut: 'Delete' },
  { action: 'expand', label: '展开子节点', shortcut: '⌘ .' },
  { action: 'comment', label: '添加评论', shortcut: '⌘ ⌥ M' },
];

export const MindNoteContextMenu: React.FC<MindNoteContextMenuProps> = ({
  x,
  y,
  onAction,
  onClose,
}) => {
  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 999 }}
        onClick={onClose}
        onContextMenu={e => { e.preventDefault(); onClose(); }}
      />
      <div style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 1000,
        background: 'rgba(31,35,41,0.94)',
        borderRadius: 8,
        padding: '6px 0',
        minWidth: 220,
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
      }}>
        {ITEMS.map(item => (
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
      </div>
    </>
  );
};
