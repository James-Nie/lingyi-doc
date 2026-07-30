import React from 'react';
import type { ConnectorElement, PenElement, SectionElement, ShapeElement, StickyElement, TableElement, TextElement, WhiteboardElement, WhiteboardPoint } from '@lingyi-doc/core-whiteboard';
import { connectorPathD } from '@lingyi-doc/core-whiteboard';
import { WB_COLORS } from './styles';

interface BoardElementViewProps {
  element: WhiteboardElement;
  selected: boolean;
  hovered?: boolean;
  readOnly?: boolean;
  selectMode?: boolean;
  /** 连接线解析后的端点（含锚点绑定） */
  connectorPoints?: [WhiteboardPoint, WhiteboardPoint];
  onPointerDown?: (e: React.PointerEvent) => void;
  onTextChange?: (id: string, text: string) => void;
  onCellChange?: (id: string, row: number, col: number, value: string) => void;
}

/**
 * 绘制形状元素
 * @param param0 形状元素
 * @param param0.el 形状元素
 * @returns 形状元素的视图
 */
function ShapeView({ el }: { el: ShapeElement }) {
  const common: React.CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    padding: 8,
    fontSize: el.fontSize ?? 14,
    color: '#1f2329',
    textAlign: 'center',
    wordBreak: 'break-word',
  };

  switch (el.shapeKind) {
    // 椭圆
    case 'ellipse':
      return (
        <div style={{
          ...common,
          borderRadius: 9999,
          background: el.fill,
          border: `${el.strokeWidth}px solid ${el.stroke}`,
        }}>
          {el.text}
        </div>
      );
    // 钻石形
    case 'diamond':
      return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          <div style={{
            position: 'absolute',
            inset: '15%',
            transform: 'rotate(45deg)',
            background: el.fill,
            border: `${el.strokeWidth}px solid ${el.stroke}`,
          }} />
          <div style={{ ...common, position: 'relative', zIndex: 1 }}>{el.text}</div>
        </div>
      );
    // 圆角矩形
    case 'roundRect':
      return (
        <div style={{
          ...common,
          borderRadius: 12,
          background: el.fill,
          border: `${el.strokeWidth}px solid ${el.stroke}`,
        }}>
          {el.text}
        </div>
      );
    // 三角形
    case 'triangle':
      return (
        <svg width="100%" height="100%" viewBox="0 0 100 80" preserveAspectRatio="none">
          <polygon points="50,4 96,76 4,76" fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} />
          {el.text && (
            <text x="50" y="52" textAnchor="middle" fontSize="12" fill="#1f2329">{el.text}</text>
          )}
        </svg>
      );
    // 气泡
    case 'speechBubble':
      return (
        <div style={{
          ...common,
          borderRadius: 8,
          background: el.fill,
          border: `${el.strokeWidth}px solid ${el.stroke}`,
          position: 'relative',
        }}>
          {el.text}
          <div style={{
            position: 'absolute',
            bottom: -8,
            left: 20,
            width: 0,
            height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: `8px solid ${el.stroke}`,
          }} />
        </div>
      );
    default:
      return (
        <div style={{
          ...common,
          borderRadius: el.shapeKind === 'process' ? 20 : 4,
          background: el.fill,
          border: `${el.strokeWidth}px solid ${el.stroke}`,
        }}>
          {el.text}
        </div>
      );
  }
}

