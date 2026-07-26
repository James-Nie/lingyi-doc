import { useCallback, useMemo, useState } from 'react';
import { applyGroupContextToRow, buildDisplayRowHeights, recordRowHasFieldData, resolveGroupContextFromRecord, createFilterConditionFromCell, upsertFilterCondition, type FreeTable } from '@lingyi-doc/core-sheet';
import { getCellText, type BaseSheetModel } from '@lingyi-doc/core-types';
import type { RecordDrawerTab } from '../../RecordDetailDrawer';
import type { SheetContainerProps } from '../SheetContainer.types';
import type { SheetGridHostValue } from '../shared/SheetGridContext';
import { useSheetStore } from '../../../store/sheetStore';
import { ensureActiveBaseView, updateBaseViewFilter } from '../../base/formViewUtils';
import type { BaseGridContextValue } from './baseGridContext.types';
import { useBaseColumnMenu } from './useBaseColumnMenu';
import { useBaseGrouping } from './useBaseGrouping';
import { useBaseRowTree } from './useBaseRowTree';

import type { SheetCommentRequest } from '@lingyi-doc/editor-shared';

export interface UseBaseGridStateOptions extends Pick<
  SheetContainerProps,
  'table' | 'onOpenFieldConfig' | 'onToggleFieldVisibility' | 'onDeleteField' | 'onAddSheetComment' | 'commentsEnabled' | 'viewIdOverride'
> {
  host: SheetGridHostValue;
}

