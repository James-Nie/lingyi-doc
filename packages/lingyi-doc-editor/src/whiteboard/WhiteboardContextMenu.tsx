import React, { useEffect, useRef, useState } from 'react';
import { WB_COLORS, WB_PANEL, WB_Z_INDEX } from './styles';
import type { ZOrderAction } from './elementActions';

export type WhiteboardContextMenuAction =
  | 'copy'
  | 'copyImage'
  | 'paste'
  | 'duplicate'
  | 'layer'
  | 'copyStyle'
  | 'pasteStyle'
  | 'flipH'
  | 'flipV'
  | 'rotate'
  | 'lock'
  | 'delete';

interface WhiteboardContextMenuProps {
  x: number;
  y: number;
  showTransform?: boolean;
  showStyle?: boolean;
  canPaste?: boolean;
  canPasteStyle?: boolean;
  isLocked?: boolean;
  onLayerAction?: (action: ZOrderAction) => void;
  onAction: (action: WhiteboardContextMenuAction) => void;
  onClose: () => void;
}

const MOD = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl';

const LAYER_ITEMS: { action: ZOrderAction; label: string }[] = [
  { action: 'front', label: '置于顶层' },
  { action: 'forward', label: '上移一层' },
  { action: 'backward', label: '下移一层' },
  { action: 'back', label: '置于底层' },
];

export const WhiteboardContextMenu: React.FC<WhiteboardContextMenuProps> = ({
  x,
  y,
  showTransform = true,
  showStyle = true,
  canPaste = false,
  canPasteStyle = false,
  isLocked = false,
  onLayerAction,
  onAction,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [layerOpen, setLayerOpen] = useState(false);

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = x + rect.width > window.innerWidth ? Math.max(8, x - rect.width) : x;
    const ny = y + rect.height > window.innerHeight ? Math.max(8, y - rect.height) : y;
    setPos({ x: nx, y: ny });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: WB_Z_INDEX.contextMenuBackdrop }}
        onClick={onClose}
        onContextMenu={e => { e.preventDefault(); onClose(); }}
      />
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          zIndex: WB_Z_INDEX.contextMenu,
          minWidth: 220,
          background: WB_PANEL.bg,
          borderRadius: WB_PANEL.radius,
          border: WB_PANEL.border,
          boxShadow: WB_PANEL.shadow,
          padding: '6px 0',
        }}
        onContextMenu={e => e.preventDefault()}
      >
        <MenuItem label="复制" shortcut={`${MOD} + C`} onClick={() => onAction('copy')} />
        <MenuItem label="复制为图片" shortcut={`${MOD} + Shift + C`} onClick={() => onAction('copyImage')} />
        <MenuItem label="粘贴" shortcut={`${MOD} + V`} disabled={!canPaste} onClick={() => onAction('paste')} />
        <MenuItem label="创建副本" shortcut={`${MOD} + D`} onClick={() => onAction('duplicate')} />

        <Divider />

        <div
          style={{ position: 'relative' }}
          onMouseEnter={() => setLayerOpen(true)}
          onMouseLeave={() => setLayerOpen(false)}
        >
          <MenuItem label="层级" arrow onClick={() => setLayerOpen(v => !v)} />
          {layerOpen && (
            <div style={{
              position: 'absolute',
              left: '100%',
              top: 0,
              marginLeft: 4,
              minWidth: 140,
              background: WB_PANEL.bg,
              borderRadius: WB_PANEL.radius,
              border: WB_PANEL.border,
              boxShadow: WB_PANEL.shadow,
              padding: '6px 0',
            }}>
              {LAYER_ITEMS.map(item => (
                <MenuItem
                  key={item.action}
                  label={item.label}
                  onClick={() => {
                    onLayerAction?.(item.action);
                    onClose();
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {showStyle && (
          <>
            <Divider />
            <MenuItem label="复制样式" shortcut={`${MOD} + ⌥ + C`} onClick={() => onAction('copyStyle')} />
            <MenuItem
              label="粘贴样式"
              shortcut={`${MOD} + ⌥ + V`}
              disabled={!canPasteStyle}
              onClick={() => onAction('pasteStyle')}
            />
          </>
        )}

        {showTransform && (
          <>
            <Divider />
            <MenuItem label="水平翻转" shortcut="Shift + H" onClick={() => onAction('flipH')} />
            <MenuItem label="垂直翻转" shortcut="Shift + V" onClick={() => onAction('flipV')} />
            <MenuItem label="旋转" onClick={() => onAction('rotate')} />
          </>
        )}

        <Divider />
        <MenuItem
          label={isLocked ? '解锁' : '锁定'}
          shortcut={`${MOD} + ⌥ + L`}
          onClick={() => onAction('lock')}
        />
        <MenuItem
          label="删除"
          shortcut="⌫"
          danger
          onClick={() => onAction('delete')}
        />
      </div>
    </>
  );
};

function Divider() {
  return <div style={{ height: 1, background: WB_COLORS.border, margin: '4px 0' }} />;
}

function MenuItem({
  label,
  shortcut,
  arrow,
  disabled,
  danger,
  onClick,
}: {
  label: string;
  shortcut?: string;
  arrow?: boolean;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => { if (!disabled) onClick?.(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '8px 14px',
        border: 'none',
        background: hover && !disabled ? '#f5f6f7' : 'transparent',
        color: disabled ? WB_COLORS.muted : danger ? '#f54a45' : WB_COLORS.text,
        fontSize: 14,
        cursor: disabled ? 'default' : 'pointer',
        textAlign: 'left',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <span>{label}</span>
      {arrow ? (
        <span style={{ color: WB_COLORS.muted, fontSize: 12 }}>›</span>
      ) : shortcut ? (
        <span style={{ color: WB_COLORS.muted, fontSize: 12, whiteSpace: 'nowrap' }}>{shortcut}</span>
      ) : null}
    </button>
  );
}
