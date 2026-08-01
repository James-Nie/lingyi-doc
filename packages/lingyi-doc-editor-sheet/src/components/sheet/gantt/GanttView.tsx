import React, { useMemo, useCallback, useState } from 'react';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { BaseView, RecordRow, ColumnDef } from '@lingyi-doc/core-types';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import {
  groupRecordsForGantt,
  formatGanttTitle,
  GanttTaskData,
  GanttViewType,
  getGanttRange,
} from './ganttUtils';
import { GanttCanvasView } from './GanttCanvasView';
import { GanttNavigationBar } from './GanttNavigationBar';
import type { GanttHeaderViewType } from '@lingyi-doc/core-sheet';

interface GanttViewProps {
  table: FreeTable;
  view: BaseView;
  records: RecordRow[];
  columns: ColumnDef[];
  onRecordCreate: (data: Partial<RecordRow>) => void;
  onCardClick?: (recordId: string) => void;
  onConfigChange: (config: Partial<BaseView['config']>) => void;
  currentDate?: Dayjs;
  onCurrentDateChange?: (date: Dayjs) => void;
  viewType?: GanttViewType;
  onViewTypeChange?: (type: GanttViewType) => void;
}

const EXTEND_MONTHS = 3;

export const GanttView: React.FC<GanttViewProps> = ({
  table,
  view,
  records,
  columns,
  onRecordCreate,
  onCardClick,
  onConfigChange,
  currentDate: currentDateProp,
  onCurrentDateChange: onCurrentDateChangeProp,
  viewType: viewTypeProp,
  onViewTypeChange: onViewTypeChangeProp,
}) => {
  const config = view.config;

  const [internalDate, setInternalDate] = React.useState<Dayjs>(dayjs());
  const [internalViewType, setInternalViewType] = React.useState<GanttViewType>(
    (config.ganttTimeUnit as GanttViewType) || 'week',
  );
  const [headerViewType, setHeaderViewType] = React.useState<GanttHeaderViewType>(
    (config.ganttTimeUnit as GanttViewType) === 'quarter'
      ? 'week'
      : (config.ganttTimeUnit as GanttViewType) === 'month'
        ? 'month'
        : 'day',
  );

  const currentDate = currentDateProp ?? internalDate;
  const onCurrentDateChange = onCurrentDateChangeProp ?? setInternalDate;
  const viewType = viewTypeProp ?? internalViewType;
  const onViewTypeChange = onViewTypeChangeProp ?? setInternalViewType;

  const titleFieldId = config.ganttTaskNameFieldId;
  const startDateFieldId = config.ganttStartDateFieldId;

  const [explicitRange, setExplicitRange] = useState<{ rangeStart: Dayjs; rangeEnd: Dayjs } | null>(null);

  const { tasks, headerColumns, monthGroups, weekGroups, rangeStart, rangeEnd, pixelsPerDay } = useMemo(() => {
    if (!startDateFieldId) {
      return {
        tasks: [],
        headerColumns: [],
        monthGroups: [],
        weekGroups: [],
        rangeStart: dayjs(),
        rangeEnd: dayjs(),
        pixelsPerDay: 80,
      };
    }
    return groupRecordsForGantt(records, columns, config, viewType, currentDate, explicitRange ?? undefined);
  }, [records, columns, config, viewType, currentDate, startDateFieldId, explicitRange]);

  const handleExtendRange = useCallback(
    (direction: 'left' | 'right') => {
      setExplicitRange(prev => {
        const base = prev || getGanttRange(currentDate, viewType);
        if (direction === 'left') {
          return { rangeStart: base.rangeStart.subtract(EXTEND_MONTHS, 'month'), rangeEnd: base.rangeEnd };
        }
        return { rangeStart: base.rangeStart, rangeEnd: base.rangeEnd.add(EXTEND_MONTHS, 'month') };
      });
    },
    [currentDate, viewType],
  );

  const handleTaskClick = useCallback(
    (task: GanttTaskData) => {
      onCardClick?.(task.recordId);
    },
    [onCardClick],
  );

  const handleRowClick = useCallback(
    (task: GanttTaskData) => {
      onCardClick?.(task.recordId);
    },
    [onCardClick],
  );

  const handleNavigate = useCallback(
    (direction: 'prev' | 'next' | 'today') => {
      if (direction === 'today') {
        onCurrentDateChange(dayjs());
        setExplicitRange(null);
        return;
      }
      const shift = direction === 'prev' ? -1 : 1;
      const unit = viewType === 'week' ? 'week' : 'month';
      onCurrentDateChange(currentDate.add(shift, unit));
    },
    [viewType, currentDate, onCurrentDateChange],
  );

  const handleViewTypeChange = useCallback(
    (type: GanttViewType) => {
      onViewTypeChange(type);
      setExplicitRange(null);
    },
    [onViewTypeChange],
  );

  const isEmpty = !startDateFieldId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      <GanttNavigationBar
        title={formatGanttTitle(currentDate, viewType)}
        viewType={viewType}
        onViewTypeChange={handleViewTypeChange}
        headerViewType={headerViewType}
        onHeaderViewTypeChange={setHeaderViewType}
        onNavigate={handleNavigate}
      />

      {isEmpty ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: 400,
            color: '#8f959e',
            fontSize: 14,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 12 }}>📊</div>
            <div style={{ marginBottom: 8 }}>请在顶部工具栏的"甘特图配置"中选择日期字段</div>
          </div>
        </div>
      ) : tasks.length === 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: 400,
            color: '#8f959e',
            fontSize: 14,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 12 }}>📋</div>
            <div>暂无任务，请选择合适的日期字段或添加记录</div>
          </div>
        </div>
      ) : (
        <GanttCanvasView
          table={table}
          tasks={tasks}
          headerColumns={headerColumns}
          monthGroups={monthGroups}
          weekGroups={weekGroups}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          pixelsPerDay={pixelsPerDay}
          viewType={viewType}
          headerViewType={headerViewType}
          onTaskClick={handleTaskClick}
          onRowClick={handleRowClick}
          onAddRecord={() => onRecordCreate({})}
          leftHeaderLabel={titleFieldId ? columns.find(c => c.id === titleFieldId)?.name : undefined}
          onExtendRange={handleExtendRange}
        />
      )}
    </div>
  );
};

export default GanttView;
