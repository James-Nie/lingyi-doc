import { useMemo } from 'react';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { BaseView, ColumnDef } from '@lingyi-doc/core-types';
import { formatGroupLabel, getGroupKey, GROUP_EMPTY_KEY, prepareGroupedRecordIndices } from '@lingyi-doc/core-sheet';
import { isBaseSheet } from '@lingyi-doc/core-types';

export interface KanbanColumnData {
  key: string;
  label: string;
  color?: string;
  recordIndices: number[];
}

export interface KanbanBoardData {
  groupFieldId: string | undefined;
  groupField: ColumnDef | undefined;
  columns: KanbanColumnData[];
  titleFieldId: string | undefined;
  cardFieldIds: string[];
  showFieldNames: boolean;
  coverFieldId: string | null;
  columnWidth: number;
  filteredCount: number;
}

function resolveDefaultCardFields(
  columnDefs: ColumnDef[],
  titleFieldId: string | undefined,
  groupFieldId: string | undefined,
  configured?: string[],
): string[] {
  if (configured?.length) {
    return configured.filter(id => columnDefs.some(c => c.id === id && !c.hidden));
  }
  const result: string[] = [];
  for (const col of columnDefs) {
    if (col.hidden) continue;
    if (col.id === titleFieldId) continue;
    if (col.id === groupFieldId) continue;
    result.push(col.id);
    if (result.length >= 4) break;
  }
  return result;
}

function buildColumns(
  groupField: ColumnDef | undefined,
  recordIndices: number[],
  getFieldValue: (rowIndex: number, fieldId: string) => unknown,
): KanbanColumnData[] {
  if (!groupField) {
    return [{
      key: '__all__',
      label: '全部',
      recordIndices: [...recordIndices],
    }];
  }

  const buckets = new Map<string, number[]>();
  const orderedKeys: string[] = [];

  if (groupField.type === 'select' || groupField.type === 'multiSelect') {
    for (const opt of groupField.options || []) {
      orderedKeys.push(opt.id);
      buckets.set(opt.id, []);
    }
  }

  buckets.set(GROUP_EMPTY_KEY, []);

  for (const rowIndex of recordIndices) {
    const raw = getFieldValue(rowIndex, groupField.id);
    const key = getGroupKey(raw);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      orderedKeys.push(key);
    }
    buckets.get(key)!.push(rowIndex);
  }

  const columns: KanbanColumnData[] = [];
  const seen = new Set<string>();

  const pushCol = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    const records = buckets.get(key) || [];
    if (key === GROUP_EMPTY_KEY && records.length === 0 && (groupField.options?.length ?? 0) > 0) {
      // 有选项时仍展示空「未分组」列，便于拖入
    }
    const opt = groupField.options?.find(o => o.id === key || o.name === key);
    columns.push({
      key,
      label: key === GROUP_EMPTY_KEY ? '未分组' : formatGroupLabel(key, groupField),
      color: opt?.color,
      recordIndices: records,
    });
  };

  for (const key of orderedKeys) {
    if (key === GROUP_EMPTY_KEY) continue;
    pushCol(key);
  }
  pushCol(GROUP_EMPTY_KEY);

  // 无选项字段：只展示有数据的列 + 未分组
  if (groupField.type !== 'select' && groupField.type !== 'multiSelect') {
    return columns.filter(c => c.key === GROUP_EMPTY_KEY || c.recordIndices.length > 0);
  }

  return columns;
}

export function useKanbanBoardData(
  table: FreeTable,
  view: BaseView,
  revision: number,
): KanbanBoardData {
  return useMemo(() => {
    void revision;
    const sheetModel = table.sheet;
    if (!isBaseSheet(sheetModel)) {
      return {
        groupFieldId: undefined,
        groupField: undefined,
        columns: [],
        titleFieldId: undefined,
        cardFieldIds: [],
        showFieldNames: false,
        coverFieldId: null,
        columnWidth: 280,
        filteredCount: 0,
      };
    }

    const columnDefs = sheetModel.columnDefs;
    const groupFieldId = view.config.kanbanGroupFieldId;
    const groupField = groupFieldId
      ? columnDefs.find(c => c.id === groupFieldId)
      : undefined;

    const getFieldValue = (rowIndex: number, fieldId: string) => {
      const colIndex = columnDefs.findIndex(c => c.id === fieldId);
      return colIndex >= 0 ? table.getCell(rowIndex, colIndex)?.value : undefined;
    };

    const recordIndices = prepareGroupedRecordIndices({
      rowCount: sheetModel.rowCount,
      filter: view.filter,
      filterConjunction: view.filterConjunction,
      sort: view.sort,
      columnDefs,
      getFieldValue,
    });

    const titleFieldId = columnDefs.find(c => !c.hidden)?.id;
    const cardFieldIds = resolveDefaultCardFields(
      columnDefs,
      titleFieldId,
      groupFieldId,
      view.config.kanbanCardFields,
    );

    return {
      groupFieldId,
      groupField,
      columns: buildColumns(groupField, recordIndices, getFieldValue),
      titleFieldId,
      cardFieldIds,
      showFieldNames: view.config.kanbanShowFieldNames === true,
      coverFieldId: view.config.kanbanCoverFieldId ?? null,
      columnWidth: view.config.kanbanColumnWidth ?? 280,
      filteredCount: recordIndices.length,
    };
  }, [table, view, revision, table.rowCount]);
}
