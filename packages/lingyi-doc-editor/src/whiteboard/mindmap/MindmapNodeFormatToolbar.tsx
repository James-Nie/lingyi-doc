import React, { useRef, useState } from 'react';
import type { MindNode, MindmapLayout, MindNoteBranchStyle } from '@lingyi-doc/core';
import { MindmapLayoutPicker } from './MindmapLayoutPicker';
import { MindmapLayoutIcon } from './MindmapLayoutIcon';
import { SHAPE_FONT_SIZES } from '../ShapeFormatToolbar';
import { TextStylePanel, type TextStylePatch } from '../TextStylePanel';
import { WB_COLORS, WB_PANEL, WB_Z_INDEX } from '../styles';
import type { WbMindmapAction } from './types';

const FILL_SWATCHES = [
  '#3370ff', '#e8f0fe', '#ede7f6', '#fce4ec', '#fff9c4', '#c8e6c9', '#ffffff', '#f5f6f7',
];

const STROKE_SWATCHES = [
  '#3370ff', '#1f2329', '#ea4335', '#f9ab00', '#34a853', '#8f959e', '#ffffff',
];

const TEXT_COLOR_SWATCHES = [
  '#1f2329', '#3370ff', '#ffffff', '#ea4335', '#f9ab00', '#34a853', '#8f959e',
];

const HIGHLIGHT_SWATCHES = [
  '#fff176', '#cfd8dc', '#ffcdd2', '#c8e6c9', '#bbdefb', 'transparent',
];

const NODE_SHAPES = [
  { id: 'text' as const, label: 'T' },
  { id: 'roundRect' as const, label: '▢' },
  { id: 'ellipse' as const, label: '○' },
];

type Panel = 'layout' | 'shape' | 'fill' | 'stroke' | 'fontSize' | 'textColor' | 'text' | 'more' | null;

export interface MindmapNodeFormatToolbarProps {
  node: MindNode;
  layout: MindmapLayout;
  branchStyle: MindNoteBranchStyle;
  anchorX: number;
  anchorY: number;
  /** 默认 true：悬浮在节点上方；false 时由外层容器定位 */
  floating?: boolean;
  /** 工具栏底边与节点顶边的间距（px），默认 8 */
  topGap?: number;
  onNodePatch: (patch: Partial<MindNode>) => void;
  onSettingsChange: (patch: Partial<{ layout: MindmapLayout; branchStyle: MindNoteBranchStyle }>) => void;
  onAction: (action: WbMindmapAction) => void;
  onAddDescription: () => void;
  onAddImage: () => void;
  onAddComment?: () => void;
}

