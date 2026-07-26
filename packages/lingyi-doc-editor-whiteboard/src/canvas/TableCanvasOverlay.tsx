import React, { useCallback, useRef, useState } from 'react';
import type { TableElement } from '@lingyi-doc/core-whiteboard';
import { TABLE_GUTTER, getTableColCount, getTableColOffsets, getTableColWidths, getTableRowCount, getTableRowHeights, getTableRowOffsets, hitTableColInsert, hitTableRowInsert, hitTableColHeader, hitTableRowHeader, tableCellCanvasRect, tableCellRangeCanvasRect, tableColDropIndex, tableRowDropIndex } from '@lingyi-doc/core-whiteboard';
import { WB_COLORS } from '../styles';

export type TableUiSelection =
  | { kind: 'table' }
  | { kind: 'cell'; row: number; col: number }
  | { kind: 'cells'; r0: number; c0: number; r1: number; c1: number }
  | { kind: 'col'; col: number }
  | { kind: 'row'; row: number };

interface TableCanvasOverlayProps {
  table: TableElement;
  viewport: { x: number; y: number; zoom: number };
  readOnly?: boolean;
  uiSelection?: TableUiSelection | null;
  hoverCol?: number | null;
  hoverRow?: number | null;
  hoverCell?: { row: number; col: number } | null;
  onInsertRow: (at: number) => void;
  onInsertCol: (at: number) => void;
  onMoveDragStart?: (e: React.PointerEvent) => void;
  onSelectCol?: (col: number) => void;
  onSelectRow?: (row: number) => void;
  onHoverCol?: (col: number | null) => void;
  onHoverRow?: (row: number | null) => void;
  onReorderCol?: (from: number, to: number) => void;
  onReorderRow?: (from: number, to: number) => void;
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
      style={{
        position: 'absolute',
        left,
        top,
        transform: 'translate(-50%, -50%)',
        zIndex: 2,
        pointerEvents: 'auto',
      }}
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

function GripDotsIcon({ color = '#8f959e', rotate = false }: { color?: string; rotate?: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden
      style={rotate ? { transform: 'rotate(90deg)' } : undefined}
    >
      {[0, 1, 2].map(row => (
        [0, 1].map(col => (
          <circle
            key={`${row}-${col}`}
            cx={3 + col * 6}
            cy={2 + row * 4}
            r="1.2"
            fill={color}
          />
        ))
      ))}
    </svg>
  );
}

const REORDER_THRESHOLD = 4;
const DRAG_OVERLAY_BG = 'rgba(31, 35, 41, 0.12)';

/** 表格行列插入引导 + 列/行选中、hover、拖拽重排 */
export const TableCanvasOverlay: React.FC<TableCanvasOverlayProps> = ({
  table,
  viewport,
  readOnly = false,
  uiSelection = null,
  hoverCol = null,
  hoverRow = null,
  hoverCell = null,
  onInsertRow,
  onInsertCol,
  onMoveDragStart,
  onSelectCol,
  onSelectRow,
  onHoverCol,
  onHoverRow,
  onReorderCol,
  onReorderRow,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [insertHint, setInsertHint] = useState<{ axis: 'row' | 'col'; index: number } | null>(null);
  const [colReorder, setColReorder] = useState<{
    from: number;
    drop: number;
    pointerId: number;
    startX: number;
    active: boolean;
  } | null>(null);
  const [rowReorder, setRowReorder] = useState<{
    from: number;
    drop: number;
    pointerId: number;
    startY: number;
    active: boolean;
  } | null>(null);

  const z = viewport.zoom;
  const gutter = TABLE_GUTTER * z;
  const left = viewport.x + table.x * z - gutter;
  const top = viewport.y + table.y * z - gutter;
  const width = table.width * z + gutter;
  const height = table.height * z + gutter;
  const cols = getTableColCount(table);
  const rows = getTableRowCount(table);
  const colWidthsPx = getTableColWidths(table).map(w => w * z);
  const rowHeightsPx = getTableRowHeights(table).map(h => h * z);
  const colOffsetsPx = getTableColOffsets(table).map(o => o * z);
  const rowOffsetsPx = getTableRowOffsets(table).map(o => o * z);

  const selectedCol = uiSelection?.kind === 'col' ? uiSelection.col : null;
  const selectedCell = uiSelection?.kind === 'cell' ? uiSelection : null;
  const selectedCells = uiSelection?.kind === 'cells' ? uiSelection : null;
  const selectedRow = uiSelection?.kind === 'row' ? uiSelection.row : null;
  const cellRangeHighlight = selectedCell
    ? { r0: selectedCell.row, c0: selectedCell.col, r1: selectedCell.row, c1: selectedCell.col }
    : selectedCells
      ? {
        r0: Math.min(selectedCells.r0, selectedCells.r1),
        c0: Math.min(selectedCells.c0, selectedCells.c1),
        r1: Math.max(selectedCells.r0, selectedCells.r1),
        c1: Math.max(selectedCells.c0, selectedCells.c1),
      }
      : null;
  const draggingCol = colReorder?.active ? colReorder.from : null;
  const draggingRow = rowReorder?.active ? rowReorder.from : null;

  const showHoverCol = hoverCol != null
    && hoverCol !== selectedCol
    && hoverCol !== draggingCol
    && !colReorder?.active;
  const showHoverRow = hoverRow != null
    && hoverRow !== selectedRow
    && hoverRow !== draggingRow
    && !rowReorder?.active;
  const hoverInSelectedRange = hoverCell != null && cellRangeHighlight != null
    && hoverCell.row >= cellRangeHighlight.r0
    && hoverCell.row <= cellRangeHighlight.r1
    && hoverCell.col >= cellRangeHighlight.c0
    && hoverCell.col <= cellRangeHighlight.c1;
  const showHoverCell = hoverCell != null
    && !hoverInSelectedRange
    && !colReorder?.active
    && !rowReorder?.active
    && selectedCol == null
    && selectedRow == null;

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
    if (readOnly || colReorder || rowReorder) {
      if (readOnly) setInsertHint(null);
      return;
    }
    const pt = canvasPointFromEvent(e.clientX, e.clientY);
    if (!pt) return;

    if (pt.y >= table.y - TABLE_GUTTER && pt.y <= table.y
      && pt.x >= table.x && pt.x <= table.x + table.width) {
      onHoverCol?.(hitTableColHeader(table, pt));
      onHoverRow?.(null);
    } else if (pt.x >= table.x - TABLE_GUTTER && pt.x <= table.x
      && pt.y >= table.y && pt.y <= table.y + table.height) {
      onHoverRow?.(hitTableRowHeader(table, pt));
      onHoverCol?.(null);
    }

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
  }, [canvasPointFromEvent, colReorder, onHoverCol, onHoverRow, readOnly, rowReorder, table]);

