import React, { useMemo, useCallback, useEffect } from 'react';
import { Drawer } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { BaseView, RecordRow, ColumnDef } from '@lingyi-doc/core-types';
import {
  CalendarCardData,
  groupRecordsByDate,
  formatCalendarTitle,
} from './calendarUtils';
import { CalendarGrid } from './CalendarGrid';
import { CalendarNavigationBar } from './CalendarNavigationBar';
import { CalendarNoDateSection } from './CalendarNoDateSection';

interface CalendarViewProps {
  view: BaseView;
  records: RecordRow[];
  columns: ColumnDef[];
  onRecordCreate: (data: Partial<RecordRow>) => void;
  onCardClick?: (recordId: string) => void;
  onConfigChange: (config: Partial<BaseView['config']>) => void;
  currentDate?: Dayjs;
  onCurrentDateChange?: (date: Dayjs) => void;
  viewType?: 'month' | 'week' | 'day';
  onViewTypeChange?: (type: 'month' | 'week' | 'day') => void;
  noDateDrawerOpen?: boolean;
  onNoDateDrawerOpenChange?: (open: boolean) => void;
  onNoDateCountChange?: (count: number) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
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
  noDateDrawerOpen: noDateDrawerOpenProp,
  onNoDateDrawerOpenChange: onNoDateDrawerOpenChangeProp,
  onNoDateCountChange,
}) => {
  const config = view.config;

  const [internalDate, setInternalDate] = React.useState<Dayjs>(dayjs());
  const [internalViewType, setInternalViewType] = React.useState<'month' | 'week' | 'day'>(
    config.calendarViewType || 'month',
  );
  const [internalNoDateOpen, setInternalNoDateOpen] = React.useState<boolean>(false);

  const currentDate = currentDateProp ?? internalDate;
  const onCurrentDateChange = onCurrentDateChangeProp ?? setInternalDate;
  const viewType = viewTypeProp ?? internalViewType;
  const onViewTypeChange = onViewTypeChangeProp ?? setInternalViewType;
  const noDateDrawerOpen = noDateDrawerOpenProp ?? internalNoDateOpen;
  const onNoDateDrawerOpenChange = onNoDateDrawerOpenChangeProp ?? setInternalNoDateOpen;
  const showNoDateSection = config.calendarShowNoDateSection ?? true;
  const showWeekend = config.calendarShowWeekend ?? true;
  const weekStart = config.calendarWeekStart ?? 1;

  const dateFieldId = config.calendarDateFieldId;
  const endDateFieldId = config.calendarEndDateFieldId;
  const titleFieldId = config.calendarCardTitleFieldId;
  const colorFieldId = config.calendarCardColorFieldId;
  const defaultColor = config.calendarDefaultColor;
  const maxCards = config.calendarMaxCardsPerCell || 3;

  const { dateMap, noDateRecords } = useMemo(() => {
    if (!dateFieldId) {
      return { dateMap: new Map<string, CalendarCardData[]>(), noDateRecords: [] };
    }
    return groupRecordsByDate(
      records,
      columns,
      dateFieldId,
      endDateFieldId,
      titleFieldId,
      colorFieldId,
      defaultColor,
    );
  }, [records, columns, dateFieldId, endDateFieldId, titleFieldId, colorFieldId, defaultColor]);

  useEffect(() => {
    onNoDateCountChange?.(noDateRecords.length);
  }, [noDateRecords.length, onNoDateCountChange]);

  const handleCardClick = useCallback(
    (card: CalendarCardData) => {
      onCardClick?.(card.recordId);
    },
    [onCardClick],
  );

  const handleCreateRecord = useCallback(
    (date: Dayjs) => {
      if (!dateFieldId) return;
      onRecordCreate({
        [dateFieldId]: date.toISOString(),
      });
    },
    [dateFieldId, onRecordCreate],
  );

  const handleNavigate = useCallback(
    (direction: 'prev' | 'next' | 'today') => {
      switch (direction) {
        case 'prev':
          if (viewType === 'month') onCurrentDateChange(currentDate.subtract(1, 'month'));
          else if (viewType === 'week') onCurrentDateChange(currentDate.subtract(1, 'week'));
          else onCurrentDateChange(currentDate.subtract(1, 'day'));
          break;
        case 'next':
          if (viewType === 'month') onCurrentDateChange(currentDate.add(1, 'month'));
          else if (viewType === 'week') onCurrentDateChange(currentDate.add(1, 'week'));
          else onCurrentDateChange(currentDate.add(1, 'day'));
          break;
        case 'today':
          onCurrentDateChange(dayjs());
          break;
      }
    },
    [viewType, currentDate, onCurrentDateChange],
  );

  const handleShowMore = useCallback(
    (date: Dayjs) => {
      onCurrentDateChange(date);
      onViewTypeChange('day');
    },
    [onCurrentDateChange, onViewTypeChange],
  );

  const isEmpty = !dateFieldId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      <CalendarNavigationBar
        title={formatCalendarTitle(currentDate, viewType, weekStart)}
        viewType={viewType}
        onViewTypeChange={onViewTypeChange}
        onNavigate={handleNavigate}
      />

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {isEmpty ? (
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', minHeight: 400, color: '#8f959e', fontSize: 14,
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: 12 }}>📅</div>
              <div style={{ marginBottom: 8 }}>请在顶部工具栏的"日历配置"中选择日期字段</div>
            </div>
          </div>
        ) : (
          <CalendarGrid
            viewType={viewType}
            currentDate={currentDate}
            dateMap={dateMap}
            maxCards={maxCards}
            showWeekend={showWeekend}
            weekStart={weekStart}
            onCardClick={handleCardClick}
            onCreateRecord={handleCreateRecord}
            onShowMore={handleShowMore}
          />
        )}
      </div>

      {showNoDateSection && noDateRecords.length > 0 && (
        <Drawer
          title={`无日期的记录 (${noDateRecords.length})`}
          placement="right"
          open={noDateDrawerOpen}
          onClose={() => onNoDateDrawerOpenChange(false)}
          styles={{
            body: { padding: '8px 16px' },
            root: { width: 360 },
          }}
        >
          <CalendarNoDateSection
            records={noDateRecords}
            onCardClick={handleCardClick}
          />
        </Drawer>
      )}
    </div>
  );
};

export default CalendarView;
