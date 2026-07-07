import React, { useState } from 'react';
import type {
  ConnectorStyle,
  MindmapLayout,
  SectionAspect,
  ShapeKind,
  WhiteboardTool,
} from '@lingyi-doc/core';
import {
  CONNECTOR_PRESETS,
  MINDMAP_TEMPLATES,
  SECTION_PRESETS,
  SHAPE_PRESETS,
  STICKY_COLORS,
} from '@lingyi-doc/core';
import { WB_COLORS, WB_PANEL } from './styles';
import { ShapeIcon } from './ShapeIcon';

export interface WhiteboardToolState {
  tool: WhiteboardTool;
  shapeKind: ShapeKind;
  stickyColor: string;
  connectorStyle: ConnectorStyle;
  sectionAspect: SectionAspect;
  penColor: string;
  penWidth: number;
  penMode: 'pen' | 'highlighter' | 'eraser';
  mindmapLayout: MindmapLayout;
}

interface WhiteboardToolbarProps {
  embedded?: boolean;
  readOnly?: boolean;
  state: WhiteboardToolState;
  onChange: (patch: Partial<WhiteboardToolState>) => void;
}

const TOOLS: { id: WhiteboardTool; title: string; shortcut?: string; icon: React.ReactNode }[] = [
  { id: 'select', title: '选择', shortcut: 'V', icon: <IconSelect /> },
  { id: 'shape', title: '形状', icon: <IconRect /> },
  { id: 'text', title: '文本', shortcut: 'T', icon: <IconText /> },
  { id: 'sticky', title: '便签', shortcut: 'N', icon: <IconSticky /> },
  { id: 'connector', title: '连接线', icon: <IconConnector /> },
  { id: 'section', title: '分区', shortcut: 'Shift+S', icon: <IconSection /> },
  { id: 'table', title: '表格', icon: <IconTable /> },
  { id: 'pen', title: '画笔', shortcut: 'P', icon: <IconPen /> },
  { id: 'mindmap', title: '思维导图', icon: <IconMindmap /> },
  { id: 'image', title: '图片', icon: <IconImage /> },
];

const TOOLS_WITH_PANEL: WhiteboardTool[] = ['shape', 'sticky', 'connector', 'section', 'mindmap'];

