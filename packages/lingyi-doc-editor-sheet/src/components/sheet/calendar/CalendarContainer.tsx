import React, { useMemo, useCallback, useState } from 'react';
import type { BaseSheetModel, BaseView, RecordRow } from '@lingyi-doc/core-types';
import type { Dayjs } from 'dayjs';
import { CalendarView } from './CalendarView';
import { SheetGridHost } from '../shared/SheetGridContext';

interface CalendarContainerProps {
  table: { sheet: BaseSheetModel };
  view: BaseView;
  dataVersion?: number;
  onRecordCreate: (data: Partial<RecordRow>) => void;
  onCardClick?: (recordId: string) => void;
  currentDate?: Dayjs;
  onCurrentDateChange?: (date: Dayjs) => void;
  viewType?: 'month' | 'week' | 'day';
  onViewTypeChange?: (type: 'month' | 'week' | 'day') => void;
  noDateDrawerOpen?: boolean;
  onNoDateDrawerOpenChange?: (open: boolean) => void;
  onNoDateCountChange?: (count: number) => void;
}

export const CalendarContainer: React.FC<CalendarContainerProps> = ({
  table,
  view,
  dataVersion,
  onRecordCreate,
  onCardClick,
  currentDate,
  onCurrentDateChange,
  viewType,
  onViewTypeChange,
  noDateDrawerOpen,
  onNoDateDrawerOpenChange,
  onNoDateCountChange,
}) => {
  const [, forceUpdate] = useState(0);

  const records = useMemo(() => {
    const sheet = table.sheet;
    if (sheet.type !== 'base') return [];
    return sheet.rows || [];
  }, [table, dataVersion]);

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
    <SheetGridHost mode="base">
      <CalendarView
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
        noDateDrawerOpen={noDateDrawerOpen}
        onNoDateDrawerOpenChange={onNoDateDrawerOpenChange}
        onNoDateCountChange={onNoDateCountChange}
      />
    </SheetGridHost>
  );
};
