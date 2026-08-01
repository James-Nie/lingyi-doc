import React, { useMemo, useCallback, useEffect } from 'react';
import { Drawer, Modal, List, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { BaseView, RecordRow, ColumnDef } from '@lingyi-doc/core-types';
import {
  CalendarCardData,
  groupRecordsByDate,
  formatCalendarTitle,
} from './calendarUtils';
import { CalendarCanvasView } from './CalendarCanvasView';
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
  const [showMoreModal, setShowMoreModal] = React.useState<{ open: boolean; date: Dayjs | null; cards: CalendarCardData[] }>({ open: false, date: null, cards: [] });

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
    console.log('[CalendarView] records.length:', records.length);
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
      const dateKey = date.format('YYYY-MM-DD');
      const cards = dateMap.get(dateKey) || [];
      setShowMoreModal({ open: true, date, cards });
    },
    [dateMap],
  );

  const handleShowMoreItemClick = useCallback(
    (card: CalendarCardData) => {
      setShowMoreModal(prev => ({ ...prev, open: false }));
      onCardClick?.(card.recordId);
    },
    [onCardClick],
  );

  const isEmpty = !dateFieldId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      <CalendarNavigationBar
        title={formatCalendarTitle(currentDate, viewType, weekStart)}
        currentDate={currentDate}
        viewType={viewType}
        onViewTypeChange={onViewTypeChange}
        onNavigate={handleNavigate}
        onCurrentDateChange={onCurrentDateChange}
      />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
          <CalendarCanvasView
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
          width={360}
          open={noDateDrawerOpen}
          onClose={() => onNoDateDrawerOpenChange(false)}
          styles={{
            body: { padding: '8px 16px' },
          }}
        >
          <CalendarNoDateSection
            records={noDateRecords}
            onCardClick={handleCardClick}
          />
        </Drawer>
      )}

      {/* 超出记录弹窗 */}
      <Modal
        title={showMoreModal.date ? `${showMoreModal.date.format('M月D日')} ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][showMoreModal.date.day()]}` : ''}
        open={showMoreModal.open}
        onCancel={() => setShowMoreModal(prev => ({ ...prev, open: false }))}
        footer={null}
        width={400}
      >
        <List
          dataSource={showMoreModal.cards}
          renderItem={(card) => (
            <List.Item
              style={{ cursor: 'pointer', padding: '12px 16px', borderBottom: '1px solid #f0f1f2' }}
              onClick={() => handleShowMoreItemClick(card)}
            >
              <List.Item.Meta
                avatar={
                  <div
                    style={{
                      width: 8,
                      height: 20,
                      borderRadius: 2,
                      background: card.color || '#3370ff',
                    }}
                  />
                }
                title={<Typography.Text>{card.title}</Typography.Text>}
                description={
                  card.startDate
                    ? dayjs(card.startDate).format('HH:mm') + (card.endDate ? ` - ${dayjs(card.endDate).format('HH:mm')}` : '')
                    : '全天'
                }
              />
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
};

export default CalendarView;
