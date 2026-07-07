import React, { useState } from 'react';
import type { MindNode, MindmapLayout, MindNoteBranchStyle } from '@lingyi-doc/core';
import { WB_MM_COLORS, WB_MM_UI, type WbMindmapAction } from './types';

interface WbMindmapToolbarProps {
  node: MindNode;
  layout: MindmapLayout;
  branchStyle: MindNoteBranchStyle;
  canvasZoom?: number;
  onPatch: (patch: Partial<MindNode>) => void;
  onLayoutChange: (layout: MindmapLayout) => void;
  onBranchStyleChange: (style: MindNoteBranchStyle) => void;
  onAction: (action: WbMindmapAction) => void;
  onAddDescription: () => void;
  onAddImage: () => void;
}

type Panel = 'layout' | 'shape' | 'fill' | 'border' | 'text' | 'fontSize' | 'add' | 'more' | null;

const SHAPES = [
  { id: 'text' as const, label: 'T' },
  { id: 'ellipse' as const, label: '○' },
  { id: 'roundRect' as const, label: '▢' },
];

const FONT_SIZES = [12, 14, 16, 18, 20, 24];

export const WbMindmapToolbar: React.FC<WbMindmapToolbarProps> = ({
  node,
  layout,
  branchStyle,
  canvasZoom = 1,
  onPatch,
  onLayoutChange,
  onBranchStyleChange,
  onAction,
  onAddDescription,
  onAddImage,
}) => {
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (p: Panel) => setPanel(cur => (cur === p ? null : p));

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: canvasZoom !== 1
          ? `translateX(-50%) scale(${1 / canvasZoom})`
          : 'translateX(-50%)',
        transformOrigin: 'top center',
        zIndex: 25,
        pointerEvents: 'auto',
        maxWidth: 'calc(100% - 16px)',
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        background: WB_MM_UI.panelBg,
        border: `1px solid ${WB_MM_UI.toolbarBorder}`,
        borderRadius: WB_MM_UI.radius,
        boxShadow: WB_MM_UI.panelShadow,
        padding: '4px 6px',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        <Wrap>
          <TbBtn active={panel === 'layout'} onClick={() => toggle('layout')} title="结构与分支">⊞</TbBtn>
          {panel === 'layout' && (
            <Popover title="结构">
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {(['right', 'left', 'balanced', 'vertical'] as MindmapLayout[]).map(id => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { onLayoutChange(id); setPanel(null); }}
                    style={chipStyle(layout === id)}
                  >
                    {id.slice(0, 1).toUpperCase()}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: WB_MM_UI.muted, marginBottom: 6 }}>分支</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['straight', 'curve'] as MindNoteBranchStyle[]).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { onBranchStyleChange(s); setPanel(null); }}
                    style={{ ...chipStyle(branchStyle === s), flex: 1 }}
                  >
                    {s === 'straight' ? '折线' : '曲线'}
                  </button>
                ))}
              </div>
            </Popover>
          )}
        </Wrap>

        <Wrap>
          <TbBtn active={panel === 'shape'} onClick={() => toggle('shape')} title="更改图形">▢</TbBtn>
          {panel === 'shape' && (
            <Popover title="更改图形">
              <div style={{ display: 'flex', gap: 8 }}>
                {SHAPES.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { onPatch({ shapeKind: s.id }); setPanel(null); }}
                    style={{ ...chipStyle(node.shapeKind === s.id), width: 40, height: 40, fontSize: 16 }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </Popover>
          )}
        </Wrap>

        <Wrap>
          <TbBtn active={panel === 'fill'} onClick={() => toggle('fill')} title="填充颜色">
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: node.fillColor ?? WB_MM_UI.accent, display: 'inline-block' }} />
          </TbBtn>
          {panel === 'fill' && (
            <ColorPopover
              value={node.fillColor}
              onPick={c => onPatch({ fillColor: c === 'transparent' ? undefined : c })}
            />
          )}
        </Wrap>

        <Wrap>
          <TbBtn active={panel === 'border'} onClick={() => toggle('border')} title="边框颜色">
            <span style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${node.borderColor ?? WB_MM_UI.accent}`, display: 'inline-block' }} />
          </TbBtn>
          {panel === 'border' && (
            <ColorPopover
              value={node.borderColor}
              onPick={c => onPatch({ borderColor: c === 'transparent' ? undefined : c })}
            />
          )}
        </Wrap>

        <Wrap>
          <TbBtn active={panel === 'text'} onClick={() => toggle('text')} title="文字颜色">A</TbBtn>
          {panel === 'text' && (
            <Popover title="文字颜色">
              <ColorRow value={node.color} onPick={c => onPatch({ color: c === 'transparent' ? undefined : c })} />
            </Popover>
          )}
        </Wrap>

        <Wrap>
          <TbBtn active={panel === 'fontSize'} onClick={() => toggle('fontSize')} title="字号">
            {node.fontSize ?? 16}
          </TbBtn>
          {panel === 'fontSize' && (
            <Popover title="字号">
              {FONT_SIZES.map(size => (
                <button
                  key={size}
                  type="button"
                  onClick={() => { onPatch({ fontSize: size }); setPanel(null); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '6px 10px',
                    border: 'none',
                    background: (node.fontSize ?? 16) === size ? WB_MM_UI.selectBg : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 13,
                    borderRadius: 4,
                  }}
                >
                  {size}
                </button>
              ))}
            </Popover>
          )}
        </Wrap>

        <TbBtn active={!!node.bold} onClick={() => onPatch({ bold: !node.bold })} title="加粗">B</TbBtn>

        <Wrap>
          <TbBtn active={panel === 'add'} onClick={() => toggle('add')} title="插入">+</TbBtn>
          {panel === 'add' && (
            <Popover title="">
              <MenuRow label="添加子节点" onClick={() => { onAction('child'); setPanel(null); }} />
              <MenuRow label="添加同级节点" onClick={() => { onAction('sibling'); setPanel(null); }} />
              <MenuRow label="添加描述" onClick={() => { onAddDescription(); setPanel(null); }} />
              <MenuRow label="添加图片" onClick={() => { onAddImage(); setPanel(null); }} />
            </Popover>
          )}
        </Wrap>

        <Wrap>
          <TbBtn active={panel === 'more'} onClick={() => toggle('more')} title="更多">⋯</TbBtn>
          {panel === 'more' && (
            <Popover title="">
              <MenuRow label="添加子节点" onClick={() => { onAction('child'); setPanel(null); }} />
              <MenuRow label="创建副本" onClick={() => { onAction('duplicate'); setPanel(null); }} />
              <MenuRow label="删除" onClick={() => { onAction('delete'); setPanel(null); }} />
            </Popover>
          )}
        </Wrap>
      </div>
    </div>
  );
};

function chipStyle(active: boolean): React.CSSProperties {
  return {
    minWidth: 36,
    height: 32,
    border: `1px solid ${active ? WB_MM_UI.accent : '#dee0e3'}`,
    borderRadius: 6,
    background: active ? WB_MM_UI.selectBg : '#fff',
    cursor: 'pointer',
    fontSize: 12,
    color: active ? WB_MM_UI.accent : WB_MM_UI.muted,
  };
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div style={{ position: 'relative' }}>{children}</div>;
}

function TbBtn({
  children,
  title,
  active,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseDown={e => e.preventDefault()}
      style={{
        minWidth: 32,
        height: 32,
        border: 'none',
        borderRadius: 6,
        background: active ? WB_MM_UI.selectBg : 'transparent',
        cursor: 'pointer',
        fontSize: 13,
        color: active ? WB_MM_UI.accent : WB_MM_UI.text,
        padding: '0 6px',
      }}
    >
      {children}
    </button>
  );
}

function Popover({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'absolute',
      bottom: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      marginBottom: 8,
      background: WB_MM_UI.panelBg,
      borderRadius: WB_MM_UI.radius,
      boxShadow: WB_MM_UI.panelShadow,
      padding: '10px 12px',
      minWidth: 160,
      zIndex: 30,
    }}>
      {title && (
        <div style={{ fontSize: 12, color: WB_MM_UI.muted, marginBottom: 8, fontWeight: 500 }}>{title}</div>
      )}
      {children}
    </div>
  );
}

function ColorPopover({ value, onPick }: { value?: string; onPick: (c: string) => void }) {
  return (
    <Popover title="颜色">
      <ColorRow value={value} onPick={onPick} />
    </Popover>
  );
}

function ColorRow({ value, onPick }: { value?: string; onPick: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {WB_MM_COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            border: `2px solid ${value === c ? WB_MM_UI.accent : '#dee0e3'}`,
            background: c === 'transparent'
              ? 'linear-gradient(45deg, transparent 46%, #f54a45 46%, #f54a45 54%, transparent 54%)'
              : c,
            cursor: 'pointer',
            padding: 0,
          }}
        />
      ))}
    </div>
  );
}

function MenuRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        padding: '6px 4px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        fontSize: 13,
        color: WB_MM_UI.text,
        textAlign: 'left',
      }}
    >
      {label}
    </button>
  );
}
