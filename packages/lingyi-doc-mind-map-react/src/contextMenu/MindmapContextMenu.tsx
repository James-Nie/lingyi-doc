import React, { useEffect, useRef, useState } from 'react';
import type { MindmapContextMenuEntry, MindmapContextMenuItemDef } from './types';

const PANEL = {
  bg: '#ffffff',
  shadow: '0 8px 28px rgba(31, 35, 41, 0.12)',
  radius: 10,
  border: '1px solid #dee0e3',
} as const;

const COLORS = {
  border: '#dee0e3',
  text: '#1f2329',
  muted: '#8f959e',
  danger: '#f54a45',
  hover: '#f5f6f7',
} as const;

export interface MindmapContextMenuProps {
  x: number;
  y: number;
  entries: MindmapContextMenuEntry[];
  onAction: (actionId: string) => void;
  onClose: () => void;
}

export const MindmapContextMenu: React.FC<MindmapContextMenuProps> = ({
  x,
  y,
  entries,
  onAction,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = x + rect.width > window.innerWidth ? Math.max(8, x - rect.width) : x;
    const ny = y + rect.height > window.innerHeight ? Math.max(8, y - rect.height) : y;
    setPos({ x: nx, y: ny });
  }, [x, y, entries]);

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
        style={{ position: 'fixed', inset: 0, zIndex: 10190 }}
        onClick={onClose}
        onContextMenu={e => { e.preventDefault(); onClose(); }}
      />
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          zIndex: 10200,
          minWidth: 220,
          background: PANEL.bg,
          borderRadius: PANEL.radius,
          border: PANEL.border,
          boxShadow: PANEL.shadow,
          padding: '6px 0',
        }}
        onContextMenu={e => e.preventDefault()}
      >
        {entries.map((entry, i) => {
          if (entry.type === 'separator') {
            return <Divider key={entry.id ?? `sep-${i}`} />;
          }
          return (
            <MenuRow
              key={entry.id}
              item={entry}
              onAction={id => {
                onAction(id);
                onClose();
              }}
            />
          );
        })}
      </div>
    </>
  );
};

function Divider() {
  return <div style={{ height: 1, background: COLORS.border, margin: '4px 0' }} />;
}

function MenuRow({
  item,
  onAction,
}: {
  item: MindmapContextMenuItemDef;
  onAction: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const hasChildren = !!(item.children && item.children.length);

  if (hasChildren) {
    return (
      <div
        style={{ position: 'relative' }}
        onMouseEnter={() => setSubOpen(true)}
        onMouseLeave={() => setSubOpen(false)}
      >
        <MenuItem
          label={item.label}
          arrow
          disabled={item.disabled}
          danger={item.danger}
          hover={hover || subOpen}
          onHover={setHover}
          onClick={() => setSubOpen(v => !v)}
        />
        {subOpen && (
          <div
            style={{
              position: 'absolute',
              left: '100%',
              top: 0,
              marginLeft: 4,
              minWidth: 140,
              background: PANEL.bg,
              borderRadius: PANEL.radius,
              border: PANEL.border,
              boxShadow: PANEL.shadow,
              padding: '6px 0',
            }}
          >
            {item.children!.map((child, i) => {
              if (child.type === 'separator') {
                return <Divider key={child.id ?? `sub-sep-${i}`} />;
              }
              return (
                <MenuItem
                  key={child.id}
                  label={child.label}
                  shortcut={child.shortcut}
                  disabled={child.disabled}
                  danger={child.danger}
                  onClick={() => onAction(child.id)}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <MenuItem
      label={item.label}
      shortcut={item.shortcut}
      disabled={item.disabled}
      danger={item.danger}
      hover={hover}
      onHover={setHover}
      onClick={() => onAction(item.id)}
    />
  );
}

function MenuItem({
  label,
  shortcut,
  arrow,
  disabled,
  danger,
  hover: hoverProp,
  onHover,
  onClick,
}: {
  label: string;
  shortcut?: string;
  arrow?: boolean;
  disabled?: boolean;
  danger?: boolean;
  hover?: boolean;
  onHover?: (v: boolean) => void;
  onClick?: () => void;
}) {
  const [innerHover, setInnerHover] = useState(false);
  const hover = hoverProp ?? innerHover;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => { if (!disabled) onClick?.(); }}
      onMouseEnter={() => {
        setInnerHover(true);
        onHover?.(true);
      }}
      onMouseLeave={() => {
        setInnerHover(false);
        onHover?.(false);
      }}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '8px 14px',
        border: 'none',
        background: hover && !disabled ? COLORS.hover : 'transparent',
        color: disabled ? COLORS.muted : danger ? COLORS.danger : COLORS.text,
        fontSize: 14,
        cursor: disabled ? 'default' : 'pointer',
        textAlign: 'left',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <span>{label}</span>
      {arrow ? (
        <span style={{ color: COLORS.muted, fontSize: 12 }}>›</span>
      ) : shortcut ? (
        <span style={{ color: COLORS.muted, fontSize: 12, whiteSpace: 'nowrap' }}>{shortcut}</span>
      ) : null}
    </button>
  );
}