export function useBaseGridState({
  table,
  host,
  onOpenFieldConfig,
  onToggleFieldVisibility,
  onDeleteField,
  onAddSheetComment,
  commentsEnabled = false,
  viewIdOverride,
}: UseBaseGridStateOptions): BaseGridContextValue {
  const sheet = table.sheet as BaseSheetModel;
  const columnDefs = sheet.columnDefs ?? [];
  const sheetRows = sheet.rows ?? [];

  const {
    viewportRef,
    dirtyTrackerRef,
    scheduleRender,
    layoutVersion,
  } = host;

  const [checkedRows, setCheckedRows] = useState<number[]>([]);
  const [baseColumnMenu, setBaseColumnMenu] = useState<{ colIndex: number; x: number; y: number } | null>(null);
  const [detailRowIndex, setDetailRowIndex] = useState<number | null>(null);
  const [detailDrawerTab, setDetailDrawerTab] = useState<RecordDrawerTab>('detail');

  const {
    collapsedRowIds,
    collapsedRowIdSet,
    rowTreeMeta,
    toggleRowCollapse,
    setCollapsedRowIds,
  } = useBaseRowTree({
    enabled: true,
    table,
    sheet,
    sheetRows,
  });

  const {
    groupRules,
    groupLayout,
    flatSortedLayout,
    gridRowCount,
    isGroupedView,
    resolveGridRecordRow,
    checkedRowsForRender,
    skipGroupGridLine,
    isGroupDisplayRow,
    fillGroupedRowHighlight,
    toggleGroupCollapse,
    insertRecordInGroup,
    resolveGroupedCardLeft,
  } = useBaseGrouping({
    enabled: true,
    table,
    sheet,
    columnDefs,
    sheetRows,
    layoutVersion,
    checkedRows,
    collapsedRowIdSet,
    viewportRef,
    dirtyTrackerRef,
    viewIdOverride,
  });

  const displayRowHeights = useMemo(() => {
    if (groupLayout) return groupLayout.displayRowHeights;
    if (flatSortedLayout) return flatSortedLayout.displayRowHeights;
    table.ensureRowRecords();
    // 无筛选/排序时才走全量 rowCount；筛选已由 flatSortedLayout 紧凑化
    return buildDisplayRowHeights(
      sheet.rowCount,
      sheetRows,
      sheet.rowHeights,
      collapsedRowIdSet,
      table.getDefaultRowHeight(),
    );
  }, [
    groupLayout,
    flatSortedLayout,
    sheet.rowCount,
    sheetRows,
    sheet.rowHeights,
    collapsedRowIdSet,
    table,
  ]);

  const {
    activeSort,
    handleEditField,
    handleEditDescription,
    handleCopyField,
    handleHideField,
    handleInsertColumn,
    handleFreezeColumn,
    handleSort,
    handleGroupByField,
    handleFilterByField,
    handleCreateView,
    handleDeleteField,
  } = useBaseColumnMenu({
    enabled: true,
    table,
    sheet,
    columnDefs,
    sheetRows,
    dirtyTrackerRef,
    scheduleRender,
    onOpenFieldConfig,
    onToggleFieldVisibility,
    onDeleteField,
  });

  const getRecordFieldValue = useCallback((recordRow: number, col: number) => {
    return table.getCell(recordRow, col)?.value;
  }, [table, layoutVersion]);

  const canShowRecordDetailActions = useCallback((recordRow: number): boolean => {
    if (!isGroupedView) return true;
    return recordRowHasFieldData(getRecordFieldValue, columnDefs, recordRow);
  }, [isGroupedView, columnDefs, getRecordFieldValue]);

  const openRecordDrawer = useCallback((rowIndex: number, tab: RecordDrawerTab = 'detail') => {
    if (!canShowRecordDetailActions(rowIndex)) return;
    setDetailRowIndex(rowIndex);
    setDetailDrawerTab(tab);
  }, [canShowRecordDetailActions]);

  const handleBaseInsertRowsAbove = useCallback((rowIndex: number, count: number) => {
    table.runBatch(() => table.insertRows(rowIndex, count), 'insertRows');
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    useSheetStore.getState().setStatusText(`已在第 ${rowIndex + 1} 行上方插入 ${count} 行`);
  }, [table, scheduleRender, dirtyTrackerRef]);

  const handleBaseInsertRowsBelow = useCallback((rowIndex: number, count: number) => {
    table.runBatch(() => table.insertRows(rowIndex + 1, count), 'insertRows');
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    useSheetStore.getState().setStatusText(`已在第 ${rowIndex + 1} 行下方插入 ${count} 行`);
  }, [table, scheduleRender, dirtyTrackerRef]);

  const handleBaseAddChildRecord = useCallback((rowIndex: number) => {
    if (!canShowRecordDetailActions(rowIndex)) return;
    const parent = table.getRowRecord(rowIndex);
    const newRowIndex = table.insertChildRow(rowIndex);
    if (isGroupedView && groupRules.length > 0) {
      const groupContext = resolveGroupContextFromRecord(
        rowIndex,
        groupRules,
        (recordIndex, fieldId) => {
          const colIndex = columnDefs.findIndex(c => c.id === fieldId);
          if (colIndex < 0) return undefined;
          return table.getCell(recordIndex, colIndex)?.value;
        },
      );
      applyGroupContextToRow(
        (row, col, value, options) => table.setCellValue(row, col, value, options),
        newRowIndex,
        groupContext,
        columnDefs,
      );
    }
    if (parent) {
      setCollapsedRowIds(prev => prev.filter(id => id !== parent._id));
    }
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    useSheetStore.getState().setStatusText(`已添加子记录（第 ${newRowIndex + 1} 行）`);
  }, [
    table,
    scheduleRender,
    dirtyTrackerRef,
    setCollapsedRowIds,
    canShowRecordDetailActions,
    isGroupedView,
    groupRules,
    columnDefs,
  ]);

  const handleBaseAddComment = useCallback((rowIndex: number, _colIndex: number) => {
    if (!commentsEnabled || !onAddSheetComment) return;
    const record = sheetRows[rowIndex];
    if (!record?._id) {
      useSheetStore.getState().setStatusText('无法对该行添加评论');
      return;
    }
    // 多维表评论固定为整行（sheet_record）：quote 取首列标题字段，不携带 fieldId
    const titleCell = table.getCell(rowIndex, 0);
    const titleText = titleCell ? getCellText(titleCell.value).trim() : '';
    const quote = titleText
      ? titleText.slice(0, 200)
      : `记录 ${rowIndex + 1}`;
    const request: SheetCommentRequest = {
      rowIndex,
      colIndex: 0,
      recordId: record._id,
      quote,
    };
    onAddSheetComment(request);
  }, [commentsEnabled, onAddSheetComment, sheetRows, table]);

  const handleBaseFilterByCell = useCallback((rowIndex: number, colIndex: number) => {
    const colDef = columnDefs[colIndex];
    if (!colDef) return;
    const cell = table.getCell(rowIndex, colIndex);
    const cond = createFilterConditionFromCell(colDef.id, cell?.value, colDef);
    const view = ensureActiveBaseView(sheet);
    updateBaseViewFilter(view, upsertFilterCondition(view.filter ?? [], cond));
    table.notifyChange(null);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    const label = cell ? getCellText(cell.value).trim() || '空值' : '空值';
    useSheetStore.getState().setStatusText(`已按「${label}」筛选字段「${colDef.name}」`);
  }, [table, columnDefs, sheet, scheduleRender, dirtyTrackerRef]);

  return {
    table,
    sheet,
    columnDefs,
    sheetRows,
    host,
    checkedRows,
    setCheckedRows,
    checkedRowsForRender,
    collapsedRowIds,
    collapsedRowIdSet,
    rowTreeMeta,
    toggleRowCollapse,
    setCollapsedRowIds,
    groupRules,
    groupLayout,
    flatSortedLayout,
    gridRowCount,
    isGroupedView,
    displayRowHeights,
    resolveGridRecordRow,
    skipGroupGridLine,
    isGroupDisplayRow,
    fillGroupedRowHighlight,
    resolveGroupedCardLeft,
    toggleGroupCollapse,
    insertRecordInGroup,
    baseColumnMenu,
    setBaseColumnMenu,
    detailRowIndex,
    setDetailRowIndex,
    detailDrawerTab,
    setDetailDrawerTab,
    activeSort,
    handleEditField,
    handleEditDescription,
    handleCopyField,
    handleHideField,
    handleInsertColumn,
    handleFreezeColumn,
    handleSort,
    handleGroupByField,
    handleFilterByField,
    handleCreateView,
    handleDeleteField,
    canShowRecordDetailActions,
    openRecordDrawer,
    handleBaseInsertRowsAbove,
    handleBaseInsertRowsBelow,
    handleBaseAddChildRecord,
    handleBaseAddComment,
    handleBaseFilterByCell,
    commentsEnabled,
  };
}
