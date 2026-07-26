import React, { useState } from 'react';
import type { ArrowHeadStyle, ConnectorDashStyle, ConnectorElement, ConnectorStyle, PathPointKind } from '@lingyi-doc/core-whiteboard';
import { CONNECTOR_PRESETS, effectiveConnectorPathMode, isCurveConnectorStyle } from '@lingyi-doc/core-whiteboard';
import {
  Chevron,
  ColorOpacityPanel,
  Divider,
  PanelSection,
  Popover,
  TbBtn,
  ToolbarShell,
  Wrap,
} from './formatToolbarUi';
import { WB_COLORS } from './styles';
import type { WhiteboardContextMenuAction } from './WhiteboardContextMenu';
import type { ZOrderAction } from './elementActions';

type Panel = 'startArrow' | 'endArrow' | 'color' | 'lineStyle' | 'more' | null;

const ARROW_HEAD_OPTIONS: { id: ArrowHeadStyle; label: string }[] = [
  { id: 'none', label: '无' },
  { id: 'open', label: '开放箭头' },
  { id: 'arrow', label: '箭头' },
  { id: 'triangle', label: '三角' },
  { id: 'circle', label: '空心圆' },
  { id: 'dot', label: '实心圆' },
  { id: 'diamond', label: '空心菱形' },
  { id: 'diamondFilled', label: '实心菱形' },
];

const DASH_OPTIONS: { id: ConnectorDashStyle; label: string }[] = [
  { id: 'solid', label: '实线' },
  { id: 'dashed', label: '虚线' },
  { id: 'dotted', label: '点线' },
];

const WEIGHT_OPTIONS = [1, 2, 3, 4] as const;

const MOD = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl';

export interface ConnectorFormatToolbarProps {
  element: ConnectorElement;
  anchorX: number;
  anchorY: number;
  /** 工具栏相对锚点的展开方向，默认 bottom */
  toolbarPlacement?: 'top' | 'bottom';
  onPatch: (patch: Partial<ConnectorElement>, recordHistory?: boolean) => void;
  onAddText: () => void;
  onReverseDirection: () => void;
  onMenuAction: (action: WhiteboardContextMenuAction) => void;
  onLayerAction?: (action: ZOrderAction) => void;
  canPaste?: boolean;
  canPasteStyle?: boolean;
  activePathPointIndex?: number | null;
  activePathPointKind?: PathPointKind;
  onPathPointKindChange?: (kind: PathPointKind) => void;
}

