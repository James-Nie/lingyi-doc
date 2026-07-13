import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  applyAutofill,
  normalizeRange,
  normalizeSelectionForMerges,
  SelectionManager,
  type CellCoord,
  type CellRange,
  type CellValue,
  type DirtyTracker,
  type FreeTable,
} from '@lingyi-doc/core';
import type { BaseSheetModel, FreeformSheetModel } from '@lingyi-doc/core';
import { useSheetStore } from '../../../store/sheetStore';
import {
  buildFullColumnRange,
  buildFullRowRange,
} from '../../../utils/axisSelection';

export interface UseSheetSelectionOptions {
  table: FreeTable;
  sheet: BaseSheetModel | FreeformSheetModel;
  isBaseSheet: boolean;
  previewMode: boolean;
  mergeRanges: CellRange[];
  dirtyTrackerRef: MutableRefObject<DirtyTracker>;
  scheduleRender: () => void;
  formatCellEditText: (value: CellValue) => string;
}

export function useSheetSelection({
  table,
  sheet,
  isBaseSheet,
  previewMode,
  mergeRanges,
  dirtyTrackerRef,
  scheduleRender,
  formatCellEditText,
}: UseSheetSelectionOptions) {
  const setSelection = useSheetStore(s => s.setSelection);
  const setFormulaBarText = useSheetStore(s => s.setFormulaBarText);
  const selectionRange = useSheetStore(s => s.selectionRange);
  const discreteSelections = useSheetStore(s => s.discreteSelections);
  const activeCell = useSheetStore(s => s.activeCell);
  const editingCell = useSheetStore(s => s.editingCell);

  const selectionManagerRef = useRef(new SelectionManager(table.sheetId));
  const isDraggingRef = useRef(false);
  const fillSourceRangeRef = useRef<CellRange | null>(null);
  const fillPreviewRangeRef = useRef<CellRange | null>(null);
  const isFillDraggingRef = useRef(false);
  const [fillPreviewRange, setFillPreviewRange] = useState<CellRange | null>(null);

  const [, setAxisDragTick] = useState(0);
  const axisDragRef = useRef<{
    axis: 'col' | 'row';
    sourceStart: number;
    sourceEnd: number;
    sourceIndex: number;
    insertIndex: number;
    active: boolean;
    startX: number;
    startY: number;
  } | null>(null);
  const axisHeaderSelectRef = useRef<{
    axis: 'col' | 'row';
    anchor: number;
    active: boolean;
    startX: number;
    startY: number;
  } | null>(null);
  const axisAnchorRef = useRef<{ axis: 'col' | 'row'; index: number } | null>(null);

  const [discreteAxisCols, setDiscreteAxisCols] = useState<number[]>([]);
  const [discreteAxisRows, setDiscreteAxisRows] = useState<number[]>([]);
  const discreteAxisColsRef = useRef<number[]>([]);
  const discreteAxisRowsRef = useRef<number[]>([]);

  const [formulaDrag, setFormulaDrag] = useState<{ active: boolean; startCoord: CellCoord; endCoord: CellCoord } | null>(null);
  const formulaDragRef = useRef(formulaDrag);
  formulaDragRef.current = formulaDrag;
  const formulaDragCursorRef = useRef(0);

  const syncDiscreteAxisCols = useCallback((next: number[]) => {
    discreteAxisColsRef.current = next;
    setDiscreteAxisCols(next);
    useSheetStore.getState().setAxisDiscreteCols(next);
  }, []);

  const syncDiscreteAxisRows = useCallback((next: number[]) => {
    discreteAxisRowsRef.current = next;
    setDiscreteAxisRows(next);
    useSheetStore.getState().setAxisDiscreteRows(next);
  }, []);

  const clearAxisDiscreteSelection = useCallback(() => {
    syncDiscreteAxisCols([]);
    syncDiscreteAxisRows([]);
  }, [syncDiscreteAxisCols, syncDiscreteAxisRows]);

  const applyColumnRangeSelection = useCallback((fromCol: number, toCol: number, focusCol?: number) => {
    syncDiscreteAxisCols([]);
    syncDiscreteAxisRows([]);
    const minCol = Math.min(fromCol, toCol);
    const maxCol = Math.max(fromCol, toCol);
    const range = buildFullColumnRange(table.sheetId, fromCol, toCol, sheet.rowCount);
    const focus = focusCol ?? toCol;
    setSelection(range, { row: 0, col: focus });
    selectionManagerRef.current.startSelection({ row: 0, col: minCol });
    selectionManagerRef.current.extendSelection({ row: sheet.rowCount - 1, col: maxCol });
    axisAnchorRef.current = { axis: 'col', index: focus };
    dirtyTrackerRef.current.markFullRedraw();
  }, [table.sheetId, sheet.rowCount, setSelection, syncDiscreteAxisCols, syncDiscreteAxisRows, dirtyTrackerRef]);

  const applyRowRangeSelection = useCallback((fromRow: number, toRow: number, focusRow?: number) => {
    syncDiscreteAxisCols([]);
    syncDiscreteAxisRows([]);
    const minRow = Math.min(fromRow, toRow);
    const maxRow = Math.max(fromRow, toRow);
    const range = buildFullRowRange(table.sheetId, fromRow, toRow, sheet.colCount);
    const focus = focusRow ?? toRow;
    setSelection(range, { row: focus, col: 0 });
    selectionManagerRef.current.startSelection({ row: minRow, col: 0 });
    selectionManagerRef.current.extendSelection({ row: maxRow, col: sheet.colCount - 1 });
    axisAnchorRef.current = { axis: 'row', index: focus };
    dirtyTrackerRef.current.markFullRedraw();
  }, [table.sheetId, sheet.colCount, setSelection, syncDiscreteAxisCols, syncDiscreteAxisRows, dirtyTrackerRef]);

  const applyExtendedSelection = useCallback((coord: CellCoord, activeCellCoord?: CellCoord | null) => {
    const selMgr = selectionManagerRef.current;
    const raw = selMgr.extendSelection(coord);
    const normalized = normalizeSelectionForMerges(raw, mergeRanges);
    const active = activeCellCoord ?? selMgr.activeCell ?? coord;
    setSelection(normalized, active);
    return normalized;
  }, [mergeRanges, setSelection]);

  const normalizeRangeForMerges = useCallback((range: CellRange): CellRange => {
    return normalizeSelectionForMerges(range, mergeRanges);
  }, [mergeRanges]);

  const updateFillPreview = useCallback((preview: CellRange) => {
    fillPreviewRangeRef.current = preview;
    setFillPreviewRange(preview);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [scheduleRender, dirtyTrackerRef]);

  const finishFillDrag = useCallback(() => {
    if (!isFillDraggingRef.current || !fillSourceRangeRef.current) return false;

    const preview = fillPreviewRangeRef.current;
    if (preview) {
      const src = normalizeRange(fillSourceRangeRef.current);
      const tgt = normalizeRange(preview);
      const expanded = (
        tgt.endRow > src.endRow || tgt.startRow < src.startRow
        || tgt.endCol > src.endCol || tgt.startCol < src.startCol
      );
      if (expanded) {
        applyAutofill(table, fillSourceRangeRef.current, preview);
        setSelection(preview, preview.end);
        selectionManagerRef.current.startSelection(preview.start);
        selectionManagerRef.current.extendSelection(preview.end);
        useSheetStore.getState().setStatusText('已填充');
      }
    }

    isFillDraggingRef.current = false;
    fillSourceRangeRef.current = null;
    fillPreviewRangeRef.current = null;
    setFillPreviewRange(null);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    return true;
  }, [table, setSelection, scheduleRender, dirtyTrackerRef]);

  const startFillDrag = useCallback((sel: CellRange, e?: ReactMouseEvent | globalThis.MouseEvent) => {
    fillSourceRangeRef.current = sel;
    isFillDraggingRef.current = true;
    isDraggingRef.current = false;
    fillPreviewRangeRef.current = sel;
    setFillPreviewRange(sel);
    e?.preventDefault();
    e?.stopPropagation();
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [scheduleRender, dirtyTrackerRef]);

  useEffect(() => {
    if (previewMode) return;
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [selectionRange, discreteSelections, activeCell, scheduleRender, previewMode, dirtyTrackerRef]);

  useEffect(() => {
    if (previewMode) return;
    if (isBaseSheet || editingCell) return;
    if (discreteSelections.length > 0) return;
    if (selectionRange && activeCell && selectionRange.sheetId === table.sheetId) return;

    const coord = { row: 0, col: 0 };
    const range = { sheetId: table.sheetId, start: coord, end: coord };
    selectionManagerRef.current = new SelectionManager(table.sheetId);
    selectionManagerRef.current.startSelection(coord);
    setSelection(range, coord);
    const cellData = table.getCell(coord.row, coord.col);
    setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [
    isBaseSheet,
    table,
    table.sheetId,
    selectionRange,
    activeCell,
    discreteSelections.length,
    editingCell,
    setSelection,
    setFormulaBarText,
    scheduleRender,
    previewMode,
    formatCellEditText,
    dirtyTrackerRef,
  ]);

  return {
    selectionManagerRef,
    isDraggingRef,
    isFillDraggingRef,
    fillSourceRangeRef,
    fillPreviewRange,
    axisDragRef,
    axisHeaderSelectRef,
    axisAnchorRef,
    setAxisDragTick,
    discreteAxisCols,
    discreteAxisRows,
    discreteAxisColsRef,
    discreteAxisRowsRef,
    formulaDrag,
    setFormulaDrag,
    formulaDragRef,
    formulaDragCursorRef,
    syncDiscreteAxisCols,
    syncDiscreteAxisRows,
    clearAxisDiscreteSelection,
    applyColumnRangeSelection,
    applyRowRangeSelection,
    applyExtendedSelection,
    normalizeRangeForMerges,
    updateFillPreview,
    finishFillDrag,
    startFillDrag,
  };
}