  const beginColReorder = (col: number, e: React.PointerEvent) => {
    if (readOnly) return;
    e.stopPropagation();
    e.preventDefault();
    onSelectCol?.(col);
    setColReorder({
      from: col,
      drop: col,
      pointerId: e.pointerId,
      startX: e.clientX,
      active: false,
    });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const beginRowReorder = (row: number, e: React.PointerEvent) => {
    if (readOnly) return;
    e.stopPropagation();
    e.preventDefault();
    onSelectRow?.(row);
    setRowReorder({
      from: row,
      drop: row,
      pointerId: e.pointerId,
      startY: e.clientY,
      active: false,
    });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onColReorderMove = (e: React.PointerEvent) => {
    if (!colReorder || e.pointerId !== colReorder.pointerId) return;
    const pt = canvasPointFromEvent(e.clientX, e.clientY);
    if (!pt) return;
    const drop = tableColDropIndex(table, pt.x - table.x);
    const moved = Math.abs(e.clientX - colReorder.startX);
    if (!colReorder.active && moved >= REORDER_THRESHOLD) {
      setColReorder({ ...colReorder, active: true, drop });
      setInsertHint(null);
      return;
    }
    if (colReorder.active) setColReorder({ ...colReorder, drop });
  };

  const onColReorderUp = (e: React.PointerEvent) => {
    if (!colReorder || e.pointerId !== colReorder.pointerId) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }
    if (colReorder.active && onReorderCol && colReorder.drop !== colReorder.from) {
      onReorderCol(colReorder.from, colReorder.drop);
      onSelectCol?.(colReorder.drop);
    } else if (!colReorder.active) {
      onSelectCol?.(colReorder.from);
    }
    setColReorder(null);
  };

  const onRowReorderMove = (e: React.PointerEvent) => {
    if (!rowReorder || e.pointerId !== rowReorder.pointerId) return;
    const pt = canvasPointFromEvent(e.clientX, e.clientY);
    if (!pt) return;
    const drop = tableRowDropIndex(table, pt.y - table.y);
    const moved = Math.abs(e.clientY - rowReorder.startY);
    if (!rowReorder.active && moved >= REORDER_THRESHOLD) {
      setRowReorder({ ...rowReorder, active: true, drop });
      setInsertHint(null);
      return;
    }
    if (rowReorder.active) setRowReorder({ ...rowReorder, drop });
  };

  const onRowReorderUp = (e: React.PointerEvent) => {
    if (!rowReorder || e.pointerId !== rowReorder.pointerId) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }
    if (rowReorder.active && onReorderRow && rowReorder.drop !== rowReorder.from) {
      onReorderRow(rowReorder.from, rowReorder.drop);
      onSelectRow?.(rowReorder.drop);
    } else if (!rowReorder.active) {
      onSelectRow?.(rowReorder.from);
    }
    setRowReorder(null);
  };