export const WhiteboardToolbar: React.FC<WhiteboardToolbarProps> = ({
  embedded,
  readOnly,
  state,
  onChange,
}) => {
  const [hoverPanel, setHoverPanel] = useState<WhiteboardTool | null>(null);

  const pickTool = (tool: WhiteboardTool) => {
    if (readOnly) return;
    onChange({ tool });
  };

  const showPanel = (tool: WhiteboardTool) => {
    if (readOnly) return;
    if (TOOLS_WITH_PANEL.includes(tool)) {
      setHoverPanel(tool);
    } else {
      setHoverPanel(null);
    }
  };

  const hidePanel = () => setHoverPanel(null);

  return (
    <div style={{
      position: 'absolute',
      left: embedded ? 16 : 24,
      top: embedded ? 16 : 88,
      zIndex: 70,
    }}>
      <div
        style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}
        onMouseLeave={hidePanel}
      >
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          padding: '8px 6px',
          background: WB_COLORS.toolbarBg,
          borderRadius: WB_COLORS.toolbarRadius,
          boxShadow: WB_COLORS.toolbarShadow,
          border: `1px solid ${WB_COLORS.border}`,
        }}>
          <LogoMark />
          <ToolDivider />
          {TOOLS.map(t => (
            <ToolBtn
              key={t.id}
              title={t.shortcut ? `${t.title} ${t.shortcut}` : t.title}
              active={state.tool === t.id}
              hovered={hoverPanel === t.id}
              disabled={readOnly}
              onMouseEnter={() => showPanel(t.id)}
              onClick={() => pickTool(t.id)}
            >
              {t.icon}
            </ToolBtn>
          ))}
          <ToolDivider />
          <ToolBtn
            title="评论"
            disabled={readOnly}
            onMouseEnter={hidePanel}
            onClick={() => pickTool('comment')}
          >
            <IconComment />
          </ToolBtn>
        </div>

      {hoverPanel === 'shape' && (
        <Flyout title="形状" badge="M">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, padding: 8 }}>
            {SHAPE_PRESETS.map(s => (
              <ShapeGridButton
                key={s.kind}
                label={s.label}
                active={state.shapeKind === s.kind}
                onClick={() => onChange({ shapeKind: s.kind, tool: 'shape' })}
              >
                <ShapeIcon kind={s.kind} />
              </ShapeGridButton>
            ))}
          </div>
          <PanelFooterBtn onClick={() => onChange({ tool: 'shape' })}>
            更多图形
            <span style={{ fontSize: 11, color: WB_COLORS.muted, background: '#f0f1f2', padding: '1px 6px', borderRadius: 4 }}>M</span>
          </PanelFooterBtn>
        </Flyout>
      )}

      {hoverPanel === 'sticky' && (
        <Flyout title="便签" badge="N">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: 10 }}>
            {STICKY_COLORS.map(c => (
              <PanelColorBtn
                key={c}
                color={c}
                active={state.stickyColor === c}
                onClick={() => onChange({ stickyColor: c, tool: 'sticky' })}
              />
            ))}
          </div>
        </Flyout>
      )}

      {hoverPanel === 'connector' && (
        <Flyout title="连接线">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 6 }}>
            {CONNECTOR_PRESETS.map(c => (
              <PanelRowBtn
                key={c.style}
                active={state.connectorStyle === c.style}
                onClick={() => onChange({ connectorStyle: c.style, tool: 'connector' })}
              >
                <ConnectorIcon style={c.style} />
                {c.label}
              </PanelRowBtn>
            ))}
          </div>
        </Flyout>
      )}

      {hoverPanel === 'section' && (
        <Flyout title="分区" badge="Shift+S">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: 10 }}>
            {SECTION_PRESETS.map(s => (
              <PanelSectionBtn
                key={s.aspect}
                label={s.label}
                active={state.sectionAspect === s.aspect}
                aspect={s.aspect}
                onClick={() => onChange({ sectionAspect: s.aspect, tool: 'section' })}
              />
            ))}
          </div>
        </Flyout>
      )}

      {hoverPanel === 'mindmap' && (
        <Flyout title="思维导图" wide>
          <div style={{ padding: 10, maxHeight: 280, overflowY: 'auto' }}>
            <div style={{ fontSize: 12, color: WB_COLORS.muted, marginBottom: 8 }}>思维导图</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {MINDMAP_TEMPLATES.map(t => (
                <PanelTileBtn
                  key={t.layout}
                  active={state.mindmapLayout === t.layout}
                  onClick={() => onChange({ mindmapLayout: t.layout, tool: 'mindmap' })}
                >
                  {t.label}
                </PanelTileBtn>
              ))}
            </div>
          </div>
        </Flyout>
      )}
      </div>

      {state.tool === 'pen' && !readOnly && (
        <PenPalette
          color={state.penColor}
          width={state.penWidth}
          mode={state.penMode}
          onChange={patch => onChange(patch)}
          onClose={() => onChange({ tool: 'select' })}
        />
      )}
    </div>
  );
};

