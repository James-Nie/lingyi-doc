import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from 'react';
import { applyGroupContextToRow, buildFlatSortedRecordLayout, buildGroupedLayout, isGroupLayoutRow, prepareGroupedRecordIndices, resolveDisplayRowsForRecordRows, resolveGroupInsertRecordIndex, resolveGroupedCardLeft, resolveGroupedRecordHighlightBounds, resolveRecordRowFromLayout, type FreeTable, type GroupedLayoutResult, type FlatRecordLayoutResult } from '@lingyi-doc/core-sheet';
import type { BaseSheetModel, ColumnDef, RecordRow } from '@lingyi-doc/core-types';
import type { FilterCondition, GroupRule, SortRule } from '@lingyi-doc/core-types';
import type { ViewportManager } from '@lingyi-doc/core-sheet';
import {
  ensureActiveBaseView,
  expandGroupPathKeys,
  getActiveBaseView,
  updateCollapsedGroupKeys,
} from '../../base/formViewUtils';
import { useSheetStore } from '../../../store/sheetStore';

export interface UseBaseGroupingOptions {
  enabled: boolean;
  table: FreeTable;
  sheet: BaseSheetModel;
  columnDefs: ColumnDef[];
  sheetRows: RecordRow[];
  layoutVersion: number;
  checkedRows: number[];
  collapsedRowIdSet: Set<string>;
  viewportRef: MutableRefObject<ViewportManager>;
  dirtyTrackerRef: MutableRefObject<{ markFullRedraw: () => void }>;
  /** 仪表盘嵌入时指定视图，避免绑死 activeViewId */
  viewIdOverride?: string;
}

