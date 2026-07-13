import React from 'react';
import { WB_COLORS, WB_PANEL, WB_Z_INDEX } from './styles';

export const STROKE_SWATCHES = [
  '#3370ff', '#1f2329', '#ea4335', '#f9ab00', '#34a853', '#8f959e', '#ffffff',
];

export function Wrap({ children }: { children: React.ReactNode }) {
  return <div style={{ position: 'relative', display: 'inline-flex' }}>{children}</div>;
}

export function TbBtn({
  children,
  active,
  title,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  title?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        height: 32,
        padding: '0 6px',
        border: 'none',
        borderRadius: 6,
        background: active ? '#eef3ff' : 'transparent',
        cursor: disabled ? 'default' : 'pointer',
        color: WB_COLORS.text,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function Chevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8f959e" strokeWidth="2">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function Divider() {
  return <div style={{ width: 1, height: 20, background: WB_COLORS.border, margin: '0 2px' }} />;
}

export function Popover({
  children,
  wide,
  anchor = 'left',
  width,
}: {
  children: React.ReactNode;
  wide?: boolean;
  anchor?: 'left' | 'center' | 'right';
  width?: number;
}) {
  const anchorStyle: React.CSSProperties = anchor === 'center'
    ? { left: '50%', transform: 'translateX(-50%)' }
    : anchor === 'right'
      ? { right: 0 }
      : { left: 0 };
  return (
    <div style={{
      position: 'absolute',
      bottom: 'calc(100% + 8px)',
      ...anchorStyle,
      minWidth: width ?? (wide ? 220 : 160),
      background: WB_PANEL.bg,
      border: WB_PANEL.border,
      borderRadius: WB_PANEL.radius,
      boxShadow: WB_PANEL.shadow,
      padding: wide ? 8 : 10,
      zIndex: 10,
    }}>
      {children}
    </div>
  );
}

export function PanelSection({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 0 : 12 }}>
      <div style={{ fontSize: 12, color: WB_COLORS.muted, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

export function Swatches({
  colors,
  value,
  onPick,
}: {
  colors: string[];
  value: string;
  onPick: (c: string) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
      {colors.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: value === c ? `2px solid ${WB_COLORS.accent}` : `1px solid ${WB_COLORS.border}`,
            background: c === 'transparent'
              ? 'linear-gradient(45deg, #eee 25%, transparent 25%, transparent 75%, #eee 75%), linear-gradient(45deg, #eee 25%, #fff 25%, #fff 75%, #eee 75%)'
              : c,
            backgroundSize: c === 'transparent' ? '8px 8px' : undefined,
            backgroundPosition: c === 'transparent' ? '0 0, 4px 4px' : undefined,
            cursor: 'pointer',
          }}
        />
      ))}
    </div>
  );
}

export function ColorOpacityPanel({
  color,
  opacity,
  onColorChange,
  onOpacityChange,
}: {
  color: string;
  opacity: number;
  onColorChange: (c: string, recordHistory?: boolean) => void;
  onOpacityChange: (o: number, recordHistory?: boolean) => void;
}) {
  const pct = Math.round(opacity * 100);
  return (
    <Popover width={168}>
      <Swatches colors={STROKE_SWATCHES} value={color} onPick={c => onColorChange(c, true)} />
      <input
        type="color"
        value={color}
        onChange={e => onColorChange(e.target.value, false)}
        style={{ width: '100%', height: 28, marginTop: 8, border: 'none', cursor: 'pointer' }}
      />
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12,
        fontSize: 12,
        color: WB_COLORS.muted,
      }}>
        <span>不透明度</span>
        <span>{pct}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        onChange={e => onOpacityChange(Number(e.target.value) / 100, false)}
        onMouseUp={e => onOpacityChange(Number((e.target as HTMLInputElement).value) / 100, true)}
        onTouchEnd={e => onOpacityChange(Number((e.target as HTMLInputElement).value) / 100, true)}
        style={{ width: '100%', marginTop: 6, accentColor: WB_COLORS.accent }}
      />
    </Popover>
  );
}

const MOD = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl';

export function MenuRow({
  label,
  shortcut,
  disabled,
  danger,
  arrow,
  onClick,
}: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  arrow?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '8px 12px',
        border: 'none',
        background: 'transparent',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        color: danger ? '#ea4335' : WB_COLORS.text,
        fontSize: 13,
        textAlign: 'left',
      }}
    >
      <span>{label}</span>
      {shortcut && <span style={{ fontSize: 11, color: WB_COLORS.muted }}>{shortcut}</span>}
      {arrow && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8f959e" strokeWidth="2">
          <path d="M9 6l6 6-6 6" />
        </svg>
      )}
    </button>
  );
}

export { MOD };

export function ToolbarShell({
  anchorX,
  anchorY,
  children,
  anchor = 'top',
}: {
  anchorX: number;
  anchorY: number;
  children: React.ReactNode;
  anchor?: 'top' | 'bottom';
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: anchorX,
        top: anchorY,
        transform: anchor === 'top'
          ? 'translate(-50%, calc(-100% - 8px))'
          : 'translate(-50%, 8px)',
        zIndex: WB_Z_INDEX.shapeToolbar,
        pointerEvents: 'auto',
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        background: WB_PANEL.bg,
        border: WB_PANEL.border,
        borderRadius: 10,
        boxShadow: WB_PANEL.shadow,
        padding: '4px 8px',
      }}>
        {children}
      </div>
    </div>
  );
}
