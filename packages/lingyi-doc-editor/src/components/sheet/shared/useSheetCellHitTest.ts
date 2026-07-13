import { useCallback } from 'react';
import type { CellCoord } from '@lingyi-doc/core';
import type { SheetInteractionDeps } from './sheetInteraction.types';

export interface UseSheetCellHitTestOptions {
  canvasContainerRef: SheetInteractionDeps['canvasContainerRef'];
  viewportRef: SheetInteractionDeps['viewportRef'];
  gridRowCount: number;
  effectiveColCount: number;
  sheetColumnWidths: Map<number, number>;
  mergeRanges: SheetInteractionDeps['mergeRanges'];
  resolveActiveRowHeights: () => Map<number, number>;
  resolveGridRecordRow: (displayRow: number) => number | null;
  table: SheetInteractionDeps['table'];
}

export function useSheetCellHitTest({
  canvasContainerRef,
  viewportRef,
  gridRowCount,
  effectiveColCount,
  sheetColumnWidths,
  mergeRanges,
  resolveActiveRowHeights,
  resolveGridRecordRow,
  table,
}: UseSheetCellHitTestOptions) {
  const mapCoordToRecord = useCallback((coord: CellCoord): CellCoord | null => {
    const recordRow = resolveGridRecordRow(coord.row);
    if (recordRow === null) return null;
    return { row: recordRow, col: coord.col };
  }, [resolveGridRecordRow]);

  const getCellAtDisplayCoord = useCallback((coord: CellCoord) => {
    const mapped = mapCoordToRecord(coord);
    if (!mapped) return undefined;
    return table.getCell(mapped.row, mapped.col);
  }, [mapCoordToRecord, table]);

  const getCellFromClientCoords = useCallback((clientX: number, clientY: number): CellCoord | null => {
    if (!canvasContainerRef.current) return null;
    const rect = canvasContainerRef.current.getBoundingClientRect();
    return viewportRef.current.hitTest(
      clientX, clientY, rect, gridRowCount, effectiveColCount,
      sheetColumnWidths, resolveActiveRowHeights(), mergeRanges,
    );
  }, [canvasContainerRef, viewportRef, gridRowCount, effectiveColCount, sheetColumnWidths, mergeRanges, resolveActiveRowHeights]);

  const getCellFromEvent = useCallback((e: React.MouseEvent): CellCoord | null => {
    return getCellFromClientCoords(e.clientX, e.clientY);
  }, [getCellFromClientCoords]);

  return {
    mapCoordToRecord,
    getCellAtDisplayCoord,
    getCellFromClientCoords,
    getCellFromEvent,
  };
}
