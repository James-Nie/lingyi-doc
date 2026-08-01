import React, { useMemo, useCallback, useState, useEffect } from 'react';
import type { BaseView, RecordRow } from '@lingyi-doc/core-types';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import { applyBaseFilter, applyBaseSort } from '@lingyi-doc/core-sheet';
import type { Dayjs } from 'dayjs';
import { GanttView } from './GanttView';
import { GanttViewType } from './ganttUtils';

interface GanttContainerProps {
  table: FreeTable;
  view: BaseView;
  dataVersion?: number;
  onRecordCreate: (data: Partial<RecordRow>) => void;
  onCardClick?: (recordId: string) => void;
  currentDate?: Dayjs;
  onCurrentDateChange?: (date: Dayjs) => void;
  viewType?: GanttViewType;
  onViewTypeChange?: (type: GanttViewType) => void;
}

export const GanttContainer: React.FC<GanttContainerProps> = ({
  table,
  view,
  dataVersion,
  onRecordCreate,
  onCardClick,
  currentDate,
  onCurrentDateChange,
  viewType,
  onViewTypeChange,
}) => {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (dataVersion != null) {
      forceUpdate(v => v + 1);
    }
  }, [dataVersion]);

  const records = useMemo(() => {
    const sheet = table.sheet;
    if (sheet.type !== 'base') return [];
    const { columnDefs, rows } = sheet;
    if (!rows || rows.length === 0) return [];

    const getFieldValue = (rowIndex: number, fieldId: string) => {
      const colIndex = columnDefs.findIndex(c => c.id === fieldId);
      if (colIndex < 0) return undefined;
      return table.getCell(rowIndex, colIndex)?.value;
    };

    let indices = Array.from({ length: rows.length }, (_, i) => i);
    indices = applyBaseFilter(indices, view.filter, getFieldValue, columnDefs, view.filterConjunction ?? 'and');
    indices = applyBaseSort(indices, view.sort, columnDefs, getFieldValue);

    return indices.map(rowIndex => {
      const assembled: RecordRow = { ...rows[rowIndex] };
      (assembled as any)._rowIndex = rowIndex;
      columnDefs.forEach((col, colIdx) => {
        const cell = table.getCell(rowIndex, colIdx);
        if (cell?.value != null) {
          (assembled as any)[col.id] = cell.value;
        }
      });
      return assembled;
    });
  }, [table, dataVersion, view.filter, view.filterConjunction, view.sort]);

  const columns = useMemo(() => {
    const sheet = table.sheet;
    if (sheet.type !== 'base') return [];
    return sheet.columnDefs || [];
  }, [table, dataVersion]);

  const handleConfigChange = useCallback(
    (config: Partial<BaseView['config']>) => {
      view.config = { ...view.config, ...config };
      forceUpdate(v => v + 1);
    },
    [view],
  );

  return (
    <GanttView
      table={table}
      view={view}
      records={records}
      columns={columns}
      onRecordCreate={onRecordCreate}
      onCardClick={onCardClick}
      onConfigChange={handleConfigChange}
      currentDate={currentDate}
      onCurrentDateChange={onCurrentDateChange}
      viewType={viewType}
      onViewTypeChange={onViewTypeChange}
    />
  );
};
