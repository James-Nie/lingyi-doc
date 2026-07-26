import React, { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { WB_COLORS, WB_PANEL, WB_Z_INDEX } from './styles';
import { selectionCornerHalf } from './canvas/selectionUi';

/** 设计稿色板：浅色行 + 实色行 */
export const FILL_PALETTE_LIGHT = [
  'transparent',
  '#ffffff',
  '#f5f6f7',
  '#ede7f6',
  '#e3f2fd',
  '#e8f5e9',
  '#fff9c4',
  '#ffe0b2',
  '#fce4ec',
] as const;

export const FILL_PALETTE_SOLID = [
  '#1f2329',
  '#646a73',
  '#8f959e',
  '#7c4dff',
  '#3370ff',
  '#34a853',
  '#f9ab00',
  '#ff9800',
  '#ea4335',
] as const;

export const STROKE_PALETTE = [
  '#1f2329',
  '#646a73',
  '#8f959e',
  '#dee0e3',
  '#ffffff',
  '#7c4dff',
  '#3370ff',
  '#34a853',
  '#f9ab00',
  '#ff9800',
  '#ea4335',
] as const;

export const TEXT_COLOR_PALETTE: { color: string; label: string }[] = [
  { color: '#1f2329', label: '黑色' },
  { color: '#646a73', label: '深灰' },
  { color: '#8f959e', label: '灰色' },
  { color: '#7c4dff', label: '紫色' },
  { color: '#3370ff', label: '蓝色' },
  { color: '#34a853', label: '绿色' },
  { color: '#f9ab00', label: '黄色' },
  { color: '#ff9800', label: '橙色' },
  { color: '#ea4335', label: '红色' },
];

export const HIGHLIGHT_PALETTE = [
  'transparent',
  '#ffffff',
  '#f5f6f7',
  '#ede7f6',
  '#e3f2fd',
  '#e8f5e9',
  '#fff9c4',
  '#ffe0b2',
  '#fce4ec',
  '#1f2329',
  '#646a73',
  '#8f959e',
  '#7c4dff',
  '#3370ff',
  '#34a853',
  '#f9ab00',
  '#bf360c',
  '#ea4335',
] as const;

export const STROKE_SWATCHES = [...STROKE_PALETTE];

export const STROKE_WEIGHTS = [1, 2, 3, 4] as const;

/**
 * 浮动属性栏相对选中对象顶/底边的屏幕间距。
 * 需覆盖缩放控制点半宽与面板阴影，避免遮挡图形本身。
 */
export const FORMAT_TOOLBAR_SCREEN_GAP = 30;

/** 选中对象相对工具栏的方位：属性面板优先向对侧展开，避免遮挡对象 */
type FormatToolbarCtxValue = {
  objectSide: 'above' | 'below';
};

const FormatToolbarCtx = createContext<FormatToolbarCtxValue>({ objectSide: 'below' });

export function FormatToolbarProvider({
  objectSide,
  children,
}: {
  objectSide: 'above' | 'below';
  children: React.ReactNode;
}) {
  return (
    <FormatToolbarCtx.Provider value={{ objectSide }}>
      {children}
    </FormatToolbarCtx.Provider>
  );
}

export function useFormatToolbarObjectSide(): 'above' | 'below' {
  return useContext(FormatToolbarCtx).objectSide;
}

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
      onMouseDown={e => e.preventDefault()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        height: 32,
        padding: '0 6px',
        border: 'none',
        borderRadius: 8,
        background: active ? '#f2f3f5' : 'transparent',
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
  return <div style={{ width: 1, height: 18, background: '#e8e9eb', margin: '0 4px' }} />;
}

const PANEL_VIEW_PAD = 8;
const PANEL_GAP = 8;

/**
 * 属性面板：portal 到 body，按选中对象方位与视窗空间自动上下翻转，并水平钳制，避免遮挡对象与溢出。
 */
export function Popover({
  children,
  wide,
  anchor = 'left',
  width,
  placement,
}: {
  children: React.ReactNode;
  wide?: boolean;
  anchor?: 'left' | 'center' | 'right';
  width?: number;
  /** 强制展开方向；默认根据选中对象方位自动选择（优先背离对象） */
  placement?: 'above' | 'below';
}) {
  const objectSide = useFormatToolbarObjectSide();
  const prefer: 'above' | 'below' = placement
    ?? (objectSide === 'below' ? 'above' : 'below');
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; left: number; ready: boolean }>({
    top: 0,
    left: 0,
    ready: false,
  });

  useLayoutEffect(() => {
    const trigger = triggerRef.current?.parentElement;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const update = () => {
      const tr = trigger.getBoundingClientRect();
      const pr = panel.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const spaceAbove = tr.top - PANEL_VIEW_PAD;
      const spaceBelow = vh - tr.bottom - PANEL_VIEW_PAD;
      const need = pr.height + PANEL_GAP;

      let placeAbove = prefer === 'above';
      if (prefer === 'above' && spaceAbove < need && spaceBelow > spaceAbove) placeAbove = false;
      if (prefer === 'below' && spaceBelow < need && spaceAbove > spaceBelow) placeAbove = true;

      let top = placeAbove ? tr.top - PANEL_GAP - pr.height : tr.bottom + PANEL_GAP;
      let left = anchor === 'center'
        ? tr.left + tr.width / 2 - pr.width / 2
        : anchor === 'right'
          ? tr.right - pr.width
          : tr.left;

      left = Math.max(PANEL_VIEW_PAD, Math.min(left, vw - PANEL_VIEW_PAD - pr.width));
      top = Math.max(PANEL_VIEW_PAD, Math.min(top, vh - PANEL_VIEW_PAD - pr.height));
      setBox({ top, left, ready: true });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [prefer, anchor, width, wide]);

  const minWidth = width ?? (wide ? 240 : 220);
  const panel = (
    <div
      ref={panelRef}
      onPointerDown={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: box.top,
        left: box.left,
        minWidth,
        background: WB_PANEL.bg,
        border: WB_PANEL.border,
        borderRadius: WB_PANEL.radius,
        boxShadow: WB_PANEL.shadow,
        padding: 12,
        zIndex: WB_Z_INDEX.shapeToolbar + 20,
        visibility: box.ready ? 'visible' : 'hidden',
        pointerEvents: 'auto',
      }}
    >
      {children}
    </div>
  );

  return (
    <>
      <span ref={triggerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden />
      {typeof document !== 'undefined' ? createPortal(panel, document.body) : panel}
    </>
  );
}

export function PanelSection({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 0 : 14 }}>
      <div style={{ fontSize: 12, color: WB_COLORS.text, fontWeight: 500, marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}

function swatchBg(color: string): React.CSSProperties {
  if (color === 'transparent') {
    return {
      background: '#fff',
      backgroundImage: 'linear-gradient(to bottom right, transparent calc(50% - 0.5px), #c9cdd4 calc(50% - 0.5px), #c9cdd4 calc(50% + 0.5px), transparent calc(50% + 0.5px))',
    };
  }
  return { background: color };
}

/** 圆形色块（填充/边框） */
export function CircleSwatch({
  color,
  selected,
  title,
  onClick,
  size = 24,
}: {
  color: string;
  selected?: boolean;
  title?: string;
  onClick?: () => void;
  size?: number;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: selected ? `2px solid ${WB_COLORS.accent}` : `1px solid ${color === '#ffffff' || color === 'transparent' ? WB_COLORS.border : 'transparent'}`,
        boxShadow: selected ? `0 0 0 1px #fff inset` : undefined,
        cursor: 'pointer',
        padding: 0,
        boxSizing: 'border-box',
        ...swatchBg(color),
      }}
    />
  );
}

/** 方形色块（文字颜色/背景） */
export function SquareSwatch({
  color,
  selected,
  title,
  onClick,
  children,
  size = 28,
}: {
  color?: string;
  selected?: boolean;
  title?: string;
  onClick?: () => void;
  children?: React.ReactNode;
  size?: number;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      {hover && title && (
        <div style={{
          position: 'absolute',
          left: '50%',
          bottom: 'calc(100% + 6px)',
          transform: 'translateX(-50%)',
          background: '#1f2329',
          color: '#fff',
          fontSize: 11,
          padding: '4px 8px',
          borderRadius: 6,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 2,
        }}>
          {title}
        </div>
      )}
      <button
        type="button"
        title={title}
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          border: selected ? `2px solid ${WB_COLORS.accent}` : `1px solid ${WB_COLORS.border}`,
          background: color === undefined ? '#fff' : color === 'transparent' ? '#fff' : color,
          backgroundImage: color === 'transparent'
            ? 'linear-gradient(to bottom right, transparent calc(50% - 0.5px), #c9cdd4 calc(50% - 0.5px), #c9cdd4 calc(50% + 0.5px), transparent calc(50% + 0.5px))'
            : undefined,
          cursor: 'pointer',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
        }}
      >
        {children}
      </button>
    </div>
  );
}

