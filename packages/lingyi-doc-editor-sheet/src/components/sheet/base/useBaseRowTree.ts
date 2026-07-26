import { useCallback, useMemo, useState } from 'react';
import { buildRowHeaderMeta, type FreeTable } from '@lingyi-doc/core-sheet';
import type { BaseSheetModel, RecordRow } from '@lingyi-doc/core-types';

export interface UseBaseRowTreeOptions {
  enabled: boolean;
  table: FreeTable;
  sheet: BaseSheetModel;
  sheetRows: RecordRow[];
}

export function useBaseRowTree({ enabled, table, sheet, sheetRows }: UseBaseRowTreeOptions) {
  const [collapsedRowIds, setCollapsedRowIds] = useState<string[]>([]);
  const collapsedRowIdSet = useMemo(() => new Set(collapsedRowIds), [collapsedRowIds]);

  const rowTreeMeta = useMemo(() => {
    if (!enabled) return undefined;
    table.ensureRowRecords();
    return buildRowHeaderMeta(sheet.rowCount, sheetRows, collapsedRowIdSet);
  }, [enabled, sheet.rowCount, sheetRows, collapsedRowIdSet, table]);

  const toggleRowCollapse = useCallback((rowIndex: number) => {
    if (!enabled) return;
    const record = table.getRowRecord(rowIndex);
    if (!record) return;
    setCollapsedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(record._id)) next.delete(record._id);
      else next.add(record._id);
      return Array.from(next);
    });
  }, [enabled, table]);

  return {
    collapsedRowIds,
    collapsedRowIdSet,
    rowTreeMeta,
    toggleRowCollapse,
    setCollapsedRowIds,
  };
}