export const ConnectorFormatToolbar: React.FC<ConnectorFormatToolbarProps> = ({
  element,
  anchorX,
  anchorY,
  toolbarPlacement = 'bottom',
  onPatch,
  onAddText,
  onReverseDirection,
  onMenuAction,
  onLayerAction,
  canPaste = false,
  activePathPointIndex = null,
  activePathPointKind = 'corner',
  onPathPointKindChange,
}) => {
  const [panel, setPanel] = useState<Panel>(null);
  const [layerOpen, setLayerOpen] = useState(false);
  const toggle = (p: Panel) => setPanel(cur => (cur === p ? null : p));

  const startArrow = resolveStartArrow(element);
  const endArrow = resolveEndArrow(element);
  const strokeDash = element.strokeDash ?? 'solid';
  const opacity = element.strokeOpacity ?? 1;
  const pathStyle = element.style === 'arrow' ? 'straight' : element.style;
  const pathMode = effectiveConnectorPathMode(element);
  const showPathModeToggle = element.style === 'elbow' || isCurveConnectorStyle(element.style);

  return (
    <ToolbarShell anchorX={anchorX} anchorY={anchorY} anchor={toolbarPlacement}>
      <Wrap>
        <TbBtn active={panel === 'startArrow'} onClick={() => toggle('startArrow')} title="起点样式">
          <ArrowHeadIcon style={startArrow} direction="start" />
          <Chevron />
        </TbBtn>
        {panel === 'startArrow' && (
          <ArrowHeadPanel
            value={startArrow}
            onPick={style => {
              onPatch({ arrowStart: style }, true);
              setPanel(null);
            }}
          />
        )}
      </Wrap>

      <TbBtn title="转换箭头方向" onClick={onReverseDirection}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 7h10" />
          <path d="M7 7l3-3" />
          <path d="M7 7l3 3" />
          <path d="M17 17H7" />
          <path d="M17 17l-3 3" />
          <path d="M17 17l-3-3" />
        </svg>
      </TbBtn>

      <Wrap>
        <TbBtn active={panel === 'endArrow'} onClick={() => toggle('endArrow')} title="终点样式">
          <ArrowHeadIcon style={endArrow} direction="end" />
          <Chevron />
        </TbBtn>
        {panel === 'endArrow' && (
          <ArrowHeadPanel
            value={endArrow}
            onPick={style => {
              onPatch({ arrowEnd: style }, true);
              setPanel(null);
            }}
          />
        )}
      </Wrap>

      <Divider />

      <Wrap>
        <TbBtn active={panel === 'color'} onClick={() => toggle('color')} title="线条颜色">
          <span style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: element.stroke,
            border: `1px solid ${WB_COLORS.border}`,
            display: 'inline-block',
            opacity,
          }} />
          <Chevron />
        </TbBtn>
        {panel === 'color' && (
          <ColorOpacityPanel
            color={element.stroke}
            opacity={opacity}
            onColorChange={(c, rh) => onPatch({ stroke: c }, rh)}
            onOpacityChange={(o, rh) => onPatch({ strokeOpacity: o }, rh)}
          />
        )}
      </Wrap>

      <Wrap>
        <TbBtn active={panel === 'lineStyle'} onClick={() => toggle('lineStyle')} title="连线样式">
          <ConnectorPathIcon style={pathStyle} dash={strokeDash} />
          <Chevron />
        </TbBtn>
        {panel === 'lineStyle' && (
          <Popover wide width={220} anchor="center">
            <PanelSection label="连线样式">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {CONNECTOR_PRESETS.map(p => {
                  const style = p.style === 'arrow' ? 'straight' : p.style;
                  return (
                    <button
                      key={p.style}
                      type="button"
                      title={p.label}
                      onClick={() => {
                        const patch: Partial<ConnectorElement> = { style: p.style };
                        if (p.style === 'arrow') patch.arrowEnd = endArrow === 'none' ? 'arrow' : endArrow;
                        onPatch(patch, true);
                      }}
                      style={iconBtnStyle(pathStyle === style || element.style === p.style)}
                    >
                      <ConnectorPathIcon style={style} dash="solid" />
                    </button>
                  );
                })}
              </div>
            </PanelSection>
            <PanelSection label="线型">
              <div style={{ display: 'flex', gap: 6 }}>
                {DASH_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    title={opt.label}
                    onClick={() => onPatch({ strokeDash: opt.id }, true)}
                    style={{ ...iconBtnStyle(strokeDash === opt.id), flex: 1, height: 34 }}
                  >
                    <DashIcon dash={opt.id} />
                  </button>
                ))}
              </div>
            </PanelSection>
            <PanelSection label="线宽" last>
              <div style={{ display: 'flex', gap: 6 }}>
                {WEIGHT_OPTIONS.map(w => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => onPatch({ strokeWidth: w }, true)}
                    style={{ ...iconBtnStyle(element.strokeWidth === w), flex: 1, height: 34 }}
                  >
                    <span style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: element.strokeWidth === w ? WB_COLORS.accent : WB_COLORS.text,
                      display: 'inline-block',
                      transform: `scale(${0.6 + w * 0.2})`,
                    }} />
                  </button>
                ))}
              </div>
            </PanelSection>
          </Popover>
        )}
      </Wrap>

      <TbBtn title="添加文本" onClick={onAddText}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>+T</span>
      </TbBtn>

      {showPathModeToggle && (
        <TbBtn
          title={pathMode === 'auto' ? '自动路由（随图形绑定更新）' : '手动编辑（保留折点/手柄）'}
          onClick={() => onPatch({ pathMode: pathMode === 'auto' ? 'manual' : 'auto' }, true)}
        >
          {pathMode === 'auto' ? '自动' : '手动'}
        </TbBtn>
      )}

      {element.style === 'curve' && activePathPointIndex != null && onPathPointKindChange && (
        <>
          <Divider />
          <TbBtn
            title={activePathPointKind === 'smooth' ? '平滑点（对称手柄）' : '拐点（独立手柄）'}
            onClick={() => onPathPointKindChange(activePathPointKind === 'smooth' ? 'corner' : 'smooth')}
          >
            {activePathPointKind === 'smooth' ? '平滑' : '拐点'}
          </TbBtn>
        </>
      )}

      <Divider />

      <Wrap>
        <TbBtn active={panel === 'more'} onClick={() => toggle('more')} title="更多">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
          </svg>
        </TbBtn>
        {panel === 'more' && (
          <Popover width={220} anchor="right">
            <MenuRow label="复制" shortcut={`${MOD} + C`} onClick={() => { onMenuAction('copy'); setPanel(null); }} />
            <MenuRow label="复制为图片" shortcut={`${MOD} + Shift + C`} onClick={() => { onMenuAction('copyImage'); setPanel(null); }} />
            <MenuRow label="粘贴" shortcut={`${MOD} + V`} disabled={!canPaste} onClick={() => { onMenuAction('paste'); setPanel(null); }} />
            <MenuRow label="创建副本" shortcut={`${MOD} + D`} onClick={() => { onMenuAction('duplicate'); setPanel(null); }} />
            <div style={{ height: 1, background: WB_COLORS.border, margin: '4px 0' }} />
            <div
              style={{ position: 'relative' }}
              onMouseEnter={() => setLayerOpen(true)}
              onMouseLeave={() => setLayerOpen(false)}
            >
              <MenuRow label="层级" arrow onClick={() => setLayerOpen(v => !v)} />
              {layerOpen && onLayerAction && (
                <div style={{
                  position: 'absolute',
                  right: '100%',
                  top: 0,
                  marginRight: 4,
                  minWidth: 140,
                  background: '#fff',
                  borderRadius: 10,
                  border: `1px solid ${WB_COLORS.border}`,
                  boxShadow: '0 8px 28px rgba(31, 35, 41, 0.12)',
                  padding: '6px 0',
                }}>
                  {([
                    ['front', '置于顶层'],
                    ['forward', '上移一层'],
                    ['backward', '下移一层'],
                    ['back', '置于底层'],
                  ] as const).map(([action, label]) => (
                    <MenuRow
                      key={action}
                      label={label}
                      onClick={() => { onLayerAction(action); setPanel(null); setLayerOpen(false); }}
                    />
                  ))}
                </div>
              )}
            </div>
            <div style={{ height: 1, background: WB_COLORS.border, margin: '4px 0' }} />
            <MenuRow label="锁定" shortcut={`${MOD} + ⌥ + L`} onClick={() => { onMenuAction('lock'); setPanel(null); }} />
            <MenuRow label="删除" onClick={() => { onMenuAction('delete'); setPanel(null); }} danger />
          </Popover>
        )}
      </Wrap>
    </ToolbarShell>
  );
};

