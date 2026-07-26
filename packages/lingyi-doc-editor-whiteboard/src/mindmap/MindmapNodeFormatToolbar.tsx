import React, { useLayoutEffect, useRef, useState } from 'react';
import type { MindmapLayout } from '@lingyi-doc/core-whiteboard';
import type { MindNode, MindNoteBranchStyle } from '@lingyi-doc/core-types';
import { MindmapLayoutPicker } from './MindmapLayoutPicker';
import { MindmapLayoutIcon } from './MindmapLayoutIcon';
import { SHAPE_FONT_SIZES } from '../ShapeFormatToolbar';
import { TextStylePanel, type TextStylePatch } from '../TextStylePanel';
import {
  BorderStylePanel,
  Chevron,
  Divider,
  FillColorPanel,
  FORMAT_TOOLBAR_SCREEN_GAP,
  FormatToolbarProvider,
  MenuRow,
  Popover,
  TextColorStylePanel,
  TbBtn,
  Wrap,
} from '../formatToolbarUi';
import { WB_COLORS, WB_PANEL, WB_Z_INDEX } from '../styles';
import type { WbMindmapAction } from './types';

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
  /** 工具栏底边与节点顶边的间距（px） */
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
  topGap = FORMAT_TOOLBAR_SCREEN_GAP,
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
  const strokeColor = (node.borderColor && node.borderColor !== '')
    ? node.borderColor
    : '#3370ff';
  const borderOff = node.borderColor === '';
  const textColor = node.color ?? (fillColor === '#3370ff' ? '#ffffff' : '#1f2329');
  const isBold = !!node.bold;
  const isItalic = !!node.italic;
  const isUnderline = !!node.underline;
  const isLineThrough = !!node.lineThrough;
  const textAlign = node.textAlign ?? (showBox ? 'center' : 'left');
  const textVerticalAlign = node.textVerticalAlign ?? 'center';
  const textHighlight = node.textBgColor;
  const fillOpacity = (node.fillOpacity ?? 100) / 100;
  const borderOpacity = (node.borderOpacity ?? 100) / 100;

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

  const [toolbarSide, setToolbarSide] = useState<'above' | 'below'>('above');
  useLayoutEffect(() => {
    if (!floating) {
      setToolbarSide('above');
      return;
    }
    const toolbarH = 44;
    const panelBudget = 300;
    const vh = window.innerHeight;
    const spaceAbove = anchorY - topGap - toolbarH;
    const spaceBelow = vh - anchorY - topGap;
    setToolbarSide(spaceAbove < panelBudget && spaceBelow > spaceAbove ? 'below' : 'above');
  }, [anchorX, anchorY, floating, topGap]);

  return (
    <FormatToolbarProvider objectSide={toolbarSide === 'above' ? 'below' : 'above'}>
    <div
      style={{
        ...(floating ? {
          position: 'absolute',
          left: anchorX,
          top: anchorY,
          transform: toolbarSide === 'below'
            ? `translate(-50%, ${topGap}px)`
            : `translate(-50%, calc(-100% - ${topGap}px))`,
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
        borderRadius: WB_PANEL.radius,
        boxShadow: WB_PANEL.shadow,
        padding: '4px 8px',
      }}>
        <Wrap>
          <TbBtn active={panel === 'layout'} onClick={() => toggle('layout')} title="结构与分支">
            <MindmapLayoutIcon layout={layout} size={28} />
            <Chevron />
          </TbBtn>
          {panel === 'layout' && (
            <Popover width={224} anchor="center">
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

        <Wrap>
          <TbBtn active={panel === 'shape'} onClick={() => toggle('shape')} title="更改图形">
            <span style={{ fontSize: 15, fontWeight: 600, minWidth: 18, textAlign: 'center' }}>
              {NODE_SHAPES.find(s => s.id === (node.shapeKind ?? 'roundRect'))?.label ?? '▢'}
            </span>
            <Chevron />
          </TbBtn>
          {panel === 'shape' && (
            <Popover anchor="center">
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
                  opacity: fillOpacity,
                }} />
                <Chevron />
              </TbBtn>
              {panel === 'fill' && (
                <FillColorPanel
                  color={fillColor}
                  opacity={fillOpacity}
                  onColorChange={(c, _rh) => {
                    onNodePatch({ fillColor: c === 'transparent' ? '#ffffff' : c });
                  }}
                  onOpacityChange={(o, _rh) => {
                    onNodePatch({ fillOpacity: Math.round(o * 100) });
                  }}
                />
              )}
            </Wrap>

            <Wrap>
              <TbBtn active={panel === 'stroke'} onClick={() => toggle('stroke')} title="边框样式">
                <span style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  border: `2px solid ${strokeColor}`,
                  display: 'inline-block',
                  boxSizing: 'border-box',
                  opacity: borderOff ? 0.35 : borderOpacity,
                }} />
                <Chevron />
              </TbBtn>
              {panel === 'stroke' && (
                <BorderStylePanel
                  color={strokeColor}
                  width={borderOff ? 0 : 2}
                  dash={borderOff ? 'none' : 'solid'}
                  opacity={borderOpacity}
                  showDash
                  dashOptions={['none', 'solid']}
                  onColorChange={(c) => {
                    onNodePatch({ borderColor: c });
                  }}
                  onWidthChange={(w) => {
                    if (w <= 0) onNodePatch({ borderColor: '' });
                    else if (borderOff) onNodePatch({ borderColor: strokeColor || '#3370ff' });
                  }}
                  onDashChange={(d) => {
                    if (d === 'none') onNodePatch({ borderColor: '' });
                    else if (borderOff) onNodePatch({ borderColor: '#3370ff' });
                  }}
                  onOpacityChange={(o) => {
                    onNodePatch({ borderOpacity: Math.round(o * 100) });
                  }}
                />
              )}
            </Wrap>
          </>
        )}

        <Divider />

        <Wrap>
          <TbBtn active={panel === 'textColor'} onClick={() => toggle('textColor')} title="文字颜色与背景">
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
                background: textHighlight ?? textColor,
                borderRadius: 1,
              }} />
            </span>
            <Chevron />
          </TbBtn>
          {panel === 'textColor' && (
            <TextColorStylePanel
              textColor={textColor}
              textHighlight={textHighlight}
              onTextColorChange={(c) => onNodePatch({ color: c })}
              onHighlightChange={(c) => onNodePatch({ textBgColor: c })}
            />
          )}
        </Wrap>

        <Wrap>
          <TbBtn active={panel === 'fontSize'} onClick={() => toggle('fontSize')} title="字号">
            <span style={{
              fontSize: 13,
              fontWeight: 500,
              minWidth: 22,
              height: 22,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              background: panel === 'fontSize' ? '#eef3ff' : 'transparent',
              color: panel === 'fontSize' ? WB_COLORS.accent : WB_COLORS.text,
            }}>
              {fontSize}
            </span>
            <Chevron />
          </TbBtn>
          {panel === 'fontSize' && (
            <Popover width={200} anchor="center">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {SHAPE_FONT_SIZES.map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => { onNodePatch({ fontSize: size }); setPanel(null); }}
                    style={{
                      height: 32,
                      border: fontSize === size ? `2px solid ${WB_COLORS.accent}` : `1px solid ${WB_COLORS.border}`,
                      borderRadius: 8,
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
          <TbBtn active={panel === 'text'} onClick={() => toggle('text')} title="文字样式">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="14" y2="12" />
              <line x1="4" y1="18" x2="17" y2="18" />
            </svg>
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

        <Divider />

        <TbBtn title="添加图片" onClick={onAddImage}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="4" y="6" width="16" height="12" rx="2" />
            <circle cx="9" cy="11" r="1.2" fill="currentColor" stroke="none" />
            <path d="M4 15l4-3 3 2 5-4 4 3" strokeLinejoin="round" />
          </svg>
        </TbBtn>

        {onAddComment && (
          <TbBtn title="添加评论" onClick={onAddComment}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </TbBtn>
        )}

        <Wrap>
          <TbBtn active={panel === 'more'} onClick={() => toggle('more')} title="更多">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
            </svg>
          </TbBtn>
          {panel === 'more' && (
            <Popover width={168} anchor="right">
              <MenuRow label="添加同级节点" onClick={() => { onAction('sibling'); setPanel(null); }} />
              <MenuRow label="添加描述" onClick={() => { onAddDescription(); setPanel(null); }} />
              <MenuRow label="创建副本" onClick={() => { onAction('duplicate'); setPanel(null); }} />
              <MenuRow label="删除" onClick={() => { onAction('delete'); setPanel(null); }} danger />
            </Popover>
          )}
        </Wrap>
      </div>
    </div>
    </FormatToolbarProvider>
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
