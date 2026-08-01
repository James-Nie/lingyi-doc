import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/zh-cn';
import { getCellText } from '@lingyi-doc/core-types';
import type { RecordRow, ColumnDef, CellValue } from '@lingyi-doc/core-types';

dayjs.locale('zh-cn');

export interface CalendarCardData {
  recordId: string;
  title: string;
  startDate: Dayjs | null;
  endDate: Dayjs | null;
  color: string;
  fields: Record<string, unknown>;
  spanDays: number;
  isContinuation: boolean;
}

export interface CalendarCellData {
  date: Dayjs;
  records: CalendarCardData[];
  isCurrentMonth: boolean;
  isToday: boolean;
}

export type CalendarColorKey = 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'purple' | 'gray';

export const CALENDAR_COLORS: Record<CalendarColorKey, { bg: string; border: string; text: string }> = {
  red:    { bg: '#FCE8E6', border: '#F05A4E', text: '#D93025' },
  orange: { bg: '#FFF3E0', border: '#FFAD4A', text: '#D96C00' },
  yellow: { bg: '#FEF7E0', border: '#FFE455', text: '#B06000' },
  green:  { bg: '#E6F4EA', border: '#4CAF50', text: '#1E8E3E' },
  cyan:   { bg: '#E0F7FA', border: '#4EC9B0', text: '#00838F' },
  blue:   { bg: '#E8F0FE', border: '#5B8FF9', text: '#1967D2' },
  purple: { bg: '#F3E8FD', border: '#9F7AEA', text: '#8430CE' },
  gray:   { bg: '#F1F3F4', border: '#9CA3AF', text: '#5F6368' },
};

export function formatDateKey(date: Dayjs): string {
  return date.format('YYYY-MM-DD');
}

export function parseDateValue(value: unknown): Dayjs | null {
  if (!value) return null;
  if (dayjs.isDayjs(value)) return value;
  if (value instanceof Date) return dayjs(value);
  if (typeof value === 'number') return dayjs(value);
  if (typeof value === 'string') {
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed : null;
  }
  // 处理 CellValue 对象格式: { type: 'date' | 'datetime', timestamp: number }
  if (typeof value === 'object' && 'type' in value && 'timestamp' in value) {
    const cell = value as { type: string; timestamp: number };
    if ((cell.type === 'date' || cell.type === 'datetime') && typeof cell.timestamp === 'number') {
      return dayjs(cell.timestamp);
    }
  }
  return null;
}

export function createCardData(
  record: RecordRow,
  columns: ColumnDef[],
  dateFieldId: string,
  endDateFieldId?: string,
  titleFieldId?: string,
  colorFieldId?: string,
  defaultColor?: string,
): CalendarCardData {
  const startDate = parseDateValue(record[dateFieldId]);
  const endDate = endDateFieldId ? parseDateValue(record[endDateFieldId]) : null;

  let title = '';
  if (titleFieldId) {
    const val = record[titleFieldId];
    title = val != null ? getCellText(val as CellValue) : '';
  } else {
    const firstCol = columns.find(c => c.id !== dateFieldId && c.id !== endDateFieldId);
    if (firstCol) {
      const val = record[firstCol.id];
      title = val != null ? getCellText(val as CellValue) : '';
    }
  }

  let color: CalendarColorKey = 'blue';
  if (colorFieldId) {
    const val = record[colorFieldId];
    if (val) {
      const text = getCellText(val as CellValue);
      const colorField = columns.find(c => c.id === colorFieldId);
      if (colorField && (colorField.type === 'select' || colorField.type === 'multiSelect')) {
        const opt = colorField.options?.find(o => o.id === text || o.name === text);
        if (opt?.color) {
          const calColor = Object.entries(CALENDAR_COLORS).find(([, v]) => v.border === opt.color);
          if (calColor) color = calColor[0] as CalendarColorKey;
        }
      } else if (text in CALENDAR_COLORS) {
        color = text as CalendarColorKey;
      }
    }
  } else if (defaultColor && defaultColor in CALENDAR_COLORS) {
    color = defaultColor as CalendarColorKey;
  }

  return {
    recordId: (record._id as string) || (record.id as string) || '',
    title: title || '未命名',
    startDate,
    endDate: endDate || startDate,
    color,
    fields: record,
    spanDays: 1,
    isContinuation: false,
  };
}

export function groupRecordsByDate(
  records: RecordRow[],
  columns: ColumnDef[],
  dateFieldId: string,
  endDateFieldId?: string,
  titleFieldId?: string,
  colorFieldId?: string,
  defaultColor?: string,
): { dateMap: Map<string, CalendarCardData[]>; noDateRecords: CalendarCardData[] } {
  const dateMap = new Map<string, CalendarCardData[]>();
  const noDateRecords: CalendarCardData[] = [];

  for (const record of records) {
    const cardData = createCardData(record, columns, dateFieldId, endDateFieldId, titleFieldId, colorFieldId, defaultColor);
    if (!cardData.startDate) {
      noDateRecords.push(cardData);
      continue;
    }

    let start = cardData.startDate;
    let end = cardData.endDate || start;

    if (end.isBefore(start, 'day')) {
      end = start;
    }

    const current = start.startOf('day');
    const endDay = end.startOf('day');
    const spanDays = endDay.diff(current, 'day') + 1;

    let day = current;
    let dayIndex = 0;
    while (day.isBefore(endDay) || day.isSame(endDay)) {
      const key = formatDateKey(day);
      if (!dateMap.has(key)) {
        dateMap.set(key, []);
      }
      dateMap.get(key)!.push({
        ...cardData,
        spanDays,
        isContinuation: dayIndex > 0,
      });
      day = day.add(1, 'day');
      dayIndex++;
    }
  }

  return { dateMap, noDateRecords };
}

