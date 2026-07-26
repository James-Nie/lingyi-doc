import React, { useLayoutEffect, useMemo, useState } from 'react';
import type { ShapeElement, ShapeKind, StickyElement, TableElement, TextElement } from '@lingyi-doc/core-whiteboard';
import { getShapeRegistry, STICKY_COLORS } from '@lingyi-doc/core-whiteboard';
import { ShapeIcon } from './ShapeIcon';
import { TextStylePanel, type TextStylePatch } from './TextStylePanel';
import {
  BorderStylePanel,
  Chevron,
  Divider,
  FillColorPanel,
  FORMAT_TOOLBAR_SCREEN_GAP,
  FormatToolbarProvider,
  MenuRow,
  MOD,
  Popover,
  TextColorStylePanel,
  TbBtn,
  Wrap,
} from './formatToolbarUi';
import { WB_COLORS, WB_PANEL, WB_Z_INDEX } from './styles';
import type { WhiteboardContextMenuAction } from './WhiteboardContextMenu';
import type { ZOrderAction } from './elementActions';

export const SHAPE_FONT_SIZES = [12, 14, 18, 24, 36, 48, 72, 96] as const;

type TextFormatPatch = TextStylePatch & Partial<{
  fontSize: number;
  textColor: string;
  textHighlight: string | undefined;
}>;

type ShapeFormatToolbarProps = {
  anchorX: number;
  anchorY: number;
  /** 工具栏相对锚点的位置，默认在上方 */
  placement?: 'above' | 'below';
  /** 相对锚点的屏幕间距，默认 {@link FORMAT_TOOLBAR_SCREEN_GAP} */
  gap?: number;
  onAddComment?: () => void;
  onMenuAction?: (action: WhiteboardContextMenuAction) => void;
  onLayerAction?: (action: ZOrderAction) => void;
  canPaste?: boolean;
} & (
  | {
      variant?: 'shape';
      element: ShapeElement;
      onPatch: (patch: Partial<ShapeElement>, recordHistory?: boolean) => void;
    }
  | {
      variant: 'text';
      element: TextElement;
      onPatch: (patch: Partial<TextElement>, recordHistory?: boolean) => void;
    }
  | {
      variant: 'table';
      element: TableElement;
      onPatch: (patch: Partial<TableElement>, recordHistory?: boolean) => void;
    }
  | {
      variant: 'sticky';
      element: StickyElement;
      onPatch: (patch: Partial<StickyElement>, recordHistory?: boolean) => void;
    }
);

const STICKY_FILL_SWATCHES = ['transparent', ...STICKY_COLORS, '#ffffff', '#f5f6f7'];

type Panel = 'shape' | 'fill' | 'stroke' | 'fontSize' | 'textColor' | 'text' | 'more' | null;

function textPatchToElement(patch: TextFormatPatch): Partial<TextElement> {
  const out: Partial<TextElement> = {};
  if (patch.fontSize !== undefined) out.fontSize = patch.fontSize;
  if (patch.textColor !== undefined) out.color = patch.textColor;
  if ('textHighlight' in patch) out.textHighlight = patch.textHighlight;
  if (patch.textAlign !== undefined) out.textAlign = patch.textAlign;
  if (patch.textVerticalAlign !== undefined) out.textVerticalAlign = patch.textVerticalAlign;
  if (patch.fontWeight !== undefined) out.fontWeight = patch.fontWeight;
  if (patch.fontStyle !== undefined) out.fontStyle = patch.fontStyle;
  if (patch.textUnderline !== undefined) out.textUnderline = patch.textUnderline;
  if (patch.textLineThrough !== undefined) out.textLineThrough = patch.textLineThrough;
  return out;
}

function stickyPatchToElement(patch: TextFormatPatch & Partial<{ fill: string }>): Partial<StickyElement> {
  const out: Partial<StickyElement> = {};
  if (patch.fontSize !== undefined) out.fontSize = patch.fontSize;
  if (patch.textColor !== undefined) out.textColor = patch.textColor;
  if ('textHighlight' in patch) out.textHighlight = patch.textHighlight;
  if (patch.textAlign !== undefined) out.textAlign = patch.textAlign;
  if (patch.textVerticalAlign !== undefined) out.textVerticalAlign = patch.textVerticalAlign;
  if (patch.fontWeight !== undefined) out.fontWeight = patch.fontWeight;
  if (patch.fontStyle !== undefined) out.fontStyle = patch.fontStyle;
  if (patch.textUnderline !== undefined) out.textUnderline = patch.textUnderline;
  if (patch.textLineThrough !== undefined) out.textLineThrough = patch.textLineThrough;
  if (patch.fill !== undefined) out.color = patch.fill;
  return out;
}