export const BoardElementView: React.FC<BoardElementViewProps> = ({
  element: el,
  selected,
  hovered = false,
  readOnly,
  selectMode = false,
  connectorPoints,
  onPointerDown,
  onTextChange,
  onCellChange,
}) => {
  const hoverRing = hovered && !selected
    ? { boxShadow: `0 0 0 2px ${WB_COLORS.accent}55` }
    : undefined;
  const selectRing = selected
    ? { boxShadow: `0 0 0 2px ${WB_COLORS.selectBorder}` }
    : undefined;

  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: el.x,
    top: el.y,
    width: el.width,
    height: el.height,
    zIndex: el.zIndex,
    cursor: readOnly ? 'default' : selectMode ? 'move' : 'default',
    boxSizing: 'border-box',
    ...hoverRing,
    ...selectRing,
  };

  if (el.type === 'connector') {
    const conn = el as ConnectorElement;
    const [a, b] = connectorPoints ?? [conn.points[0], conn.points[1]];
    if (!a || !b) return null;
    const xs = [a.x, b.x];
    const ys = [a.y, b.y];
    const pad = 16;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const maxX = Math.max(...xs) + pad;
    const maxY = Math.max(...ys) + pad;
    const pathD = connectorPathD(conn.style, a, b);
    return (
      <svg
        onPointerDown={onPointerDown}
        style={{
          position: 'absolute',
          left: minX,
          top: minY,
          width: maxX - minX,
          height: maxY - minY,
          zIndex: el.zIndex,
          overflow: 'visible',
          pointerEvents: selectMode && !readOnly ? 'auto' : 'none',
          ...hoverRing,
        }}
      >
        <path
          d={pathD}
          fill="none"
          stroke="transparent"
          strokeWidth={14}
          transform={`translate(${-minX}, ${-minY})`}
          style={{ cursor: selectMode ? 'pointer' : 'default' }}
        />
        <path
          d={pathD}
          fill="none"
          stroke={conn.stroke}
          strokeWidth={conn.strokeWidth}
          transform={`translate(${-minX}, ${-minY})`}
          markerEnd={conn.arrowEnd ? 'url(#wb-arrow)' : undefined}
          style={{ pointerEvents: 'none' }}
        />
        {selected && (
          <path
            d={pathD}
            fill="none"
            stroke={WB_COLORS.selectBorder}
            strokeWidth={conn.strokeWidth + 4}
            opacity={0.35}
            transform={`translate(${-minX}, ${-minY})`}
            style={{ pointerEvents: 'none' }}
          />
        )}
      </svg>
    );
  }

  if (el.type === 'pen') {
    const pen = el as PenElement;
    if (pen.points.length < 2) return null;
    const xs = pen.points.map(p => p.x);
    const ys = pen.points.map(p => p.y);
    const pad = Math.max(pen.strokeWidth, 8);
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const d = pen.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x - minX} ${p.y - minY}`).join(' ');
    return (
      <svg
        onPointerDown={onPointerDown}
        style={{
          position: 'absolute',
          left: minX,
          top: minY,
          width: Math.max(...xs) - minX + pad * 2,
          height: Math.max(...ys) - minY + pad * 2,
          zIndex: el.zIndex,
          overflow: 'visible',
          pointerEvents: readOnly || !selectMode ? 'none' : 'auto',
          ...hoverRing,
        }}
      >
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(pen.strokeWidth + 10, 14)}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ cursor: selectMode ? 'pointer' : 'default' }}
        />
        <path
          d={d}
          fill="none"
          stroke={pen.mode === 'highlighter' ? `${pen.color}88` : pen.color}
          strokeWidth={pen.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: 'none' }}
        />
        {selected && (
          <path
            d={d}
            fill="none"
            stroke={WB_COLORS.selectBorder}
            strokeWidth={pen.strokeWidth + 6}
            opacity={0.35}
            strokeLinecap="round"
            style={{ pointerEvents: 'none' }}
          />
        )}
      </svg>
    );
  }

  let content: React.ReactNode = null;

  switch (el.type) {
    case 'shape':
      content = <ShapeView el={el as ShapeElement} />;
      break;
    case 'text': {
      const t = el as TextElement;
      content = readOnly ? (
        <div style={{ fontSize: t.fontSize, color: t.color, fontWeight: t.fontWeight, whiteSpace: 'pre-wrap' }}>{t.text}</div>
      ) : (
        <textarea
          value={t.text}
          onChange={e => onTextChange?.(el.id, e.target.value)}
          onMouseDown={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            outline: 'none',
            resize: 'none',
            background: 'transparent',
            fontSize: t.fontSize,
            color: t.color,
            fontWeight: t.fontWeight,
            fontFamily: 'inherit',
          }}
        />
      );
      break;
    }
    case 'sticky': {
      const s = el as StickyElement;
      const stickyFontSize = s.fontSize ?? 14;
      const stickyTextColor = s.textColor ?? '#1f2329';
      const stickyAlign = s.textAlign ?? 'left';
      const stickyVAlign = s.textVerticalAlign ?? 'top';
      const stickyWeight = s.fontWeight ?? 400;
      const stickyStyle = s.fontStyle ?? 'normal';
      const stickyDecoration = [
        s.textUnderline ? 'underline' : '',
        s.textLineThrough ? 'line-through' : '',
      ].filter(Boolean).join(' ') || undefined;
      content = readOnly ? (
        <div style={{
          padding: 12,
          fontSize: stickyFontSize,
          color: stickyTextColor,
          fontWeight: stickyWeight,
          fontStyle: stickyStyle,
          textAlign: stickyAlign,
          textDecoration: stickyDecoration,
          background: s.textHighlight,
          whiteSpace: 'pre-wrap',
          boxSizing: 'border-box',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: stickyVAlign === 'center' ? 'center' : stickyVAlign === 'bottom' ? 'flex-end' : 'flex-start',
        }}>{s.text}</div>
      ) : (
        <textarea
          value={s.text}
          placeholder="便签"
          onChange={e => onTextChange?.(el.id, e.target.value)}
          onMouseDown={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            outline: 'none',
            resize: 'none',
            background: s.textHighlight ?? 'transparent',
            padding: 12,
            fontSize: stickyFontSize,
            color: stickyTextColor,
            fontWeight: stickyWeight,
            fontStyle: stickyStyle,
            textAlign: stickyAlign,
            textDecoration: stickyDecoration,
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
      );
      break;
    }
    case 'section': {
      const sec = el as SectionElement;
      content = (
        <div style={{
          width: '100%',
          height: '100%',
          background: sec.fill,
          border: `2px dashed ${sec.stroke}`,
          borderRadius: 4,
          boxSizing: 'border-box',
        }}>
          <div style={{ padding: '8px 12px', fontSize: 12, color: WB_COLORS.muted, fontWeight: 500 }}>{sec.title}</div>
        </div>
      );
      break;
    }
    case 'table': {
      const tbl = el as TableElement;
      content = (
        <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <tbody>
            {tbl.cells.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ border: '1px solid #dee0e3', padding: 0 }}>
                    <input
                      value={cell}
                      readOnly={readOnly}
                      onChange={e => onCellChange?.(el.id, ri, ci, e.target.value)}
                      onMouseDown={e => e.stopPropagation()}
                      onPointerDown={e => e.stopPropagation()}
                      style={{
                        width: '100%',
                        height: 32,
                        border: 'none',
                        outline: 'none',
                        padding: '0 6px',
                        fontSize: 12,
                        boxSizing: 'border-box',
                        background: 'transparent',
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
      break;
    }
    case 'image':
      content = (
        <img
          src={(el as { src: string }).src}
          alt=""
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
        />
      );
      break;
    default:
      content = null;
  }

  const bg = el.type === 'sticky' ? (el as StickyElement).color : 'transparent';

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (readOnly || (el.type !== 'text' && el.type !== 'sticky')) return;
    e.stopPropagation();
    const ta = (e.currentTarget as HTMLElement).querySelector('textarea');
    ta?.focus();
    ta?.select();
  };

  return (
    <div
      onDoubleClick={handleDoubleClick}
      onPointerDown={onPointerDown}
      style={{
        ...wrapperStyle,
        background: bg,
      }}
    >
      {content}
    </div>
  );
};
