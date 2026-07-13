import React from 'react';
import {
  FILL_HANDLE_SIZE,
  getFillHandleAnchor,
  shouldShowFillHandle,
  type CellRange,
  type FreeTable,
} from '@lingyi-doc/core';
import type { ViewportManager } from '@lingyi-doc/core';
import { ChartOverlay } from '../../chart/ChartOverlay';
import { DeleteRecordsDialog } from '../../DeleteRecordsDialog';

export interface SheetSharedOverlaysProps {
  previewMode: boolean;
  table: FreeTable;
  scrollLeft: number;
  scrollTop: number;
  zoomLevel: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  viewportRef: React.RefObject<ViewportManager>;
  selectedChartId?: string | null;
  onSelectChart?: (chartId: string | null) => void;
  hoverRatingCell: { row: number; col: number; value: number } | null;
  sheetColumnWidths: Map<number, number>;
  sheetRowHeights: Map<number, number>;
  supportsAutofill: boolean;
  selectionRange: CellRange | null;
  editingCell: { row: number; col: number } | null;
  sheetRowCount: number;
  sheetColCount: number;
  displayRowHeights: Map<number, number>;
  containerSize: { width: number; height: number };
  startFillDrag: (sel: CellRange, e?: React.MouseEvent | MouseEvent) => void;
  deleteDialog: { visible: boolean; rows: number[] };
  onConfirmDeleteRows: () => void;
  onCancelDeleteRows: () => void;
}

export const SheetSharedOverlays: React.FC<SheetSharedOverlaysProps> = ({
  previewMode,
  table,
  scrollLeft,
  scrollTop,
  zoomLevel,
  containerRef,
  canvasContainerRef,
  viewportRef,
  selectedChartId,
  onSelectChart,
  hoverRatingCell,
  sheetColumnWidths,
  sheetRowHeights,
  supportsAutofill,
  selectionRange,
  editingCell,
  sheetRowCount,
  sheetColCount,
  displayRowHeights,
  containerSize,
  startFillDrag,
  deleteDialog,
  onConfirmDeleteRows,
  onCancelDeleteRows,
}) => {
  if (previewMode) {
    return (
      <ChartOverlay
        table={table}
        scrollLeft={viewportRef.current!.scrollLeft}
        scrollTop={viewportRef.current!.scrollTop}
        zoomLevel={zoomLevel}
        containerRef={containerRef}
        selectedChartId={selectedChartId || null}
        onSelectChart={onSelectChart || (() => {})}
      />
    );
  }

  return (
    <>
      <ChartOverlay
        table={table}
        scrollLeft={scrollLeft}
        scrollTop={scrollTop}
        zoomLevel={zoomLevel}
        containerRef={containerRef}
        selectedChartId={selectedChartId || null}
        onSelectChart={onSelectChart || (() => {})}
      />

      <div style={{
        position: 'absolute', bottom: 12, right: 12,
        background: '#f1f3f4', borderRadius: 4, padding: '2px 8px',
        fontSize: 12, color: '#666', zIndex: 100, pointerEvents: 'none',
      }}>
        {Math.round(zoomLevel * 100)}%
      </div>

      {hoverRatingCell && (() => {
        const cellRect = viewportRef.current!.getCellRect(
          { row: hoverRatingCell.row, col: hoverRatingCell.col },
          sheetColumnWidths, sheetRowHeights,
        );
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!containerRect) return null;
        return (
          <div
            style={{
              position: 'fixed',
              left: containerRect.left + cellRect.x + cellRect.width / 2 - 20,
              top: containerRect.top + cellRect.y - 28,
              background: '#333',
              color: '#fff',
              padding: '3px 10px',
              borderRadius: 4,
              fontSize: 12,
              pointerEvents: 'none',
              zIndex: 1000,
              whiteSpace: 'nowrap',
            }}
          >
            {hoverRatingCell.value}
          </div>
        );
      })()}

      {supportsAutofill && selectionRange && !editingCell
        && shouldShowFillHandle(selectionRange, sheetRowCount, sheetColCount) && (() => {
          const anchor = getFillHandleAnchor(selectionRange);
          const cellRect = viewportRef.current!.getCellRect(anchor, sheetColumnWidths, displayRowHeights);
          if (cellRect.x + cellRect.width < 0 || cellRect.y + cellRect.height < 0) return null;
          if (cellRect.x > containerSize.width || cellRect.y > containerSize.height) return null;
          const half = FILL_HANDLE_SIZE / 2;
          return (
            <div style={{ position: 'absolute', inset: 0, zIndex: 1000, pointerEvents: 'none' }}>
              <div
                data-sheet-fill-handle
                style={{
                  position: 'absolute',
                  left: cellRect.x + cellRect.width - half - 4,
                  top: cellRect.y + cellRect.height - half - 4,
                  width: FILL_HANDLE_SIZE + 8,
                  height: FILL_HANDLE_SIZE + 8,
                  cursor: 'crosshair',
                  pointerEvents: 'auto',
                }}
                onMouseDown={e => startFillDrag(selectionRange, e)}
                onMouseEnter={() => {
                  if (canvasContainerRef.current) canvasContainerRef.current.style.cursor = 'crosshair';
                }}
                onMouseLeave={() => {
                  if (canvasContainerRef.current) canvasContainerRef.current.style.cursor = 'cell';
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    right: 4,
                    bottom: 4,
                    width: FILL_HANDLE_SIZE,
                    height: FILL_HANDLE_SIZE,
                    background: '#000000',
                    border: '1px solid #ffffff',
                    boxSizing: 'border-box',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </div>
          );
        })()}

      <DeleteRecordsDialog
        visible={deleteDialog.visible}
        count={deleteDialog.rows.length}
        onConfirm={onConfirmDeleteRows}
        onCancel={onCancelDeleteRows}
      />
    </>
  );
};