export const MindmapNodeFormatToolbar: React.FC<MindmapNodeFormatToolbarProps> = ({
  node,
  layout,
  branchStyle,
  anchorX,
  anchorY,
  floating = true,
  topGap = 8,
  onNodePatch,
  onSettingsChange,
  onAction,
  onAddDescription,
  onAddImage,
  onAddComment,
}) => {
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (p: Panel) => setPanel(cur => (cur === p ? null : p));

  const showBox = node.shapeKind !== 'text';
  const fontSize = node.fontSize ?? 14;
  const fillColor = node.fillColor ?? (showBox ? '#3370ff' : '#ffffff');
  const strokeColor = node.borderColor ?? '#3370ff';
  const textColor = node.color ?? (fillColor === '#3370ff' ? '#ffffff' : '#1f2329');
  const isBold = !!node.bold;
  const isItalic = !!node.italic;
  const isUnderline = !!node.underline;
  const isLineThrough = !!node.lineThrough;
  const textAlign = node.textAlign ?? (showBox ? 'center' : 'left');
  const textVerticalAlign = node.textVerticalAlign ?? 'center';
  const textHighlight = node.textBgColor;

  const applyTextStylePatch = (patch: TextStylePatch) => {
    const nodePatch: Partial<MindNode> = {};
    if (patch.fontWeight !== undefined) nodePatch.bold = patch.fontWeight >= 600;
    if (patch.fontStyle !== undefined) nodePatch.italic = patch.fontStyle === 'italic';
    if (patch.textUnderline !== undefined) nodePatch.underline = patch.textUnderline;
    if (patch.textLineThrough !== undefined) nodePatch.lineThrough = patch.textLineThrough;
    if (patch.textAlign !== undefined) nodePatch.textAlign = patch.textAlign;
    if (patch.textVerticalAlign !== undefined) nodePatch.textVerticalAlign = patch.textVerticalAlign;
    onNodePatch(nodePatch);
  };

  return (
    <div
      style={{
        ...(floating ? {
          position: 'absolute',
          left: anchorX,
          top: anchorY,
          transform: `translate(-50%, calc(-100% - ${topGap}px))`,
          zIndex: WB_Z_INDEX.shapeToolbar,
        } : undefined),
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
        <Wrap>
          <TbBtn active={panel === 'layout'} onClick={() => toggle('layout')} title="结构与分支">
            <MindmapLayoutIcon layout={layout} size={28} />
            <Chevron />
          </TbBtn>
          {panel === 'layout' && (
            <Popover width={224}>
              <MindmapLayoutPicker
                layout={layout}
                branchStyle={branchStyle}
                showBranchStyle
                onLayoutChange={id => { onSettingsChange({ layout: id }); setPanel(null); }}
                onBranchStyleChange={s => { onSettingsChange({ branchStyle: s }); setPanel(null); }}
              />
            </Popover>
          )}
        </Wrap>

        <Divider />

        <Wrap>
          <TbBtn active={panel === 'shape'} onClick={() => toggle('shape')} title="更改图形">
            <span style={{ fontSize: 15, fontWeight: 600, minWidth: 18, textAlign: 'center' }}>
              {NODE_SHAPES.find(s => s.id === (node.shapeKind ?? 'roundRect'))?.label ?? '▢'}
            </span>
            <Chevron />
          </TbBtn>
          {panel === 'shape' && (
            <Popover>
              <div style={{ display: 'flex', gap: 8 }}>
                {NODE_SHAPES.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    title={s.id === 'text' ? '文本' : s.id === 'ellipse' ? '椭圆' : '圆角矩形'}
                    onClick={() => { onNodePatch({ shapeKind: s.id }); setPanel(null); }}
                    style={{
                      width: 36,
                      height: 36,
                      border: (node.shapeKind ?? 'roundRect') === s.id
                        ? `2px solid ${WB_COLORS.accent}`
                        : `1px solid ${WB_COLORS.border}`,
                      borderRadius: 8,
                      background: (node.shapeKind ?? 'roundRect') === s.id ? '#eef3ff' : '#fff',
                      cursor: 'pointer',
                      fontSize: 16,
                      color: WB_COLORS.text,
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </Popover>
          )}
        </Wrap>

        {showBox && (
          <>
            <Wrap>
              <TbBtn active={panel === 'fill'} onClick={() => toggle('fill')} title="填充颜色">
                <span style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: fillColor,
                  border: `1px solid ${WB_COLORS.border}`,
                  display: 'inline-block',
                }} />
                <Chevron />
              </TbBtn>
              {panel === 'fill' && (
                <Popover>
                  <Swatches
                    colors={FILL_SWATCHES}
                    value={fillColor}
                    onPick={c => { onNodePatch({ fillColor: c }); setPanel(null); }}
                  />
                  <input
                    type="color"
                    value={fillColor.startsWith('#') ? fillColor : '#3370ff'}
                    onChange={e => onNodePatch({ fillColor: e.target.value })}
                    style={{ width: '100%', height: 28, marginTop: 8, border: 'none', cursor: 'pointer' }}
                  />
                </Popover>
              )}
            </Wrap>

            <Wrap>
              <TbBtn active={panel === 'stroke'} onClick={() => toggle('stroke')} title="边框">
                <span style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  border: `2px solid ${strokeColor}`,
                  display: 'inline-block',
                  boxSizing: 'border-box',
                }} />
                <Chevron />
              </TbBtn>
              {panel === 'stroke' && (
                <Popover>
                  <Swatches
                    colors={STROKE_SWATCHES}
                    value={strokeColor}
                    onPick={c => { onNodePatch({ borderColor: c }); setPanel(null); }}
                  />
                </Popover>
              )}
            </Wrap>

            <Divider />
          </>
        )}

        <Wrap>
          <TbBtn active={panel === 'fontSize'} onClick={() => toggle('fontSize')} title="字号">
            <span style={{ fontSize: 13, fontWeight: 500, minWidth: 20, textAlign: 'center' }}>{fontSize}</span>
            <Chevron />
          </TbBtn>
          {panel === 'fontSize' && (
            <Popover width={200}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {SHAPE_FONT_SIZES.map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => { onNodePatch({ fontSize: size }); setPanel(null); }}
                    style={{
                      height: 32,
                      border: fontSize === size ? `2px solid ${WB_COLORS.accent}` : `1px solid ${WB_COLORS.border}`,
                      borderRadius: 6,
                      background: fontSize === size ? '#eef3ff' : '#fff',
                      cursor: 'pointer',
                      fontSize: 12,
                      color: fontSize === size ? WB_COLORS.accent : WB_COLORS.text,
                    }}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </Popover>
          )}
        </Wrap>

        <Wrap>
          <TbBtn active={panel === 'textColor'} onClick={() => toggle('textColor')} title="文字颜色">
            <span style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 22,
              height: 22,
              fontSize: 15,
              fontWeight: 600,
              lineHeight: 1,
              color: textColor,
            }}>
              A
              <span style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 4,
                background: textColor,
                borderRadius: 1,
              }} />
            </span>
            <Chevron />
          </TbBtn>
          {panel === 'textColor' && (
            <Popover width={168}>
              <PanelSection label="文字颜色">
                <Swatches
                  colors={TEXT_COLOR_SWATCHES}
                  value={textColor}
                  onPick={c => { onNodePatch({ color: c }); setPanel(null); }}
                />
                <input
                  type="color"
                  value={textColor.startsWith('#') ? textColor : '#1f2329'}
                  onChange={e => onNodePatch({ color: e.target.value })}
                  style={{ width: '100%', height: 28, marginTop: 8, border: 'none', cursor: 'pointer' }}
                />
              </PanelSection>
              <PanelSection label="文字背景" last>
                <Swatches
                  colors={HIGHLIGHT_SWATCHES}
                  value={textHighlight ?? 'transparent'}
                  onPick={c => {
                    onNodePatch({ textBgColor: c === 'transparent' ? undefined : c });
                    setPanel(null);
                  }}
                />
              </PanelSection>
            </Popover>
          )}
        </Wrap>

        <Wrap>
          <TbBtn active={panel === 'text'} onClick={() => toggle('text')} title="文字样式">
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 22,
              height: 22,
              fontWeight: isBold ? 700 : 500,
              fontStyle: isItalic ? 'italic' : 'normal',
              fontSize: 15,
              lineHeight: 1,
              color: WB_COLORS.text,
              textDecoration: [
                isUnderline ? 'underline' : '',
                isLineThrough ? 'line-through' : '',
              ].filter(Boolean).join(' ') || undefined,
            }}>
              A
            </span>
            <Chevron />
          </TbBtn>
          {panel === 'text' && (
            <TextStylePanel
              textAlign={textAlign}
              textVerticalAlign={textVerticalAlign}
              isBold={isBold}
              isItalic={isItalic}
              isUnderline={isUnderline}
              isLineThrough={isLineThrough}
              onPatch={applyTextStylePatch}
            />
          )}
        </Wrap>

        <TbBtn title="添加图片" onClick={onAddImage}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="4" y="6" width="16" height="12" rx="2" />
            <circle cx="9" cy="11" r="1.2" fill="currentColor" stroke="none" />
            <path d="M4 15l4-3 3 2 5-4 4 3" strokeLinejoin="round" />
          </svg>
        </TbBtn>

        <Wrap>
          <TbBtn active={panel === 'more'} onClick={() => toggle('more')} title="更多">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
            </svg>
          </TbBtn>
          {panel === 'more' && (
            <Popover width={168} anchor="center">
              <MenuRow label="添加同级节点" onClick={() => { onAction('sibling'); setPanel(null); }} />
              <MenuRow label="添加描述" onClick={() => { onAddDescription(); setPanel(null); }} />
              {onAddComment && (
                <MenuRow label="添加评论" onClick={() => { onAddComment(); setPanel(null); }} />
              )}
              <MenuRow label="创建副本" onClick={() => { onAction('duplicate'); setPanel(null); }} />
              <MenuRow label="删除" onClick={() => { onAction('delete'); setPanel(null); }} />
            </Popover>
          )}
        </Wrap>
      </div>
    </div>
  );
};