export function OpacitySlider({
  opacity,
  onChange,
}: {
  opacity: number;
  onChange: (o: number, recordHistory?: boolean) => void;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, opacity)) * 100);
  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 12,
        color: WB_COLORS.text,
        marginBottom: 8,
      }}>
        <span>不透明度</span>
        <span style={{ color: WB_COLORS.muted }}>{pct}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        onChange={e => onChange(Number(e.target.value) / 100, false)}
        onMouseUp={e => onChange(Number((e.target as HTMLInputElement).value) / 100, true)}
        onTouchEnd={e => onChange(Number((e.target as HTMLInputElement).value) / 100, true)}
        style={{
          width: '100%',
          height: 4,
          accentColor: WB_COLORS.accent,
          cursor: 'pointer',
        }}
      />
    </div>
  );
}

function AddColorButton({
  value,
  onPick,
}: {
  value: string;
  onPick: (c: string, recordHistory?: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const safe = value === 'transparent' || !value ? '#3370ff' : value;
  return (
    <button
      type="button"
      title="自定义颜色"
      onClick={() => inputRef.current?.click()}
      style={{
        position: 'relative',
        width: 24,
        height: 24,
        borderRadius: '50%',
        border: `1px solid ${WB_COLORS.border}`,
        background: '#f5f6f7',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: WB_COLORS.muted,
        fontSize: 16,
        lineHeight: 1,
        padding: 0,
      }}
    >
      +
      <input
        ref={inputRef}
        type="color"
        value={safe}
        onChange={e => onPick(e.target.value, false)}
        onBlur={e => onPick(e.target.value, true)}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0,
          cursor: 'pointer',
          border: 'none',
          padding: 0,
        }}
      />
    </button>
  );
}