function tablePatchToElement(patch: TextFormatPatch & Partial<{ stroke: string; fill: string }>): Partial<TableElement> {
  const out: Partial<TableElement> = {};
  if (patch.fontSize !== undefined) out.fontSize = patch.fontSize;
  if (patch.textColor !== undefined) out.color = patch.textColor;
  if ('textHighlight' in patch) out.textHighlight = patch.textHighlight;
  if (patch.textAlign !== undefined) out.textAlign = patch.textAlign;
  if (patch.textVerticalAlign !== undefined) out.textVerticalAlign = patch.textVerticalAlign;
  if (patch.fontWeight !== undefined) out.fontWeight = patch.fontWeight;
  if (patch.fontStyle !== undefined) out.fontStyle = patch.fontStyle;
  if (patch.textUnderline !== undefined) out.textUnderline = patch.textUnderline;
  if (patch.textLineThrough !== undefined) out.textLineThrough = patch.textLineThrough;
  if (patch.stroke !== undefined) out.stroke = patch.stroke;
  if (patch.fill !== undefined) out.fill = patch.fill;
  return out;
}

export const ShapeFormatToolbar: React.FC<ShapeFormatToolbarProps> = (props) => {
  const {
    anchorX,
    anchorY,
    placement = 'above',
    gap = FORMAT_TOOLBAR_SCREEN_GAP,
    onAddComment,
    onMenuAction,
    onLayerAction,
    canPaste = false,
  } = props;
  const isText = props.variant === 'text';
  const isTable = props.variant === 'table';
  const isSticky = props.variant === 'sticky';
  const textElement = isText ? props.element : null;
  const tableElement = isTable ? props.element : null;
  const stickyElement = isSticky ? props.element : null;
  const shapeElement = !isText && !isTable && !isSticky ? props.element : null;
  const [panel, setPanel] = useState<Panel>(null);
  const [layerOpen, setLayerOpen] = useState(false);
  const toggle = (p: Panel) => setPanel(cur => (cur === p ? null : p));

  const applyTextPatch = (patch: TextFormatPatch, recordHistory?: boolean) => {
    if (isText) {
      props.onPatch(textPatchToElement(patch), recordHistory);
      return;
    }
    if (isTable) {
      props.onPatch(tablePatchToElement(patch), recordHistory);
      return;
    }
    if (isSticky) {
      props.onPatch(stickyPatchToElement(patch), recordHistory);
      return;
    }
    props.onPatch(patch as Partial<ShapeElement>, recordHistory);
  };

  const applyShapeOnlyPatch = (patch: Partial<ShapeElement>, recordHistory?: boolean) => {
    if (isText || isTable || isSticky || !shapeElement) return;
    props.onPatch(patch, recordHistory);
  };

  const applyTableStylePatch = (patch: Partial<TableElement>, recordHistory?: boolean) => {
    if (!isTable) return;
    props.onPatch(patch, recordHistory);
  };

  const applyStickyStylePatch = (patch: Partial<StickyElement>, recordHistory?: boolean) => {
    if (!isSticky) return;
    props.onPatch(patch, recordHistory);
  };

  const fontSize = textElement
    ? textElement.fontSize
    : tableElement
      ? (tableElement.fontSize ?? 14)
      : stickyElement
        ? (stickyElement.fontSize ?? 14)
        : (shapeElement!.fontSize ?? 14);
  const textColor = textElement
    ? textElement.color
    : tableElement
      ? (tableElement.color ?? '#1f2329')
      : stickyElement
        ? (stickyElement.textColor ?? '#1f2329')
        : (shapeElement!.textColor ?? '#1f2329');
  const textHighlight = textElement
    ? textElement.textHighlight
    : tableElement
      ? tableElement.textHighlight
      : stickyElement
        ? stickyElement.textHighlight
        : shapeElement!.textHighlight;
  const textAlign = textElement
    ? (textElement.textAlign ?? 'left')
    : tableElement
      ? (tableElement.textAlign ?? 'center')
      : stickyElement
        ? (stickyElement.textAlign ?? 'left')
        : (shapeElement!.textAlign ?? 'center');
  const textVerticalAlign = textElement
    ? (textElement.textVerticalAlign ?? 'center')
    : tableElement
      ? (tableElement.textVerticalAlign ?? 'center')
      : stickyElement
        ? (stickyElement.textVerticalAlign ?? 'top')
        : (shapeElement!.textVerticalAlign ?? 'center');
  const fontWeight = (
    textElement?.fontWeight
    ?? tableElement?.fontWeight
    ?? stickyElement?.fontWeight
    ?? shapeElement?.fontWeight
  ) ?? 400;
  const fontStyle = textElement?.fontStyle
    ?? tableElement?.fontStyle
    ?? stickyElement?.fontStyle
    ?? shapeElement?.fontStyle;
  const textUnderline = textElement?.textUnderline
    ?? tableElement?.textUnderline
    ?? stickyElement?.textUnderline
    ?? shapeElement?.textUnderline;
  const textLineThrough = textElement?.textLineThrough
    ?? tableElement?.textLineThrough
    ?? stickyElement?.textLineThrough
    ?? shapeElement?.textLineThrough;
  const isBold = fontWeight >= 600;
  const isItalic = fontStyle === 'italic';
  const isUnderline = !!textUnderline;
  const isLineThrough = !!textLineThrough;

  const replaceableShapes = useMemo(() => {
    if (!shapeElement) return [];
    return getShapeRegistry().listReplaceableShapePresets(
      shapeElement.shapeKind,
      shapeElement.shapeCategoryId,
    );
  }, [shapeElement?.shapeKind, shapeElement?.shapeCategoryId]);

  // 靠近视窗顶/底时翻转工具栏，给属性面板留出空间并减少遮挡对象
  const [effectivePlacement, setEffectivePlacement] = useState(placement);
  useLayoutEffect(() => {
    const toolbarH = 44;
    const panelBudget = 300;
    const edgePad = 12;
    const vh = window.innerHeight;
    if (placement === 'above') {
      const spaceAbove = anchorY - gap - toolbarH;
      const spaceBelow = vh - anchorY - gap;
      if (spaceAbove < panelBudget && spaceBelow > spaceAbove + edgePad) {
        setEffectivePlacement('below');
        return;
      }
    } else {
      const spaceBelow = vh - anchorY - gap - toolbarH;
      const spaceAbove = anchorY - gap;
      if (spaceBelow < panelBudget && spaceAbove > spaceBelow + edgePad) {
        setEffectivePlacement('above');
        return;
      }
    }
    setEffectivePlacement(placement);
  }, [anchorX, anchorY, gap, placement]);

  return (
    <FormatToolbarProvider objectSide={effectivePlacement === 'above' ? 'below' : 'above'}>
      <div
        style={{
          position: 'absolute',
          left: anchorX,
          top: anchorY,
          transform: effectivePlacement === 'below'
            ? `translate(-50%, ${gap}px)`
            : `translate(-50%, calc(-100% - ${gap}px))`,
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
        {!isText && !isTable && !isSticky && shapeElement && (
          <>
            <Wrap>
              <TbBtn active={panel === 'shape'} onClick={() => toggle('shape')} title="更改图形">
                <ShapeIcon kind={shapeElement.shapeKind} />
                <Chevron />
              </TbBtn>
              {panel === 'shape' && (
                <Popover wide anchor="center">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, padding: 4 }}>
                    {replaceableShapes.map(s => (
                      <button
                        key={s.kind}
                        type="button"
                        title={s.label}
                        onClick={() => { applyShapeOnlyPatch({ shapeKind: s.kind as ShapeKind }, true); setPanel(null); }}
                        style={{
                          width: 36,
                          height: 36,
                          border: shapeElement.shapeKind === s.kind ? `2px solid ${WB_COLORS.accent}` : `1px solid ${WB_COLORS.border}`,
                          borderRadius: 8,
                          background: shapeElement.shapeKind === s.kind ? '#eef3ff' : '#fff',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <ShapeIcon kind={s.kind} />
                      </button>
                    ))}
                  </div>
                </Popover>
              )}
            </Wrap>

            <Wrap>
              <TbBtn active={panel === 'fill'} onClick={() => toggle('fill')} title="填充颜色">
                <span style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: shapeElement.fill,
                  border: `1px solid ${WB_COLORS.border}`,
                  display: 'inline-block',
                }} />
                <Chevron />
              </TbBtn>
              {panel === 'fill' && (
                <FillColorPanel
                  color={shapeElement.fill}
                  onColorChange={(c, rh) => applyShapeOnlyPatch({ fill: c === 'transparent' ? '#ffffff' : c }, rh)}
                />
              )}
            </Wrap>

            <Wrap>
              <TbBtn active={panel === 'stroke'} onClick={() => toggle('stroke')} title="边框样式">
                <span style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  border: `${Math.max(1, Math.min(shapeElement.strokeWidth, 4))}px solid ${shapeElement.strokeWidth <= 0 ? WB_COLORS.border : shapeElement.stroke}`,
                  display: 'inline-block',
                  boxSizing: 'border-box',
                  opacity: shapeElement.strokeWidth <= 0 ? 0.45 : 1,
                }} />
                <Chevron />
              </TbBtn>
              {panel === 'stroke' && (
                <BorderStylePanel
                  color={shapeElement.stroke}
                  width={shapeElement.strokeWidth}
                  dash={shapeElement.strokeWidth <= 0 ? 'none' : 'solid'}
                  showDash
                  dashOptions={['none', 'solid']}
                  onColorChange={(c, rh) => applyShapeOnlyPatch({ stroke: c }, rh)}
                  onWidthChange={(w, rh) => applyShapeOnlyPatch({ strokeWidth: w }, rh)}
                  onDashChange={(d, rh) => {
                    if (d === 'none') applyShapeOnlyPatch({ strokeWidth: 0 }, rh);
                    else if (shapeElement.strokeWidth <= 0) applyShapeOnlyPatch({ strokeWidth: 2 }, rh);
                  }}
                />
              )}
            </Wrap>
          </>
        )}

        {isTable && tableElement && (
          <>
            <Wrap>
              <TbBtn active={panel === 'fill'} onClick={() => toggle('fill')} title="填充颜色">
                <span style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: tableElement.fill ?? '#ffffff',
                  border: `1px solid ${WB_COLORS.border}`,
                  display: 'inline-block',
                }} />
                <Chevron />
              </TbBtn>
              {panel === 'fill' && (
                <FillColorPanel
                  color={tableElement.fill ?? '#ffffff'}
                  onColorChange={(c, rh) => applyTableStylePatch({ fill: c === 'transparent' ? '#ffffff' : c }, rh)}
                />
              )}
            </Wrap>
            <Wrap>
              <TbBtn active={panel === 'stroke'} onClick={() => toggle('stroke')} title="边框样式">
                <span style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  border: `2px solid ${tableElement.stroke ?? '#dee0e3'}`,
                  display: 'inline-block',
                  boxSizing: 'border-box',
                }} />
                <Chevron />
              </TbBtn>
              {panel === 'stroke' && (
                <BorderStylePanel
                  color={tableElement.stroke ?? '#dee0e3'}
                  width={2}
                  showDash={false}
                  onColorChange={(c, rh) => applyTableStylePatch({ stroke: c }, rh)}
                  onWidthChange={() => {}}
                />
              )}
            </Wrap>
          </>
        )}

        {isSticky && stickyElement && (
          <Wrap>
            <TbBtn active={panel === 'fill'} onClick={() => toggle('fill')} title="便签颜色">
              <span style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: stickyElement.color,
                border: `1px solid ${WB_COLORS.border}`,
                display: 'inline-block',
              }} />
              <Chevron />
            </TbBtn>
            {panel === 'fill' && (
              <FillColorPanel
                color={stickyElement.color}
                colors={STICKY_FILL_SWATCHES}
                onColorChange={(c, rh) => applyStickyStylePatch({ color: c === 'transparent' ? '#fff9c4' : c }, rh)}
              />
            )}
          </Wrap>
        )}

        {(shapeElement || tableElement || stickyElement || textElement) && <Divider />}

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
              onTextColorChange={(c, rh) => applyTextPatch({ textColor: c }, rh)}
              onHighlightChange={(c, rh) => applyTextPatch({ textHighlight: c }, rh)}
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
            <FontSizePanel fontSize={fontSize} onPatch={applyTextPatch} />
          )}
        </Wrap>

        <Wrap>
          <TbBtn active={panel === 'text'} onClick={() => toggle('text')} title="文字样式">
            <AlignToolbarIcon />
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
              onPatch={applyTextPatch}
            />
          )}
        </Wrap>

        <Divider />

        {onAddComment && (
          <TbBtn title="添加评论" onClick={onAddComment}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </TbBtn>
        )}

        {onMenuAction && (
          <Wrap>
            <TbBtn active={panel === 'more'} onClick={() => toggle('more')} title="更多">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
              </svg>
            </TbBtn>
            {panel === 'more' && (
              <Popover wide anchor="right">
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
                      boxShadow: WB_PANEL.shadow,
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
        )}
      </div>
    </div>
    </FormatToolbarProvider>
  );
};

function AlignToolbarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <line x1="4" y1="18" x2="17" y2="18" />
    </svg>
  );
}

function FontSizePanel({
  fontSize,
  onPatch,
}: {
  fontSize: number;
  onPatch: (patch: TextFormatPatch, recordHistory?: boolean) => void;
}) {
  return (
    <Popover width={200} anchor="center">
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 6,
      }}>
        {SHAPE_FONT_SIZES.map(size => (
          <button
            key={size}
            type="button"
            onClick={() => onPatch({ fontSize: size }, true)}
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
  );
}
