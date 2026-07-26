import { useMemo } from 'react';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { AggregatedDataset, DashboardWidget, FilterCondition } from '@lingyi-doc/core-types';
import { createBaseFieldGetter, runAggregate } from '@lingyi-doc/core-sheet';
import { isBaseSheet } from '@lingyi-doc/core-types';

export function useWidgetDataset(
  table: FreeTable,
  widget: DashboardWidget,
  globalFilters: FilterCondition[] | undefined,
  dataVersion: number,
): AggregatedDataset | null {
  return useMemo(() => {
    // 表格视图直接读 Base 明细，不走聚合
    if (widget.componentType === 'view.grid') return null;
    if (!widget.dataBinding?.query) return null;
    if (!isBaseSheet(table.sheet)) return null;
    const sheet = table.sheet;
    const sheetId = widget.dataBinding.query.sheetId || table.sheetId;
    const getFieldValue = createBaseFieldGetter(
      sheet.columnDefs,
      sheet.rows,
      (row, col) => table.getCell(row, col)?.value,
    );
    const listen = widget.dataBinding.listenGlobalFilters !== false;

    // 纠正历史错误：把 `__time_*` 误写入 groupBy 导致折线聚合失败
    const rawQuery = widget.dataBinding.query;
    const query = { ...rawQuery, sheetId };
    const brokenTimeGroup = query.groupBy?.find(g => g.fieldId.startsWith('__time_'));
    if (brokenTimeGroup && !query.timeBucket) {
      query.timeBucket = {
        fieldId: brokenTimeGroup.fieldId.slice('__time_'.length),
        unit: 'day',
      };
      query.groupBy = query.groupBy?.filter(g => !g.fieldId.startsWith('__time_'));
      if (!query.groupBy?.length) delete query.groupBy;
    }

    return runAggregate({
      sheetId,
      columnDefs: sheet.columnDefs,
      rows: sheet.rows,
      getFieldValue,
      query,
      extraFilters: listen ? globalFilters : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, widget, globalFilters, dataVersion]);
}