/** 填充色面板：色板 + 可选透明度 */
export function FillColorPanel({
  color,
  opacity,
  onColorChange,
  onOpacityChange,
  colors,
}: {
  color: string;
  opacity?: number;
  onColorChange: (c: string, recordHistory?: boolean) => void;
  onOpacityChange?: (o: number, recordHistory?: boolean) => void;
  colors?: string[];
}) {
  const palette = colors ?? [...FILL_PALETTE_LIGHT, ...FILL_PALETTE_SOLID];
  const normalized = !color || color === 'none' ? 'transparent' : color;
  return (
    <Popover width={248} anchor="center">
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(9, 1fr)',
        gap: 8,
        marginBottom: 10,
      }}>
        {palette.map(c => (
          <CircleSwatch
            key={c}
            color={c}
            selected={normalized.toLowerCase() === c.toLowerCase()}
            onClick={() => onColorChange(c, true)}
          />
        ))}
      </div>
      <div style={{ marginBottom: onOpacityChange ? 14 : 0 }}>
        <AddColorButton value={normalized === 'transparent' ? '#ffffff' : normalized} onPick={onColorChange} />
      </div>
      {onOpacityChange && (
        <OpacitySlider opacity={opacity ?? 1} onChange={onOpacityChange} />
      )}
    </Popover>
  );
}