/** 带隐藏图片 input 的包装，供画板使用 */
export const MindmapNodeFormatToolbarWithImage: React.FC<
  MindmapNodeFormatToolbarProps & {
    onImageSelected: (file: File) => void;
  }
> = ({ onAddImage, onImageSelected, ...props }) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <MindmapNodeFormatToolbar
        {...props}
        onAddImage={() => {
          onAddImage();
          imageInputRef.current?.click();
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onImageSelected(file);
        }}
      />
    </>
  );
};

function Wrap({ children }: { children: React.ReactNode }) {
  return <div style={{ position: 'relative', display: 'inline-flex' }}>{children}</div>;
}

function TbBtn({
  children,
  active,
  title,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseDown={e => e.preventDefault()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        height: 32,
        padding: '0 6px',
        border: 'none',
        borderRadius: 6,
        background: active ? '#eef3ff' : 'transparent',
        cursor: 'pointer',
        color: WB_COLORS.text,
      }}
    >
      {children}
    </button>
  );
}

function Chevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8f959e" strokeWidth="2">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 20, background: WB_COLORS.border, margin: '0 2px' }} />;
}

function Popover({
  children,
  anchor = 'left',
  width,
}: {
  children: React.ReactNode;
  anchor?: 'left' | 'center';
  width?: number;
}) {
  return (
    <div style={{
      position: 'absolute',
      bottom: 'calc(100% + 8px)',
      left: anchor === 'center' ? '50%' : 0,
      transform: anchor === 'center' ? 'translateX(-50%)' : undefined,
      minWidth: width ?? 160,
      background: WB_PANEL.bg,
      border: WB_PANEL.border,
      borderRadius: WB_PANEL.radius,
      boxShadow: WB_PANEL.shadow,
      padding: 12,
      zIndex: 10,
    }}>
      {children}
    </div>
  );
}

function PanelSection({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 0 : 12 }}>
      <div style={{ fontSize: 12, color: WB_COLORS.muted, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function Swatches({
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

function MenuRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        padding: '8px 4px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        fontSize: 13,
        color: WB_COLORS.text,
        textAlign: 'left',
        borderRadius: 4,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f5f6f7'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}