  // 插入线：落点线（整列表高 / 整行表宽）
  const dropColLineLeft = colReorder?.active
    ? gutter + (colReorder.drop <= colReorder.from
      ? colOffsetsPx[colReorder.drop]
      : colOffsetsPx[colReorder.drop] + colWidthsPx[colReorder.drop])
    : null;
  const dropRowLineTop = rowReorder?.active
    ? gutter + (rowReorder.drop <= rowReorder.from
      ? rowOffsetsPx[rowReorder.drop]
      : rowOffsetsPx[rowReorder.drop] + rowHeightsPx[rowReorder.drop])
    : null;

  return (
    <div
      ref={rootRef}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        pointerEvents: 'none',
        zIndex: 10060,
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => {
        if (!colReorder && !rowReorder) {
          setInsertHint(null);
          onHoverCol?.(null);
          onHoverRow?.(null);
        }
      }}
    >
      {/* 列 hover */}
      {showHoverCol && hoverCol != null && (
        <div style={{
          position: 'absolute',
          left: gutter + colOffsetsPx[hoverCol],
          top: gutter,
          width: colWidthsPx[hoverCol],
          height: table.height * z,
          border: `1.5px solid ${WB_COLORS.accent}99`,
          boxSizing: 'border-box',
          pointerEvents: 'none',
          zIndex: 1,
        }} />
      )}

      {/* 行 hover */}
      {showHoverRow && hoverRow != null && (
        <div style={{
          position: 'absolute',
          left: gutter,
          top: gutter + rowOffsetsPx[hoverRow],
          width: table.width * z,
          height: rowHeightsPx[hoverRow],
          border: `1.5px solid ${WB_COLORS.accent}99`,
          boxSizing: 'border-box',
          pointerEvents: 'none',
          zIndex: 1,
        }} />
      )}

      {/* 选中后：单元格 hover（颜色与未选中整表 hover 一致） */}
      {showHoverCell && hoverCell != null && (() => {
        const rect = tableCellCanvasRect(table, hoverCell.row, hoverCell.col);
        return (
          <div style={{
            position: 'absolute',
            left: gutter + (rect.x - table.x) * z,
            top: gutter + (rect.y - table.y) * z,
            width: rect.w * z,
            height: rect.h * z,
            border: `2px solid ${WB_COLORS.tableHoverBorder}`,
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: 2,
          }} />
        );
      })()}

