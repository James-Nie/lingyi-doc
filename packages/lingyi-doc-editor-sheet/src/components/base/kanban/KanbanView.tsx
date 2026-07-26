import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { BaseView } from '@lingyi-doc/core-types';
import { applyGroupContextToRow, BASE_THEME, buildCellValueFromGroupKey, GROUP_EMPTY_KEY } from '@lingyi-doc/core-sheet';
import { isBaseSheet } from '@lingyi-doc/core-types';
import { useSheetStore } from '../../../store/sheetStore';
import { RecordDetailModal } from '../../RecordDetailModal';
import { KanbanBoard } from './KanbanBoard';
import { useKanbanBoardData } from './useKanbanBoardData';

export interface KanbanViewProps {
  table: FreeTable;
  kanbanView: BaseView;
  onChange: () => void;
  readOnly?: boolean;
}

export const KanbanView: React.FC<KanbanViewProps> = ({
  table,
  kanbanView,
  onChange,
  readOnly = false,
}) => {
  const setStatusText = useSheetStore(s => s.setStatusText);
  const [revision, setRevision] = useState(0);
  const [detailRow, setDetailRow] = useState<number | null>(null);
  const dragRowRef = useRef<number | null>(null);

  useEffect(() => {
    return table.onChange(() => {
      setRevision(v => v + 1);
    });
  }, [table]);

  const board = useKanbanBoardData(table, kanbanView, revision);
  const sheet = isBaseSheet(table.sheet) ? table.sheet : null;

  const persist = useCallback(() => {
    setRevision(v => v + 1);
    onChange();
    table.notifyChange(null);
  }, [onChange, table]);

  const handleAddRecord = useCallback((columnKey: string) => {
    if (readOnly || !sheet) return;
    const insertIndex = sheet.rowCount;
    table.insertRows(insertIndex, 1);
    const autoNumCol = sheet.columnDefs.findIndex(c => c.type === 'autoNumber');
    if (autoNumCol >= 0) {
      table.setCellValue(insertIndex, autoNumCol, { type: 'text', text: String(insertIndex) });
    }
    if (board.groupFieldId && columnKey !== '__all__') {
      applyGroupContextToRow(
        (row, col, value, options) => table.setCellValue(row, col, value, options),
        insertIndex,
        { [board.groupFieldId]: columnKey === GROUP_EMPTY_KEY ? null : columnKey },
        sheet.columnDefs,
      );
    }
    persist();
    setStatusText('已添加记录');
    setDetailRow(insertIndex);
  }, [readOnly, sheet, table, board.groupFieldId, persist, setStatusText]);

  const handleDragStart = useCallback((rowIndex: number, e: React.DragEvent) => {
    if (readOnly) return;
    dragRowRef.current = rowIndex;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(rowIndex));
  }, [readOnly]);

  const handleDrop = useCallback((columnKey: string) => {
    if (readOnly || !sheet || !board.groupFieldId) return;
    const rowIndex = dragRowRef.current;
    dragRowRef.current = null;
    if (rowIndex == null || rowIndex < 0) return;

    const colIndex = sheet.columnDefs.findIndex(c => c.id === board.groupFieldId);
    if (colIndex < 0) return;
    const colDef = sheet.columnDefs[colIndex];
    const key = columnKey === GROUP_EMPTY_KEY || columnKey === '__all__' ? GROUP_EMPTY_KEY : columnKey;
    const cellValue = buildCellValueFromGroupKey(key === GROUP_EMPTY_KEY ? null : key, colDef);
    if (!cellValue) return;
    table.setCellValue(rowIndex, colIndex, cellValue);
    persist();
    setStatusText('已移动卡片');
  }, [readOnly, sheet, board.groupFieldId, table, persist, setStatusText]);

  if (!sheet) return null;

  if (!board.groupFieldId) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: BASE_THEME.secondaryTextColor,
        fontSize: 14,
        background: BASE_THEME.pageBg,
      }}>
        请先在工具栏选择「分组依据」字段
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      background: BASE_THEME.pageBg,
      overflow: 'hidden',
    }}>
      <KanbanBoard
        table={table}
        columns={board.columns}
        columnWidth={board.columnWidth}
        titleFieldId={board.titleFieldId}
        cardFieldIds={board.cardFieldIds}
        showFieldNames={board.showFieldNames}
        coverFieldId={board.coverFieldId}
        readOnly={readOnly}
        onAddRecord={handleAddRecord}
        onOpenRecord={setDetailRow}
        onDragStart={handleDragStart}
        onDrop={handleDrop}
      />
      <RecordDetailModal
        visible={detailRow !== null}
        rowIndex={detailRow}
        table={table}
        onClose={() => setDetailRow(null)}
        onNavigate={setDetailRow}
      />
    </div>
  );
};