function resolveStartArrow(el: ConnectorElement): ArrowHeadStyle {
  if (typeof el.arrowStart === 'string') return el.arrowStart;
  return el.arrowStart ? 'arrow' : 'none';
}

function resolveEndArrow(el: ConnectorElement): ArrowHeadStyle {
  if (typeof el.arrowEnd === 'string') return el.arrowEnd;
  if (el.arrowEnd === false) return 'none';
  if (el.style === 'straight') return el.arrowEnd ? 'arrow' : 'none';
  return 'arrow';
}

function iconBtnStyle(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: active ? `2px solid ${WB_COLORS.accent}` : `1px solid ${WB_COLORS.border}`,
    borderRadius: 8,
    background: active ? '#eef3ff' : '#fff',
    cursor: 'pointer',
    padding: 4,
  };
}

function ArrowHeadPanel({
  value,
  onPick,
}: {
  value: ArrowHeadStyle;
  onPick: (style: ArrowHeadStyle) => void;
}) {
  return (
    <Popover width={180}>
      {ARROW_HEAD_OPTIONS.map(opt => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onPick(opt.id)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '8px 10px',
            border: 'none',
            borderRadius: 6,
            background: value === opt.id ? '#eef3ff' : 'transparent',
            cursor: 'pointer',
            color: WB_COLORS.text,
            fontSize: 13,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <ArrowHeadIcon style={opt.id} direction="end" />
            {opt.label}
          </span>
          {value === opt.id && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={WB_COLORS.accent} strokeWidth="2.5">
              <path d="M5 12l5 5 9-9" />
            </svg>
          )}
        </button>
      ))}
    </Popover>
  );
}

function ArrowHeadIcon({ style, direction }: { style: ArrowHeadStyle; direction: 'start' | 'end' }) {
  const flip = direction === 'start';
  return (
    <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <line x1="1" y1="7" x2="16" y2="7" stroke="currentColor" strokeWidth="1.5" />
      {style === 'open' && (
        <path d="M16 7 L11 4 M16 7 L11 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      )}
      {(style === 'arrow' || style === 'triangle') && (
        <polygon points="16,7 11,4 11,10" fill="currentColor" />
      )}
      {style === 'circle' && (
        <circle cx="17" cy="7" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      )}
      {style === 'dot' && (
        <circle cx="17" cy="7" r="2.5" fill="currentColor" />
      )}
    </svg>
  );
}

function ConnectorPathIcon({ style, dash }: { style: ConnectorStyle | 'straight'; dash: ConnectorDashStyle }) {
  const dashAttr = dash === 'dashed' ? '4 3' : dash === 'dotted' ? '1 3' : undefined;
  return (
    <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden>
      {style === 'elbow' && (
        <path d="M3 14 L3 6 L18 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeDasharray={dashAttr} />
      )}
      {style === 'curve' && (
        <path d="M3 14 Q12 2 18 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeDasharray={dashAttr} />
      )}
      {(style === 'straight' || style === 'arrow') && (
        <line x1="3" y1="14" x2="18" y2="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray={dashAttr} />
      )}
    </svg>
  );
}

function DashIcon({ dash }: { dash: ConnectorDashStyle }) {
  const dashAttr = dash === 'dashed' ? '5 3' : dash === 'dotted' ? '1 3' : undefined;
  return (
    <svg width="28" height="12" viewBox="0 0 28 12" aria-hidden>
      <line x1="2" y1="6" x2="26" y2="6" stroke="currentColor" strokeWidth="1.8" strokeDasharray={dashAttr} />
    </svg>
  );
}

function MenuRow({
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
