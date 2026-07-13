import { useCallback, useState } from 'react';
import {
  getSheetCellEditText,
  parseCellValue,
  parseFieldValue,
  parseFreeformBooleanInput,
} from '@lingyi-doc/core';
import type { CellCoord, CellValue, ColumnDef } from '@lingyi-doc/core';
import type { FreeTable } from '@lingyi-doc/core';
import { useSheetStore } from '../../../store/sheetStore';
import { syncToolbarFromCell } from '../../../utils/syncToolbarFromCell';
import type { SheetInteractionDeps } from './sheetInteraction.types';

export interface UseSheetEditingOptions {
  table: FreeTable;
  isBaseSheet: boolean;
  isFreeformSheet: boolean;
  columnDefs: ColumnDef[];
  mapCoordToRecord: (coord: CellCoord) => CellCoord | null;
  selectionManagerRef: SheetInteractionDeps['selectionManagerRef'];
  dirtyTrackerRef: SheetInteractionDeps['dirtyTrackerRef'];
  scheduleRender: () => void;
  formatCellEditText: (value: CellValue) => string;
}

export function useSheetEditing({
  table,
  isBaseSheet,
  isFreeformSheet,
  columnDefs,
  mapCoordToRecord,
  selectionManagerRef,
  dirtyTrackerRef,
  scheduleRender,
  formatCellEditText,
}: UseSheetEditingOptions) {
  const setSelection = useSheetStore(s => s.setSelection);
  const setEditingCell = useSheetStore(s => s.setEditingCell);
  const setFormulaBarText = useSheetStore(s => s.setFormulaBarText);

  const [dropdownEditCell, setDropdownEditCell] = useState<CellCoord | null>(null);
  const [dateEditCell, setDateEditCell] = useState<CellCoord | null>(null);

  const handleEditCommit = useCallback((
    coord: CellCoord,
    value: string | boolean | number | CellValue | null,
    commitType?: string,
  ) => {
    const recordCoord = mapCoordToRecord(coord);
    if (!recordCoord) return;
    const columnDef = columnDefs[recordCoord.col];
    const columnType = columnDef?.type;

    if (value === null || (typeof value === 'string' && value.trim() === '')) {
      const existing = table.getCell(recordCoord.row, recordCoord.col);
      if (existing?.value.type === 'boolean' && isFreeformSheet && !columnType) {
        table.setCellValue(recordCoord.row, recordCoord.col, { type: 'boolean', value: false });
        setFormulaBarText('0');
      } else {
        table.clearCellContent(recordCoord.row, recordCoord.col);
        setFormulaBarText('');
      }
    } else if (typeof value === 'object' && value !== null) {
      table.setCellValue(recordCoord.row, recordCoord.col, value);
      setFormulaBarText(formatCellEditText(value));
    } else if (typeof value === 'boolean') {
      table.setCellValue(recordCoord.row, recordCoord.col, { type: 'boolean', value });
      setFormulaBarText(isFreeformSheet && !columnType ? (value ? '1' : '0') : (value ? 'TRUE' : 'FALSE'));
    } else if (typeof value === 'number') {
      const existing = table.getCell(recordCoord.row, recordCoord.col);
      const format = existing?.value.type === 'number'
        ? existing.value.format
        : { kind: 'general' as const };
      table.setCellValue(recordCoord.row, recordCoord.col, { type: 'number', value, format });
      setFormulaBarText(String(value));
    } else if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.startsWith('=')) {
        try {
          const result = table.recalcEngine.evaluateAndStore(trimmed, table, recordCoord.row, recordCoord.col);
          table.setCellValue(recordCoord.row, recordCoord.col, result);
        } catch {
          table.setCell(recordCoord.row, recordCoord.col, trimmed, trimmed);
        }
        setFormulaBarText(trimmed);
      } else if (columnType) {
        const parsedValue = parseFieldValue(trimmed, columnType);
        table.setCellValue(recordCoord.row, recordCoord.col, parsedValue);
        setFormulaBarText(formatCellEditText(parsedValue));
      } else {
        const existing = table.getCell(recordCoord.row, recordCoord.col);
        if (existing?.value.type === 'boolean') {
          const parsed = parseFreeformBooleanInput(trimmed);
          table.setCellValue(recordCoord.row, recordCoord.col, parsed);
          setFormulaBarText(formatCellEditText(parsed));
        } else {
          const parsed = parseCellValue(trimmed);
          if (parsed.type === 'number' && existing?.value.type === 'number') {
            const next = { ...parsed, format: existing.value.format };
            table.setCellValue(recordCoord.row, recordCoord.col, next);
            setFormulaBarText(formatCellEditText(next));
          } else if (parsed.type === 'date' && existing?.value.type === 'date') {
            const next = { ...parsed, format: existing.value.format };
            table.setCellValue(recordCoord.row, recordCoord.col, next);
            setFormulaBarText(formatCellEditText(next));
          } else {
            table.setCellValue(recordCoord.row, recordCoord.col, parsed);
            setFormulaBarText(formatCellEditText(parsed));
          }
        }
      }
    }
    setEditingCell(null);

    if (commitType === 'enter') {
      selectionManagerRef.current.setActiveCell(coord);
      setSelection(
        { sheetId: table.sheetId, start: coord, end: coord },
        coord,
      );
    }

    if (commitType === 'tab') {
      const nextCoord = { row: coord.row, col: coord.col + 1 };
      selectionManagerRef.current.setActiveCell(nextCoord);
      setSelection(
        { sheetId: table.sheetId, start: nextCoord, end: nextCoord },
        nextCoord,
      );
    }

    if (!isBaseSheet) {
      syncToolbarFromCell(table.getCell(recordCoord.row, recordCoord.col));
    }
  }, [table, setEditingCell, setFormulaBarText, setSelection, isFreeformSheet, isBaseSheet, formatCellEditText, mapCoordToRecord, columnDefs, selectionManagerRef]);

  const handleEditCancel = useCallback(() => {
    setEditingCell(null);
    setDropdownEditCell(null);
    setDateEditCell(null);
  }, [setEditingCell]);

  const handleDropdownEditClose = useCallback(() => {
    setDropdownEditCell(null);
  }, []);

  const handleDateEditClose = useCallback(() => {
    setDateEditCell(null);
  }, []);

  const handleDropdownEditCommit = useCallback((coord: CellCoord, value: CellValue) => {
    table.setCellValue(coord.row, coord.col, value);
    setFormulaBarText(formatCellEditText(value));
    setDropdownEditCell(null);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    syncToolbarFromCell(table.getCell(coord.row, coord.col));
  }, [table, setFormulaBarText, scheduleRender, formatCellEditText, dirtyTrackerRef]);

  const handleDateEditCommit = useCallback((coord: CellCoord, value: CellValue) => {
    table.setCellValue(coord.row, coord.col, value);
    setFormulaBarText(formatCellEditText(value));
    setDateEditCell(null);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    syncToolbarFromCell(table.getCell(coord.row, coord.col));
  }, [table, setFormulaBarText, scheduleRender, formatCellEditText, dirtyTrackerRef]);

  const startCellEdit = useCallback((coord: CellCoord, fromKeyboard = false) => {
    const recordCoord = isBaseSheet ? mapCoordToRecord(coord) : coord;
    if (!recordCoord) return;
    if (isFreeformSheet && table.getDropdownValidationAt(recordCoord.row, recordCoord.col)) {
      setDateEditCell(null);
      setDropdownEditCell(coord);
      setEditingCell(null);
      const cellData = table.getCell(recordCoord.row, recordCoord.col);
      setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
      return;
    }
    if (isFreeformSheet && table.getDateValidationAt(recordCoord.row, recordCoord.col)) {
      setDropdownEditCell(null);
      setDateEditCell(coord);
      setEditingCell(null);
      const cellData = table.getCell(recordCoord.row, recordCoord.col);
      setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
      return;
    }
    if (fromKeyboard) {
      useSheetStore.getState().markKeyboardEditOpened();
    }
    setDropdownEditCell(null);
    setDateEditCell(null);
    setEditingCell(coord);
    const cellData = table.getCell(recordCoord.row, recordCoord.col);
    setFormulaBarText(cellData ? getSheetCellEditText(cellData.value, isFreeformSheet) : '');
  }, [table, setEditingCell, setFormulaBarText, isFreeformSheet, isBaseSheet, formatCellEditText, mapCoordToRecord]);

  return {
    dropdownEditCell,
    dateEditCell,
    setDropdownEditCell,
    setDateEditCell,
    handleEditCommit,
    handleEditCancel,
    handleDropdownEditClose,
    handleDateEditClose,
    handleDropdownEditCommit,
    handleDateEditCommit,
    startCellEdit,
  };
}