function Flyout({ title, badge, wide, children }: { title: string; badge?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      width: wide ? 220 : 200,
      background: WB_PANEL.bg,
      borderRadius: WB_PANEL.radius,
      boxShadow: WB_PANEL.shadow,
      border: WB_PANEL.border,
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${WB_COLORS.border}` }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: WB_COLORS.text }}>{title}</span>
        {badge && (
          <span style={{ fontSize: 11, color: WB_COLORS.muted, background: '#f5f6f7', padding: '1px 6px', borderRadius: 4 }}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function PenPalette({
  color,
  width,
  mode,
  onChange,
  onClose,
}: {
  color: string;
  width: number;
  mode: 'pen' | 'highlighter' | 'eraser';
  onChange: (patch: Partial<WhiteboardToolState>) => void;
  onClose: () => void;
}) {
  return (
    <div style={{
      position: 'fixed',
      right: 24,
      bottom: 80,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      background: WB_PANEL.bg,
      borderRadius: 24,
      boxShadow: WB_PANEL.shadow,
      border: WB_PANEL.border,
      zIndex: 80,
    }}>
      {(['pen', 'highlighter', 'eraser'] as const).map(m => (
        <button
          key={m}
          type="button"
          onClick={() => onChange({ penMode: m })}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: mode === m ? `2px solid ${WB_COLORS.accent}` : '1px solid #eee',
            background: m === 'pen' ? '#e53935' : m === 'highlighter' ? '#ffeb3b' : '#ffcdd2',
            cursor: 'pointer',
          }}
        />
      ))}
      <div style={{ width: 1, height: 24, background: WB_COLORS.border }} />
      <input
        type="color"
        value={color}
        onChange={e => onChange({ penColor: e.target.value })}
        style={{ width: 32, height: 32, border: 'none', padding: 0, cursor: 'pointer' }}
      />
      <select
        value={width}
        onChange={e => onChange({ penWidth: Number(e.target.value) })}
        style={{ border: `1px solid ${WB_COLORS.border}`, borderRadius: 6, padding: '4px 6px', fontSize: 12 }}
      >
        <option value={2}>细</option>
        <option value={4}>中</option>
        <option value={8}>粗</option>
      </select>
      <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: WB_COLORS.muted }}>×</button>
    </div>
  );
}

function PanelRowBtn({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        border: 'none',
        borderRadius: 8,
        background: active ? WB_COLORS.activeBg : hover ? '#f0f1f2' : 'transparent',
        cursor: 'pointer',
        fontSize: 13,
        color: WB_COLORS.text,
        transition: 'background 0.15s',
      }}
    >
      {children}
    </button>
  );
}

function PanelTileBtn({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: 8,
        border: `1px solid ${active ? WB_COLORS.accent : hover ? '#c9cdd4' : WB_COLORS.border}`,
        borderRadius: 8,
        background: active ? '#eef3ff' : hover ? '#f5f6f7' : '#fafafa',
        cursor: 'pointer',
        fontSize: 12,
        color: WB_COLORS.text,
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {children}
    </button>
  );
}

function PanelColorBtn({
  color,
  active,
  onClick,
}: {
  color: string;
  active?: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 36,
        height: 36,
        borderRadius: 6,
        border: active
          ? `2px solid ${WB_COLORS.accent}`
          : hover
            ? `2px solid #c9cdd4`
            : '1px solid #eee',
        background: color,
        cursor: 'pointer',
        transform: hover ? 'scale(1.06)' : 'scale(1)',
        transition: 'transform 0.15s, border-color 0.15s',
      }}
    />
  );
}

function PanelSectionBtn({
  label,
  aspect,
  active,
  onClick,
}: {
  label: string;
  aspect: SectionAspect;
  active?: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        border: 'none',
        background: hover ? '#f0f1f2' : 'transparent',
        borderRadius: 8,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: 6,
        transition: 'background 0.15s',
      }}
    >
      <div style={{
        width: aspect === 'a4' ? 28 : 40,
        height: aspect === '16:9' ? 22 : aspect === 'a4' ? 40 : 30,
        border: `2px solid ${active ? WB_COLORS.accent : hover ? '#8f959e' : '#bbb'}`,
        borderRadius: 2,
        transition: 'border-color 0.15s',
      }} />
      <span style={{ fontSize: 11, color: active ? WB_COLORS.accent : WB_COLORS.muted }}>{label}</span>
    </button>
  );
}

function PanelFooterBtn({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        padding: '10px 12px',
        border: 'none',
        borderTop: `1px solid ${WB_COLORS.border}`,
        background: hover ? '#f0f1f2' : '#fafafa',
        cursor: 'pointer',
        fontSize: 13,
        color: WB_COLORS.text,
        transition: 'background 0.15s',
      }}
    >
      {children}
    </button>
  );
}

function ShapeGridButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div
      style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 6,
            padding: '5px 10px',
            background: '#1f2329',
            color: '#ffffff',
            fontSize: 12,
            lineHeight: 1.2,
            borderRadius: 6,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          {label}
          <span
            style={{
              position: 'absolute',
              left: '50%',
              bottom: -4,
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: '5px solid #1f2329',
            }}
          />
        </div>
      )}
      <button
        type="button"
        onClick={onClick}
        style={{
          width: 32,
          height: 32,
          border: active ? `2px solid ${WB_COLORS.accent}` : '1px solid transparent',
          borderRadius: 6,
          background: active ? '#eef3ff' : hover ? '#f0f1f2' : '#fff',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        {children}
      </button>
    </div>
  );
}

function ToolBtn({
  children,
  title,
  active,
  hovered,
  disabled,
  onClick,
  onMouseEnter,
}: {
  children: React.ReactNode;
  title: string;
  active?: boolean;
  hovered?: boolean;
  disabled?: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const isHot = hover || hovered;

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => {
        setHover(true);
        onMouseEnter?.();
      }}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 36,
        height: 36,
        border: 'none',
        borderRadius: 8,
        background: active
          ? WB_COLORS.activeBg
          : isHot
            ? '#f0f1f2'
            : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: WB_COLORS.text,
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.15s',
      }}
    >
      {children}
    </button>
  );
}

function ToolDivider() {
  return <div style={{ width: 24, height: 1, background: WB_COLORS.border, margin: '4px 0' }} />;
}

function LogoMark() {
  return (
    <div style={{ width: 28, height: 28, position: 'relative', marginBottom: 4 }}>
      <div style={{ position: 'absolute', left: 2, top: 8, width: 12, height: 12, borderRadius: '50%', background: '#3370ff' }} />
      <div style={{ position: 'absolute', right: 2, top: 4, width: 10, height: 10, background: '#f9ab00', borderRadius: 2 }} />
      <div style={{ position: 'absolute', left: 8, bottom: 2, width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: '10px solid #ea4335' }} />
    </div>
  );
}

function ConnectorIcon({ style }: { style: ConnectorStyle }) {
  const paths: Record<ConnectorStyle, string> = {
    straight: 'M4 18L18 6',
    arrow: 'M4 18L18 6',
    elbow: 'M4 18H12V6H18',
    curve: 'M4 16Q12 4 18 8',
  };
  return (
    <svg width="24" height="20" viewBox="0 0 24 20">
      <path d={paths[style]} fill="none" stroke="#333" strokeWidth="1.5" markerEnd={style !== 'straight' ? 'url(#tb-arrow)' : undefined} />
    </svg>
  );
}

function IconSelect() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4l7 16 2-7 7-2L4 4z" />
    </svg>
  );
}
function IconRect() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="7" width="14" height="10" rx="2" /></svg>;
}
function IconText() {
  return <span style={{ fontSize: 16, fontWeight: 600 }}>T</span>;
}
function IconSticky() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 4h12v14H6V4z" /><path d="M14 14l4 4" /></svg>;
}
function IconConnector() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 18c4-8 10-8 14 0" /><path d="M16 16l3 3" /></svg>;
}
function IconSection() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="6" width="16" height="12" rx="1" /><rect x="7" y="9" width="7" height="6" rx="1" /></svg>;
}
function IconTable() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M4 10h16M4 16h16M10 4v16" /></svg>;
}
function IconPen() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>;
}
function IconMindmap() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="12" r="2" /><path d="M8 12h8" /><circle cx="18" cy="8" r="2" /><circle cx="18" cy="16" r="2" /><path d="M16 9l-2 2M16 15l-2-2" /></svg>;
}
function IconImage() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8" cy="10" r="1.5" /><path d="M21 17l-5-5-4 4-2-2-5 5" /></svg>;
}
function IconComment() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
}

export const DEFAULT_TOOL_STATE: WhiteboardToolState = {
  tool: 'select',
  shapeKind: 'roundRect',
  stickyColor: STICKY_COLORS[0],
  connectorStyle: 'arrow',
  sectionAspect: 'custom',
  penColor: '#e53935',
  penWidth: 3,
  penMode: 'pen',
  mindmapLayout: 'right',
};