      {/* 列选中描边（拖拽中改为灰遮罩） */}
      {selectedCol != null && !colReorder?.active && (
        <div style={{
          position: 'absolute',
          left: gutter + colOffsetsPx[selectedCol],
          top: gutter,
          width: colWidthsPx[selectedCol],
          height: table.height * z,
          border: `2px solid ${WB_COLORS.accent}`,
          boxSizing: 'border-box',
          pointerEvents: 'none',
          zIndex: 1,
        }} />
      )}

      {/* 行选中描边 */}
      {selectedRow != null && !rowReorder?.active && (
        <div style={{
          position: 'absolute',
          left: gutter,
          top: gutter + rowOffsetsPx[selectedRow],
          width: table.width * z,
          height: rowHeightsPx[selectedRow],
          border: `2px solid ${WB_COLORS.accent}`,
          boxSizing: 'border-box',
          pointerEvents: 'none',
          zIndex: 1,
        }} />
      )}

      {/* 拖拽中：灰色半透明遮罩覆盖源列 */}
      {colReorder?.active && (
        <div style={{
          position: 'absolute',
          left: gutter + colOffsetsPx[colReorder.from],
          top: gutter,
          width: colWidthsPx[colReorder.from],
          height: table.height * z,
          background: DRAG_OVERLAY_BG,
          pointerEvents: 'none',
          zIndex: 3,
        }} />
      )}

      {/* 拖拽中：灰色半透明遮罩覆盖源行 */}
      {rowReorder?.active && (
        <div style={{
          position: 'absolute',
          left: gutter,
          top: gutter + rowOffsetsPx[rowReorder.from],
          width: table.width * z,
          height: rowHeightsPx[rowReorder.from],
          background: DRAG_OVERLAY_BG,
          pointerEvents: 'none',
          zIndex: 3,
        }} />
      )}

      {/* 列落点蓝线 */}
      {dropColLineLeft != null && (
        <div style={{
          position: 'absolute',
          left: dropColLineLeft,
          top: gutter,
          width: 3,
          height: table.height * z,
          background: WB_COLORS.accent,
          transform: 'translateX(-1.5px)',
          borderRadius: 1.5,
          pointerEvents: 'none',
          zIndex: 5,
        }} />
      )}

      {/* 行落点蓝线 */}
      {dropRowLineTop != null && (
        <div style={{
          position: 'absolute',
          left: gutter,
          top: dropRowLineTop,
          width: table.width * z,
          height: 3,
          background: WB_COLORS.accent,
          transform: 'translateY(-1.5px)',
          borderRadius: 1.5,
          pointerEvents: 'none',
          zIndex: 5,
        }} />
      )}

      {cellRangeHighlight && !colReorder?.active && !rowReorder?.active && (() => {
        const rect = tableCellRangeCanvasRect(table, cellRangeHighlight);
        return (
          <div style={{
            position: 'absolute',
            left: gutter + (rect.x - table.x) * z,
            top: gutter + (rect.y - table.y) * z,
            width: rect.w * z,
            height: rect.h * z,
            background: 'rgba(51, 112, 255, 0.12)',
            border: `2px solid ${WB_COLORS.accent}`,
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: 2,
          }} />
        );
      })()}