/** 边框样式面板：线型 + 粗细 + 颜色 + 可选透明度 */
export function BorderStylePanel({
  color,
  width,
  dash,
  opacity,
  onColorChange,
  onWidthChange,
  onDashChange,
  onOpacityChange,
  showDash = true,
  dashOptions = ['none', 'solid', 'dashed', 'dotted'],
}: {
  color: string;
  width: number;
  dash?: 'solid' | 'dashed' | 'dotted' | 'none';
  opacity?: number;
  onColorChange: (c: string, recordHistory?: boolean) => void;
  onWidthChange: (w: number, recordHistory?: boolean) => void;
  onDashChange?: (d: 'solid' | 'dashed' | 'dotted' | 'none', recordHistory?: boolean) => void;
  onOpacityChange?: (o: number, recordHistory?: boolean) => void;
  showDash?: boolean;
  dashOptions?: Array<'none' | 'solid' | 'dashed' | 'dotted'>;
}) {
  const effectiveDash = width <= 0 ? 'none' : (dash ?? 'solid');
  const dashIcons = {
    none: <NoneStrokeIcon />,
    solid: <SolidStrokeIcon />,
    dashed: <DashedStrokeIcon />,
    dotted: <DottedStrokeIcon />,
  } as const;
  return (
    <Popover width={248} anchor="center">
      <div style={{ fontSize: 12, color: WB_COLORS.text, fontWeight: 500, marginBottom: 10 }}>边框样式</div>

      {showDash && onDashChange && (
        <div style={{
          display: 'flex',
          gap: 4,
          background: '#f5f6f7',
          borderRadius: 10,
          padding: 4,
          marginBottom: 10,
        }}>
          {dashOptions.map(id => (
            <button
              key={id}
              type="button"
              title={id}
              onClick={() => onDashChange(id, true)}
              style={{
                flex: 1,
                height: 32,
                border: 'none',
                borderRadius: 8,
                background: effectiveDash === id ? '#fff' : 'transparent',
                boxShadow: effectiveDash === id ? '0 1px 4px rgba(31,35,41,0.08)' : undefined,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: WB_COLORS.text,
              }}
            >
              {dashIcons[id]}
            </button>
          ))}
        </div>
      )}

      <div style={{
        display: 'flex',
        gap: 4,
        background: '#f5f6f7',
        borderRadius: 10,
        padding: 4,
        marginBottom: 12,
      }}>
        {STROKE_WEIGHTS.map(w => (
          <button
            key={w}
            type="button"
            title={`${w}px`}
            onClick={() => onWidthChange(w, true)}
            style={{
              flex: 1,
              height: 32,
              border: 'none',
              borderRadius: 8,
              background: width === w && effectiveDash !== 'none' ? '#eef3ff' : 'transparent',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{
              width: 4 + w * 2,
              height: 4 + w * 2,
              borderRadius: '50%',
              background: width === w && effectiveDash !== 'none' ? WB_COLORS.accent : WB_COLORS.text,
              display: 'inline-block',
            }} />
          </button>
        ))}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 8,
        marginBottom: 10,
      }}>
        {STROKE_PALETTE.map(c => (
          <CircleSwatch
            key={c}
            color={c}
            selected={color.toLowerCase() === c.toLowerCase() && effectiveDash !== 'none'}
            onClick={() => {
              onColorChange(c, true);
              if (width <= 0) onWidthChange(2, true);
            }}
          />
        ))}
      </div>
      <div style={{ marginBottom: onOpacityChange ? 14 : 0 }}>
        <AddColorButton value={color || '#1f2329'} onPick={onColorChange} />
      </div>
      {onOpacityChange && (
        <OpacitySlider opacity={opacity ?? 1} onChange={onOpacityChange} />
      )}
    </Popover>
  );
}