export function useBaseGrouping({
  enabled,
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
}: UseBaseGroupingOptions) {
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<string[]>([]);
  const collapsedGroupKeySet = useMemo(() => new Set(collapsedGroupKeys), [collapsedGroupKeys]);

  const activeBaseView = useMemo(() => {
    if (!enabled) return null;
    if (viewIdOverride) {
      const found = sheet.views?.find(v => v.viewId === viewIdOverride);
      if (found) return found;
    }
    return ensureActiveBaseView(sheet);
  }, [enabled, sheet, sheet.views, sheet.activeViewId, layoutVersion, viewIdOverride]);

  useEffect(() => {
    if (!enabled || !activeBaseView) return;
    setCollapsedGroupKeys(activeBaseView.config.collapsedGroupKeys ?? []);
  }, [enabled, activeBaseView?.viewId, activeBaseView?.config.collapsedGroupKeys]);

  const groupRules = useMemo((): GroupRule[] => (enabled ? activeBaseView?.group ?? [] : []), [enabled, activeBaseView, layoutVersion]);
  const viewFilter = useMemo((): FilterCondition[] => (enabled ? activeBaseView?.filter ?? [] : []), [enabled, activeBaseView, layoutVersion]);
  const viewFilterConjunction = useMemo(
    () => (enabled ? activeBaseView?.filterConjunction ?? 'and' : 'and' as const),
    [enabled, activeBaseView, layoutVersion],
  );
  const viewSort = useMemo((): SortRule[] => (enabled ? activeBaseView?.sort ?? [] : []), [enabled, activeBaseView, layoutVersion]);

  const getGroupFieldValue = useCallback((recordIndex: number, fieldId: string): unknown => {
    if (!enabled) return undefined;
    const colIndex = columnDefs.findIndex(c => c.id === fieldId);
    if (colIndex < 0) return undefined;
    return table.getCell(recordIndex, colIndex)?.value;
  }, [enabled, columnDefs, table, layoutVersion]);

  const groupedRecordIndices = useMemo(() => {
    if (!enabled) return [];
    return prepareGroupedRecordIndices({
      rowCount: sheet.rowCount,
      filter: viewFilter,
      filterConjunction: viewFilterConjunction,
      sort: viewSort,
      columnDefs,
      getFieldValue: getGroupFieldValue,
    });
  }, [enabled, sheet.rowCount, columnDefs, viewFilter, viewFilterConjunction, viewSort, getGroupFieldValue, layoutVersion]);

  const filteredRecordSet = useMemo(
    () => new Set(groupedRecordIndices),
    [groupedRecordIndices],
  );

  const flatSortedLayout = useMemo((): FlatRecordLayoutResult | null => {
    // 筛选或排序任一激活即走紧凑显示行，避免零高行占满 sheet.rowCount
    if (!enabled || groupRules.length > 0) return null;
    if (viewSort.length === 0 && viewFilter.length === 0) return null;
    table.ensureRowRecords();
    return buildFlatSortedRecordLayout({
      recordIndices: groupedRecordIndices,
      rows: sheetRows,
      rowHeights: sheet.rowHeights,
      collapsedIds: collapsedRowIdSet,
      defaultHeight: table.getDefaultRowHeight(),
    });
  }, [enabled, groupRules.length, viewSort.length, viewFilter.length, groupedRecordIndices, sheetRows, sheet.rowHeights, collapsedRowIdSet, table, layoutVersion]);

  const groupLayout = useMemo((): GroupedLayoutResult | null => {
    if (!enabled || groupRules.length === 0) return null;
    table.ensureRowRecords();
    return buildGroupedLayout({
      recordIndices: groupedRecordIndices,
      rows: sheetRows,
      columnDefs,
      groupRules,
      collapsedKeys: collapsedGroupKeySet,
      defaultRowHeight: table.getDefaultRowHeight(),
      getFieldValue: getGroupFieldValue,
      sortRules: viewSort,
    });
  }, [enabled, groupRules, groupedRecordIndices, sheetRows, columnDefs, collapsedGroupKeySet, table, getGroupFieldValue, viewSort, layoutVersion]);

  const gridRowCount = groupLayout?.displayRowCount
    ?? flatSortedLayout?.displayRowCount
    ?? sheet.rowCount;
  const isGroupedView = !!groupLayout;
  const hasActiveViewFilter = viewFilter.length > 0;
  const hasActiveViewSort = viewSort.length > 0;

  const resolveGridRecordRow = useCallback((displayRow: number): number | null => {
    if (groupLayout) {
      return resolveRecordRowFromLayout(groupLayout.items, displayRow);
    }
    if (flatSortedLayout) {
      return flatSortedLayout.recordIndexByDisplayRow[displayRow] ?? null;
    }
    return displayRow;
  }, [groupLayout, flatSortedLayout]);

  const checkedDisplayRows = useMemo(() => {
    if (groupLayout && checkedRows.length > 0) {
      return resolveDisplayRowsForRecordRows(groupLayout.items, checkedRows);
    }
    if (flatSortedLayout && checkedRows.length > 0) {
      const recordToDisplay = new Map(
        flatSortedLayout.recordIndexByDisplayRow.map((recordIdx, displayRow) => [recordIdx, displayRow]),
      );
      return checkedRows
        .map(recordIdx => recordToDisplay.get(recordIdx))
        .filter((displayRow): displayRow is number => displayRow !== undefined);
    }
    return checkedRows;
  }, [groupLayout, flatSortedLayout, checkedRows]);

  const checkedRowsForRender = (isGroupedView || !!flatSortedLayout) ? checkedDisplayRows : checkedRows;

  const skipGroupGridLine = useCallback((row: number): boolean => {
    if (!groupLayout) return false;
    const above = row > 0 ? groupLayout.items[row - 1] : null;
    const at = row < groupLayout.displayRowCount ? groupLayout.items[row] : null;

    // 记录行底边：保留「最后一条数据 → 添加记录」之间的分隔线
    if (above?.type === 'record' && at?.type === 'add-record') return false;
    // 记录行之间正常画线
    if (above?.type === 'record' && at?.type === 'record') return false;

    // 分组头 / 添加行 / 间距等布局行上的网格线跳过（分组头自带底部分隔）
    if (
      above?.type === 'group-header' || above?.type === 'add-record' || above?.type === 'group-gap'
      || at?.type === 'group-header' || at?.type === 'add-record' || at?.type === 'group-gap'
    ) {
      return true;
    }
    return false;
  }, [groupLayout]);

  const isGroupDisplayRow = useCallback((row: number): boolean => {
    if (!groupLayout) return false;
    return isGroupLayoutRow(groupLayout.items[row]);
  }, [groupLayout]);

  const resolveGroupedCardLeftFn = useCallback((): number => {
    return resolveGroupedCardLeft();
  }, []);

  const fillGroupedRowHighlight = useCallback((
    ctx: CanvasRenderingContext2D,
    displayRow: number,
    color: string,
    gridRight: number,
    rowHeights: Map<number, number>,
  ) => {
    if (!groupLayout) return;
    const rowRect = viewportRef.current.getCellRect(
      { row: displayRow, col: 0 }, sheet.columnWidths, rowHeights,
    );
    const cardBounds = resolveGroupedRecordHighlightBounds(
      resolveGroupedCardLeft(), gridRight, groupLayout.groupBoxRanges, displayRow,
    );
    if (!cardBounds) return;
    ctx.fillStyle = color;
    ctx.fillRect(cardBounds.left, rowRect.y, cardBounds.right - cardBounds.left, rowRect.height);
  }, [groupLayout, sheet.columnWidths, viewportRef]);

  const toggleGroupCollapse = useCallback((groupPathKey: string) => {
    if (!enabled) return;
    setCollapsedGroupKeys(prev => {
      const set = new Set(prev);
      if (set.has(groupPathKey)) set.delete(groupPathKey);
      else set.add(groupPathKey);
      const next = Array.from(set);
      const view = ensureActiveBaseView(sheet);
      updateCollapsedGroupKeys(view, next);
      table.notifyChange(null);
      return next;
    });
    dirtyTrackerRef.current.markFullRedraw();
  }, [enabled, sheet, table, dirtyTrackerRef]);

  const insertRecordInGroup = useCallback((
    groupContext: Record<string, unknown>,
    groupPathKey: string,
    addRecordDisplayRow: number,
  ) => {
    if (!enabled || !groupLayout) return;
    const insertIndex = resolveGroupInsertRecordIndex(groupLayout.items, addRecordDisplayRow);
    if (insertIndex < 0) return;
    table.insertRows(insertIndex, 1);
    applyGroupContextToRow(
      (row, col, value, options) => table.setCellValue(row, col, value, options),
      insertIndex,
      groupContext,
      columnDefs,
    );
    setCollapsedGroupKeys(prev => {
      const next = expandGroupPathKeys(prev, groupPathKey);
      const view = ensureActiveBaseView(sheet);
      updateCollapsedGroupKeys(view, next);
      return next;
    });
    table.notifyChange(null);
    dirtyTrackerRef.current.markFullRedraw();
    useSheetStore.getState().setStatusText('已在分组内添加记录');
  }, [enabled, table, groupLayout, columnDefs, sheet, dirtyTrackerRef]);

  return {
    activeBaseView,
    groupRules,
    viewFilter,
    viewSort,
    groupedRecordIndices,
    filteredRecordSet,
    flatSortedLayout,
    hasActiveViewFilter,
    hasActiveViewSort,
    groupLayout,
    gridRowCount,
    isGroupedView,
    collapsedGroupKeys,
    collapsedGroupKeySet,
    getGroupFieldValue,
    resolveGridRecordRow,
    checkedRowsForRender,
    skipGroupGridLine,
    isGroupDisplayRow,
    resolveGroupedCardLeft: resolveGroupedCardLeftFn,
    fillGroupedRowHighlight,
    toggleGroupCollapse,
    insertRecordInGroup,
    getActiveBaseView: () => (enabled ? getActiveBaseView(sheet) : null),
  };
}
