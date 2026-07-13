import React, { useCallback, useRef, useState } from 'react';
import type { TableElement } from '@lingyi-doc/core';
import {
  TABLE_GUTTER,
  getTableDimensions,
  hitTableColInsert,
  hitTableRowInsert,
} from '@lingyi-doc/core';
import { WB_COLORS } from '../styles';

interface TableCanvasOverlayProps {
  table: TableElement;
  viewport: { x: number; y: number; zoom: number };
  readOnly?: boolean;
  onInsertRow: (at: number) => void;
  onInsertCol: (at: number) => void;
}

function InsertPlusButton({
  left,
  top,
  label,
  onClick,
}: {
  left: number;
  top: number;
  label: string;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{ position: 'absolute', left, top, transform: 'translate(-50%, -50%)', zIndex: 2 }}
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      {hover && (
        <div style={{
          position: 'absolute',
          left: '50%',
          bottom: '100%',
          transform: 'translateX(-50%)',
          marginBottom: 6,
          background: '#1f2329',
          color: '#fff',
          fontSize: 12,
          padding: '4px 8px',
          borderRadius: 4,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {label}
          <span style={{
            position: 'absolute',
            left: '50%',
            bottom: -4,
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: '4px solid #1f2329',
          }} />
        </div>
      )}
      <button
        type="button"
        title={label}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={onClick}
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: 'none',
          background: WB_COLORS.accent,
          color: '#fff',
          fontSize: 16,
          lineHeight: 1,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          boxShadow: '0 1px 4px rgba(51,112,255,0.35)',
        }}
      >
        +
      </button>
    </div>
  );
}

/** 表格行列插入引导层（顶/左控制条 + 插入线） */
export const TableCanvasOverlay: React.FC<TableCanvasOverlayProps> = ({
  table,
  viewport,
  readOnly = false,
  onInsertRow,
  onInsertCol,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [insertHint, setInsertHint] = useState<{ axis: 'row' | 'col'; index: number } | null>(null);

  const z = viewport.zoom;
  const gutter = TABLE_GUTTER * z;
  const left = viewport.x + table.x * z - gutter;
  const top = viewport.y + table.y * z - gutter;
  const width = table.width * z + gutter;
  const height = table.height * z + gutter;
  const { rows, cols, cellW, cellH } = getTableDimensions(table);
  const cellWs = cellW * z;
  const cellHs = cellH * z;

  const canvasPointFromEvent = useCallback((clientX: number, clientY: number) => {
    const root = rootRef.current?.parentElement;
    if (!root) return null;
    const rect = root.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: (sx - viewport.x) / viewport.zoom,
      y: (sy - viewport.y) / viewport.zoom,
    };
  }, [viewport.x, viewport.y, viewport.zoom]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (readOnly) {
      setInsertHint(null);
      return;
    }
    const pt = canvasPointFromEvent(e.clientX, e.clientY);
    if (!pt) return;
    const colAt = hitTableColInsert(table, pt);
    if (colAt != null) {
      setInsertHint({ axis: 'col', index: colAt });
      return;
    }
    const rowAt = hitTableRowInsert(table, pt);
    if (rowAt != null) {
      setInsertHint({ axis: 'row', index: rowAt });
      return;
    }
    setInsertHint(null);
  }, [canvasPointFromEvent, readOnly, table]);

  const renderGutterDots = (count: number, axis: 'row' | 'col') => {
    const dots: React.ReactNode[] = [];
    for (let i = 0; i < count; i++) {
      const cx = axis === 'col'
        ? gutter + i * cellWs + cellWs / 2
        : gutter / 2;
      const cy = axis === 'row'
        ? gutter + i * cellHs + cellHs / 2
        : gutter / 2;
      dots.push(
        <span
          key={`${axis}-${i}`}
          style={{
            position: 'absolute',
            left: cx - 2,
            top: cy - 2,
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: '#c9cdd4',
            pointerEvents: 'none',
          }}
        />,
      );
    }
    return dots;
  };

  return (
    <div
      ref={rootRef}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        pointerEvents: readOnly ? 'none' : 'auto',
        zIndex: 10060,
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setInsertHint(null)}
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* 左上角拖拽区占位（与选区手柄对齐） */}
      <div style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: gutter,
        height: gutter,
        background: '#f5f6f7',
        borderRight: `1px solid ${WB_COLORS.border}`,
        borderBottom: `1px solid ${WB_COLORS.border}`,
        borderTopLeftRadius: 4,
        pointerEvents: 'none',
      }} />

      {/* 顶栏：列控制 */}
      <div style={{
        position: 'absolute',
        left: gutter,
        top: 0,
        width: table.width * z,
        height: gutter,
        background: '#f5f6f7',
        borderBottom: `1px solid ${WB_COLORS.border}`,
        borderTopRightRadius: 4,
      }}>
        {renderGutterDots(cols, 'col')}
      </div>

      {/* 左栏：行控制 */}
      <div style={{
        position: 'absolute',
        left: 0,
        top: gutter,
        width: gutter,
        height: table.height * z,
        background: '#f5f6f7',
        borderRight: `1px solid ${WB_COLORS.border}`,
        borderBottomLeftRadius: 4,
      }}>
        {renderGutterDots(rows, 'row')}
      </div>

      {insertHint?.axis === 'col' && (
        <>
          <div style={{
            position: 'absolute',
            left: gutter + insertHint.index * cellWs,
            top: 0,
            width: 2,
            height: table.height * z + gutter,
            background: WB_COLORS.accent,
            transform: 'translateX(-1px)',
            pointerEvents: 'none',
          }} />
          <InsertPlusButton
            left={gutter + insertHint.index * cellWs}
            top={gutter / 2}
            label="插入列"
            onClick={() => onInsertCol(insertHint.index)}
          />
        </>
      )}

      {insertHint?.axis === 'row' && (
        <>
          <div style={{
            position: 'absolute',
            left: 0,
            top: gutter + insertHint.index * cellHs,
            width: table.width * z + gutter,
            height: 2,
            background: WB_COLORS.accent,
            transform: 'translateY(-1px)',
            pointerEvents: 'none',
          }} />
          <InsertPlusButton
            left={gutter / 2}
            top={gutter + insertHint.index * cellHs}
            label="插入行"
            onClick={() => onInsertRow(insertHint.index)}
          />
        </>
      )}
    </div>
  );
};