/** 文字颜色 + 背景色面板 */
export function TextColorStylePanel({
  textColor,
  textHighlight,
  onTextColorChange,
  onHighlightChange,
}: {
  textColor: string;
  textHighlight?: string;
  onTextColorChange: (c: string, recordHistory?: boolean) => void;
  onHighlightChange: (c: string | undefined, recordHistory?: boolean) => void;
}) {
  const hl = textHighlight ?? 'transparent';
  return (
    <Popover width={292} anchor="center">
      <PanelSection label="文字颜色">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TEXT_COLOR_PALETTE.map(item => (
            <SquareSwatch
              key={item.color}
              selected={textColor.toLowerCase() === item.color.toLowerCase()}
              title={item.label}
              onClick={() => onTextColorChange(item.color, true)}
            >
              <span style={{
                fontSize: 14,
                fontWeight: 600,
                color: item.color,
                lineHeight: 1,
              }}>
                A
              </span>
            </SquareSwatch>
          ))}
        </div>
      </PanelSection>
      <PanelSection label="背景颜色" last>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(9, 1fr)',
          gap: 6,
        }}>
          {HIGHLIGHT_PALETTE.map(c => (
            <SquareSwatch
              key={c}
              color={c}
              selected={hl.toLowerCase() === c.toLowerCase()}
              title={c === 'transparent' ? '无' : c}
              onClick={() => onHighlightChange(c === 'transparent' ? undefined : c, true)}
              size={26}
            />
          ))}
        </div>
      </PanelSection>
    </Popover>
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
      {colors.map(c => (
        <CircleSwatch
          key={c}
          color={c}
          selected={value.toLowerCase() === c.toLowerCase()}
          onClick={() => onPick(c)}
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
  return (
    <FillColorPanel
      color={color}
      opacity={opacity}
      onColorChange={onColorChange}
      onOpacityChange={onOpacityChange}
      colors={[...STROKE_PALETTE]}
    />
  );
}

function NoneStrokeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="7" />
      <path d="M6 18L18 6" />
    </svg>
  );
}

function SolidStrokeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  );
}

function DashedStrokeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3">
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  );
}

function DottedStrokeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="1.5 3" strokeLinecap="round">
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
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
        borderRadius: 6,
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
  gap = FORMAT_TOOLBAR_SCREEN_GAP,
}: {
  anchorX: number;
  anchorY: number;
  children: React.ReactNode;
  anchor?: 'top' | 'bottom';
  /** 相对锚点的屏幕间距，默认 {@link FORMAT_TOOLBAR_SCREEN_GAP} */
  gap?: number;
}) {
  const [effectiveAnchor, setEffectiveAnchor] = useState(anchor);
  useLayoutEffect(() => {
    const toolbarH = 44;
    const panelBudget = 300;
    const edgePad = 12;
    const vh = window.innerHeight;
    if (anchor === 'top') {
      const spaceAbove = anchorY - gap - toolbarH;
      const spaceBelow = vh - anchorY - gap;
      setEffectiveAnchor(spaceAbove < panelBudget && spaceBelow > spaceAbove + edgePad ? 'bottom' : 'top');
    } else {
      const spaceBelow = vh - anchorY - gap - toolbarH;
      const spaceAbove = anchorY - gap;
      setEffectiveAnchor(spaceBelow < panelBudget && spaceAbove > spaceBelow + edgePad ? 'top' : 'bottom');
    }
  }, [anchor, anchorX, anchorY, gap]);

  const objectSide: 'above' | 'below' = effectiveAnchor === 'top' ? 'below' : 'above';
  return (
    <FormatToolbarProvider objectSide={objectSide}>
      <div
        style={{
          position: 'absolute',
          left: anchorX,
          top: anchorY,
          transform: effectiveAnchor === 'top'
            ? `translate(-50%, calc(-100% - ${gap}px))`
            : `translate(-50%, ${gap}px)`,
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
          borderRadius: WB_PANEL.radius,
          boxShadow: WB_PANEL.shadow,
          padding: '4px 8px',
        }}>
          {children}
        </div>
      </div>
    </FormatToolbarProvider>
  );
}
