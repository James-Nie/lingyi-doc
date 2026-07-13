import React, { useMemo, useState } from 'react';
import type { ShapeElement, ShapeKind, TableElement, TextElement } from '@lingyi-doc/core';
import { getShapeRegistry } from '@lingyi-doc/core';
import { ShapeIcon } from './ShapeIcon';
import { TextStylePanel, type TextStylePatch } from './TextStylePanel';
import { WB_COLORS, WB_PANEL, WB_Z_INDEX } from './styles';

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
  onAddComment?: () => void;
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
);

const FILL_SWATCHES = [
  '#e8f0fe', '#ede7f6', '#fce4ec', '#fff9c4', '#c8e6c9', '#b2dfdb', '#ffffff', '#f5f6f7',
];

const STROKE_SWATCHES = [
  '#3370ff', '#1f2329', '#ea4335', '#f9ab00', '#34a853', '#8f959e', '#ffffff',
];

const HIGHLIGHT_SWATCHES = [
  '#fff176', '#cfd8dc', '#ffcdd2', '#c8e6c9', '#bbdefb', 'transparent',
];

const TEXT_COLOR_SWATCHES = [
  '#1f2329', '#3370ff', '#ea4335', '#f9ab00', '#34a853', '#8f959e', '#ffffff',
];