export function getWeekStartOf(date: Dayjs, weekStart: 0 | 1): Dayjs {
  const day = date.day();
  const diff = (day - weekStart + 7) % 7;
  return date.subtract(diff, 'day').startOf('day');
}

export function getMonthGridDates(currentDate: Dayjs, weekStart: 0 | 1 = 1): Dayjs[] {
  const firstDay = currentDate.startOf('month');
  const start = getWeekStartOf(firstDay, weekStart);
  const dates: Dayjs[] = [];
  
  for (let i = 0; i < 42; i++) {
    dates.push(start.add(i, 'day'));
  }
  
  return dates;
}

export function getWeekDates(currentDate: Dayjs, weekStart: 0 | 1 = 1): Dayjs[] {
  const start = getWeekStartOf(currentDate, weekStart);
  const dates: Dayjs[] = [];
  
  for (let i = 0; i < 7; i++) {
    dates.push(start.add(i, 'day'));
  }
  
  return dates;
}

export function getDateRangeForView(currentDate: Dayjs, viewType: 'month' | 'week' | 'day'): { start: Dayjs; end: Dayjs } {
  switch (viewType) {
    case 'month':
      return {
        start: currentDate.startOf('month').startOf('week'),
        end: currentDate.endOf('month').endOf('week'),
      };
    case 'week':
      return {
        start: currentDate.startOf('week'),
        end: currentDate.endOf('week'),
      };
    case 'day':
    default:
      return {
        start: currentDate.startOf('day'),
        end: currentDate.endOf('day'),
      };
  }
}

export function isAllDayEvent(card: CalendarCardData): boolean {
  if (!card.startDate) return true;
  return card.startDate.hour() === 0 && card.startDate.minute() === 0;
}

export function getEventsByHour(
  cards: CalendarCardData[],
  hour: number,
): CalendarCardData[] {
  return cards.filter(c => c.startDate && c.startDate.hour() === hour);
}

export function getCellRecords(
  dateMap: Map<string, CalendarCardData[]>,
  date: Dayjs,
  maxCards = 3,
): { records: CalendarCardData[]; showMore: boolean; totalCount: number } {
  const key = formatDateKey(date);
  const records = dateMap.get(key) || [];
  const totalCount = records.length;
  const showMore = totalCount > maxCards;
  
  return {
    records: records.slice(0, maxCards),
    showMore,
    totalCount,
  };
}

export interface SpanLayout {
  card: CalendarCardData;
  startCol: number;
  colSpan: number;
  isContinuation: boolean;
}

export function buildWeekSpanLayout(
  weekDates: Dayjs[],
  dateMap: Map<string, CalendarCardData[]>,
): SpanLayout[] {
  const spans: SpanLayout[] = [];
  const processed = new Set<string>();

  const weekKeys = weekDates.map(d => formatDateKey(d));

  for (let colIdx = 0; colIdx < weekKeys.length; colIdx++) {
    const key = weekKeys[colIdx];
    const date = weekDates[colIdx];
    const cards = dateMap.get(key) || [];

    for (const card of cards) {
      if (card.spanDays <= 1) continue;
      const dedupKey = `${card.recordId}`;
      if (processed.has(dedupKey)) continue;
      processed.add(dedupKey);

      const startDateKey = card.startDate ? formatDateKey(card.startDate) : '';
      const startColIdx = weekKeys.indexOf(startDateKey);

      if (startColIdx < 0) {
        if (card.isContinuation && card.endDate) {
          const endKey = formatDateKey(card.endDate);
          const endColIdx = weekKeys.indexOf(endKey);
          const colSpan = endColIdx >= 0 ? endColIdx + 1 : weekKeys.length;
          spans.push({ card, startCol: 1, colSpan, isContinuation: true });
        }
        continue;
      }

      const colSpan = Math.min(card.spanDays, weekKeys.length - startColIdx);
      spans.push({ card, startCol: startColIdx + 1, colSpan, isContinuation: false });
    }
  }

  return spans;
}

export function isContinuationOnly(card: CalendarCardData): boolean {
  return card.isContinuation && card.spanDays > 1;
}

export function getWeekDays(weekStart: 0 | 1 = 1): string[] {
  if (weekStart === 0) return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
}

export function formatMonthYear(date: Dayjs): string {
  return date.format('YYYY年M月');
}

export function formatCalendarTitle(date: Dayjs, viewType: 'month' | 'week' | 'day', weekStart: 0 | 1 = 1): string {
  switch (viewType) {
    case 'week': {
      const start = getWeekStartOf(date, weekStart);
      const end = start.add(6, 'day');
      return `${start.format('YYYY年M月D日')} - ${end.format('M月D日')}`;
    }
    case 'day':
      return date.format('YYYY年M月D日 dddd');
    case 'month':
    default:
      return date.format('YYYY年M月');
  }
}