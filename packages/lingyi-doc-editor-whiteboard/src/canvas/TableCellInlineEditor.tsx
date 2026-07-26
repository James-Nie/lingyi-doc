import React, { useEffect, useRef } from 'react';
import { resolveTableCellStyle, type TableElement } from '@lingyi-doc/core-whiteboard';
import { computeShapeEditorPaddingTop } from './shapeTextStyle';

interface TableCellInlineEditorProps {
  table: TableElement;
  row: number;
  col: number;
  viewport: { x: number; y: number; zoom: number };
  bounds: { x: number; y: number; w: number; h: number };
  onChange: (text: string) => void;
  onClose: () => void;
}

const TABLE_CELL_TEXT_PAD = 6;
const TABLE_CELL_LINE_HEIGHT = 1.35;

/** 画板表格单元格 DOM 编辑浮层（与 canvas 预览态对齐：默认水平/垂直居中） */
export const TableCellInlineEditor: React.FC<TableCellInlineEditorProps> = ({
  table,
  row,
  col,
  viewport,
  bounds,
  onChange,
  onClose,
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ignoreBlurRef = useRef(true);
  const text = table.cells[row]?.[col] ?? '';
  const style = resolveTableCellStyle(table, row, col);
  const fontSizeWorld = style.fontSize ?? 14;
  const fontSize = fontSizeWorld * viewport.zoom;
  const color = style.color ?? '#1f2329';
  const textAlign = style.textAlign ?? 'center';
  const textVerticalAlign = style.textVerticalAlign ?? 'center';
  const fontWeight = style.fontWeight ?? 400;
  const fontStyle = style.fontStyle ?? 'normal';
  const fill = style.fill ?? '#ffffff';
  const isVertical = style.textOrientation === 'vertical';

  const lineHeightWorld = fontSizeWorld * TABLE_CELL_LINE_HEIGHT;
  const lineCount = Math.max(1, text.split('\n').length);
  const totalHWorld = lineCount * lineHeightWorld;
  const paddingTopWorld = isVertical
    ? TABLE_CELL_TEXT_PAD
    : computeShapeEditorPaddingTop(
      bounds.h,
      totalHWorld,
      textVerticalAlign,
      TABLE_CELL_TEXT_PAD,
    );
  const padX = TABLE_CELL_TEXT_PAD * viewport.zoom;
  const padTop = Math.max(0, paddingTopWorld) * viewport.zoom;
  const padBottom = TABLE_CELL_TEXT_PAD * viewport.zoom;

  useEffect(() => {
    ignoreBlurRef.current = true;
    const focusInput = () => {
      const input = ref.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      const len = input.value.length;
      input.setSelectionRange(len, len);
      window.setTimeout(() => {
        ignoreBlurRef.current = false;
      }, 120);
    };
    const raf = window.requestAnimationFrame(() => {
      focusInput();
      window.requestAnimationFrame(focusInput);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [table.id, row, col]);

  const left = viewport.x + bounds.x * viewport.zoom;
  const top = viewport.y + bounds.y * viewport.zoom;
  const width = bounds.w * viewport.zoom;
  const height = bounds.h * viewport.zoom;

  return (
    <div
      data-wb-inline-editor
      data-wb-lock-id={table.id}
      data-wb-lock-row={row}
      data-wb-lock-col={col}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        zIndex: 10080,
        pointerEvents: 'auto',
        boxSizing: 'border-box',
        display: isVertical ? 'flex' : 'block',
        alignItems: isVertical ? 'center' : undefined,
        justifyContent: isVertical ? 'center' : undefined,
        background: fill,
      }}
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <textarea
        ref={ref}
        defaultValue={text}
        placeholder="输入文本"
        onChange={e => onChange(e.target.value)}
        onBlur={() => {
          if (ignoreBlurRef.current) return;
          onClose();
        }}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose();
          e.stopPropagation();
        }}
        style={{
          width: isVertical ? 'auto' : '100%',
          height: isVertical ? '100%' : '100%',
          maxWidth: '100%',
          margin: 0,
          padding: isVertical ? `${padTop}px 2px` : `${padTop}px ${padX}px ${padBottom}px`,
          border: 'none',
          outline: 'none',
          resize: 'none',
          background: 'transparent',
          fontSize,
          fontWeight,
          fontStyle,
          color,
          textAlign: isVertical ? 'center' : textAlign,
          lineHeight: isVertical ? 1.15 : TABLE_CELL_LINE_HEIGHT,
          overflow: 'hidden',
          boxSizing: 'border-box',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          writingMode: isVertical ? 'vertical-rl' : undefined,
          textOrientation: isVertical ? 'mixed' : undefined,
        }}
      />
    </div>
  );
};