      {/* 左上角：整表拖动 */}
      <div
        title="拖动表格"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: gutter,
          height: gutter,
          background: '#f5f6f7',
          borderRight: `1px solid ${WB_COLORS.border}`,
          borderBottom: `1px solid ${WB_COLORS.border}`,
          borderTopLeftRadius: 4,
          pointerEvents: readOnly ? 'none' : 'auto',
          cursor: readOnly || !onMoveDragStart ? 'default' : 'grab',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          touchAction: 'none',
        }}
        onPointerDown={e => {
          if (readOnly || !onMoveDragStart) return;
          e.stopPropagation();
          e.preventDefault();
          onMoveDragStart(e);
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <GripDotsIcon />
      </div>

      {/* 顶栏：列头 */}
      <div
        style={{
          position: 'absolute',
          left: gutter,
          top: 0,
          width: table.width * z,
          height: gutter,
          background: '#f5f6f7',
          borderBottom: `1px solid ${WB_COLORS.border}`,
          borderTopRightRadius: 4,
          pointerEvents: readOnly ? 'none' : 'auto',
        }}
        onPointerMove={e => {
          handlePointerMove(e);
          onColReorderMove(e);
        }}
        onPointerUp={onColReorderUp}
        onPointerCancel={onColReorderUp}
        onPointerLeave={() => {
          if (!colReorder) onHoverCol?.(null);
        }}
      >
        {Array.from({ length: cols }, (_, i) => {
          const isSelected = selectedCol === i || (colReorder?.from === i);
          const isDragging = colReorder?.active && colReorder.from === i;
          return (
            <div
              key={`col-${i}`}
              title="拖动调整列顺序"
              style={{
                position: 'absolute',
                left: colOffsetsPx[i],
                top: 0,
                width: colWidthsPx[i],
                height: gutter,
                cursor: isDragging ? 'grabbing' : 'grab',
                zIndex: isSelected ? 2 : 1,
                background: isSelected ? WB_COLORS.accent : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                touchAction: 'none',
              }}
              onPointerEnter={() => onHoverCol?.(i)}
              onPointerDown={e => beginColReorder(i, e)}
              onMouseDown={e => e.stopPropagation()}
            >
              {isSelected ? (
                <GripDotsIcon color="#ffffff" />
              ) : (
                <span style={{
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: '#c9cdd4',
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* 左栏：行头 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: gutter,
          width: gutter,
          height: table.height * z,
          background: '#f5f6f7',
          borderRight: `1px solid ${WB_COLORS.border}`,
          borderBottomLeftRadius: 4,
          pointerEvents: readOnly ? 'none' : 'auto',
        }}
        onPointerMove={e => {
          handlePointerMove(e);
          onRowReorderMove(e);
        }}
        onPointerUp={onRowReorderUp}
        onPointerCancel={onRowReorderUp}
        onPointerLeave={() => {
          if (!rowReorder) onHoverRow?.(null);
        }}
      >
        {Array.from({ length: rows }, (_, i) => {
          const isSelected = selectedRow === i || (rowReorder?.from === i);
          const isDragging = rowReorder?.active && rowReorder.from === i;
          return (
            <div
              key={`row-${i}`}
              title="拖动调整行顺序"
              style={{
                position: 'absolute',
                left: 0,
                top: rowOffsetsPx[i],
                width: gutter,
                height: rowHeightsPx[i],
                cursor: isDragging ? 'grabbing' : 'grab',
                zIndex: isSelected ? 2 : 1,
                background: isSelected ? WB_COLORS.accent : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                touchAction: 'none',
              }}
              onPointerEnter={() => onHoverRow?.(i)}
              onPointerDown={e => beginRowReorder(i, e)}
              onMouseDown={e => e.stopPropagation()}
            >
              {isSelected ? (
                <GripDotsIcon color="#ffffff" rotate />
              ) : (
                <span style={{
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: '#c9cdd4',
                }} />
              )}
            </div>
          );
        })}
      </div>

      {insertHint?.axis === 'col' && !colReorder?.active && (
        <>
          <div style={{
            position: 'absolute',
            left: gutter + colOffsetsPx[insertHint.index],
            top: 0,
            width: 2,
            height: table.height * z + gutter,
            background: WB_COLORS.accent,
            transform: 'translateX(-1px)',
            pointerEvents: 'none',
          }} />
          <InsertPlusButton
            left={gutter + colOffsetsPx[insertHint.index]}
            top={gutter / 2}
            label="插入列"
            onClick={() => onInsertCol(insertHint.index)}
          />
        </>
      )}

      {insertHint?.axis === 'row' && !rowReorder?.active && (
        <>
          <div style={{
            position: 'absolute',
            left: 0,
            top: gutter + rowOffsetsPx[insertHint.index],
            width: table.width * z + gutter,
            height: 2,
            background: WB_COLORS.accent,
            transform: 'translateY(-1px)',
            pointerEvents: 'none',
          }} />
          <InsertPlusButton
            left={gutter / 2}
            top={gutter + rowOffsetsPx[insertHint.index]}
            label="插入行"
            onClick={() => onInsertRow(insertHint.index)}
          />
        </>
      )}
    </div>
  );
};
