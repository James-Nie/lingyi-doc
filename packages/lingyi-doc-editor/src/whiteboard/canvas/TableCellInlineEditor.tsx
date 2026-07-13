import React, { useEffect, useRef } from 'react';
import type { TableElement } from '@lingyi-doc/core';

interface TableCellInlineEditorProps {
  table: TableElement;
  row: number;
  col: number;
  viewport: { x: number; y: number; zoom: number };
  bounds: { x: number; y: number; w: number; h: number };
  onChange: (text: string) => void;
  onClose: () => void;
}

/** 画板表格单元格 DOM 编辑浮层 */
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
  const fontSize = (table.fontSize ?? 14) * viewport.zoom;

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
        display: 'flex',
        alignItems: 'center',
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
          width: '100%',
          height: '100%',
          margin: 0,
          padding: '0 6px',
          border: 'none',
          outline: 'none',
          resize: 'none',
          background: 'transparent',
          fontSize,
          fontWeight: table.fontWeight ?? 400,
          fontStyle: table.fontStyle ?? 'normal',
          color: table.color ?? '#1f2329',
          textAlign: table.textAlign ?? 'left',
          lineHeight: 1.4,
          boxSizing: 'border-box',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      />
    </div>
  );
};