type Panel = 'shape' | 'fill' | 'stroke' | 'fontSize' | 'textColor' | 'text' | null;

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
  const { anchorX, anchorY, placement = 'above', onAddComment } = props;
  const isText = props.variant === 'text';
  const isTable = props.variant === 'table';
  const textElement = isText ? props.element : null;
  const tableElement = isTable ? props.element : null;
  const shapeElement = !isText && !isTable ? props.element : null;
  const [panel, setPanel] = useState<Panel>(null);
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
    props.onPatch(patch as Partial<ShapeElement>, recordHistory);
  };

  const applyShapeOnlyPatch = (patch: Partial<ShapeElement>, recordHistory?: boolean) => {
    if (isText || isTable || !shapeElement) return;
    props.onPatch(patch, recordHistory);
  };

  const applyTableStylePatch = (patch: Partial<TableElement>, recordHistory?: boolean) => {
    if (!isTable) return;
    props.onPatch(patch, recordHistory);
  };

  const fontSize = textElement
    ? textElement.fontSize
    : tableElement
      ? (tableElement.fontSize ?? 14)
      : (shapeElement!.fontSize ?? 14);
  const textColor = textElement
    ? textElement.color
    : tableElement
      ? (tableElement.color ?? '#1f2329')
      : (shapeElement!.textColor ?? '#1f2329');
  const textHighlight = textElement
    ? textElement.textHighlight
    : tableElement
      ? tableElement.textHighlight
      : shapeElement!.textHighlight;
  const textAlign = textElement
    ? (textElement.textAlign ?? 'left')
    : tableElement
      ? (tableElement.textAlign ?? 'left')
      : (shapeElement!.textAlign ?? 'center');
  const textVerticalAlign = textElement
    ? (textElement.textVerticalAlign ?? 'top')
    : tableElement
      ? (tableElement.textVerticalAlign ?? 'center')
      : (shapeElement!.textVerticalAlign ?? 'center');
  const fontWeight = (textElement?.fontWeight ?? tableElement?.fontWeight ?? shapeElement?.fontWeight) ?? 400;
  const fontStyle = textElement?.fontStyle ?? tableElement?.fontStyle ?? shapeElement?.fontStyle;
  const textUnderline = textElement?.textUnderline ?? tableElement?.textUnderline ?? shapeElement?.textUnderline;
  const textLineThrough = textElement?.textLineThrough ?? tableElement?.textLineThrough ?? shapeElement?.textLineThrough;
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

  return (
    <div
      style={{
        position: 'absolute',
        left: anchorX,
        top: anchorY,
        transform: placement === 'below'
          ? 'translate(-50%, 8px)'
          : 'translate(-50%, calc(-100% - 8px))',
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
        {!isText && !isTable && shapeElement && (
          <>
            <Wrap>
              <TbBtn active={panel === 'shape'} onClick={() => toggle('shape')} title="更改图形">
                <ShapeIcon kind={shapeElement.shapeKind} />
                <Chevron />
              </TbBtn>
              {panel === 'shape' && (
                <Popover wide>
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

            <Divider />

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
                <Popover>
                  <Swatches
                    colors={FILL_SWATCHES}
                    value={shapeElement.fill}
                    onPick={c => { applyShapeOnlyPatch({ fill: c }, true); setPanel(null); }}
                  />
                  <input
                    type="color"
                    value={shapeElement.fill}
                    onChange={e => applyShapeOnlyPatch({ fill: e.target.value }, false)}
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
                  border: `${Math.min(shapeElement.strokeWidth, 4)}px solid ${shapeElement.stroke}`,
                  display: 'inline-block',
                  boxSizing: 'border-box',
                }} />
                <Chevron />
              </TbBtn>
              {panel === 'stroke' && (
                <Popover>
                  <Swatches
                    colors={STROKE_SWATCHES}
                    value={shapeElement.stroke}
                    onPick={c => { applyShapeOnlyPatch({ stroke: c }, true); setPanel(null); }}
                  />
                  <div style={{ marginTop: 10, fontSize: 12, color: WB_COLORS.muted }}>粗细</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    {[1, 2, 3, 4, 6].map(w => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => applyShapeOnlyPatch({ strokeWidth: w }, true)}
                        style={{
                          flex: 1,
                          height: 32,
                          border: shapeElement.strokeWidth === w ? `2px solid ${WB_COLORS.accent}` : `1px solid ${WB_COLORS.border}`,
                          borderRadius: 6,
                          background: '#fff',
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </Popover>
              )}
            </Wrap>

            <Divider />
          </>
        )}

        {isTable && tableElement && (
          <>
            <Wrap>
              <TbBtn title="表格" onClick={() => {}}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 22,
                  height: 22,
                  border: `1px solid ${WB_COLORS.border}`,
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 600,
                }}>
                  T
                </span>
              </TbBtn>
            </Wrap>
            <Divider />
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
                <Popover>
                  <Swatches
                    colors={FILL_SWATCHES}
                    value={tableElement.fill ?? '#ffffff'}
                    onPick={c => { applyTableStylePatch({ fill: c }, true); setPanel(null); }}
                  />
                  <input
                    type="color"
                    value={tableElement.fill ?? '#ffffff'}
                    onChange={e => applyTableStylePatch({ fill: e.target.value }, false)}
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
                  border: `2px solid ${tableElement.stroke ?? '#dee0e3'}`,
                  display: 'inline-block',
                  boxSizing: 'border-box',
                }} />
                <Chevron />
              </TbBtn>
              {panel === 'stroke' && (
                <Popover>
                  <Swatches
                    colors={STROKE_SWATCHES}
                    value={tableElement.stroke ?? '#dee0e3'}
                    onPick={c => { applyTableStylePatch({ stroke: c }, true); setPanel(null); }}
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
            <FontSizePanel fontSize={fontSize} onPatch={applyTextPatch} />
          )}
        </Wrap>

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
            <TextColorPanel
              textColor={textColor}
              textHighlight={textHighlight}
              onPatch={applyTextPatch}
            />
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

        <TbBtn title="更多" onClick={() => {}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
          </svg>
        </TbBtn>
      </div>
    </div>
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
  wide,
  anchor = 'left',
  width,
}: {
  children: React.ReactNode;
  wide?: boolean;
  anchor?: 'left' | 'center';
  width?: number;
}) {
  return (
    <div style={{
      position: 'absolute',
      bottom: 'calc(100% + 8px)',
      left: anchor === 'center' ? '50%' : 0,
      transform: anchor === 'center' ? 'translateX(-50%)' : undefined,
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

function PanelSection({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 0 : 12 }}>
      <div style={{ fontSize: 12, color: WB_COLORS.muted, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
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
    <Popover width={200}>
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
  );
}

function TextColorPanel({
  textColor,
  textHighlight,
  onPatch,
}: {
  textColor: string;
  textHighlight?: string;
  onPatch: (patch: TextFormatPatch, recordHistory?: boolean) => void;
}) {
  return (
    <Popover width={168}>
      <PanelSection label="文字颜色">
        <Swatches
          colors={TEXT_COLOR_SWATCHES}
          value={textColor}
          onPick={c => onPatch({ textColor: c }, true)}
        />
        <input
          type="color"
          value={textColor}
          onChange={e => onPatch({ textColor: e.target.value }, false)}
          style={{ width: '100%', height: 28, marginTop: 8, border: 'none', cursor: 'pointer' }}
        />
      </PanelSection>
      <PanelSection label="文字背景" last>
        <Swatches
          colors={HIGHLIGHT_SWATCHES}
          value={textHighlight ?? 'transparent'}
          onPick={c => onPatch({ textHighlight: c === 'transparent' ? undefined : c }, true)}
        />
      </PanelSection>
    </Popover>
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
