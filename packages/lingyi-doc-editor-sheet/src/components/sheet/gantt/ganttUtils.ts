import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/zh-cn';
import { getCellText } from '@lingyi-doc/core-types';
import type { RecordRow, ColumnDef, CellValue, BaseViewConfig } from '@lingyi-doc/core-types';
import { parseDateValue } from '../calendar/calendarUtils';
import type { CalendarColorKey } from '../calendar/calendarUtils';
import { CALENDAR_COLORS } from '../calendar/calendarUtils';
export type { CalendarColorKey };
export { CALENDAR_COLORS };

dayjs.locale('zh-cn');

export type GanttViewType = 'week' | 'month' | 'quarter';

export interface GanttTaskData {
  recordId: string;
  rowIndex: number;
  title: string;
  startDate: Dayjs | null;
  endDate: Dayjs | null;
  color: CalendarColorKey;
  durationDays: number;
  leftPx: number;
  widthPx: number;
  fields: Record<string, unknown>;
}

export interface GanttHeaderColumn {
  key: string;
  date: Dayjs;
  label: string;
  isToday: boolean;
  isWeekend: boolean;
}

export interface GanttMonthGroup {
  key: string;
  startDate: Dayjs;
  endDate: Dayjs;
  label: string;
  colspan: number;
}

export interface GanttWeekGroup {
  key: string;
  startDate: Dayjs;
  endDate: Dayjs;
  label: string;
  colspan: number;
}

export interface GanttTreeMeta {
  parentId: string | null;
  depth: number;
  hasChildren: boolean;
  childCount: number;
}

export function buildTaskTreeMeta(tasks: GanttTaskData[]): Map<string, GanttTreeMeta> {
  const meta = new Map<string, GanttTreeMeta>();
  for (const task of tasks) {
    const record = task.fields as RecordRow;
    meta.set(task.recordId, {
      parentId: (record._parentId as string) || null,
      depth: 0,
      hasChildren: false,
      childCount: 0,
    });
  }
  for (const task of tasks) {
    const parentId = meta.get(task.recordId)?.parentId || null;
    if (parentId && meta.has(parentId)) {
      const p = meta.get(parentId)!;
      p.hasChildren = true;
      p.childCount += 1;
    }
  }
  for (const task of tasks) {
    let depth = 0;
    const seen = new Set<string>();
    let cur: string | null | undefined = meta.get(task.recordId)?.parentId;
    while (cur && meta.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      depth += 1;
      cur = meta.get(cur)?.parentId;
    }
    meta.get(task.recordId)!.depth = depth;
  }
  return meta;
}

export function orderTasksAsTree(
  tasks: GanttTaskData[],
  treeMeta: Map<string, GanttTreeMeta>,
): GanttTaskData[] {
  const children = new Map<string, GanttTaskData[]>();
  const roots: GanttTaskData[] = [];
  for (const t of tasks) {
    const parentId = treeMeta.get(t.recordId)?.parentId || null;
    if (parentId && treeMeta.has(parentId)) {
      if (!children.has(parentId)) children.set(parentId, []);
      children.get(parentId)!.push(t);
    } else {
      roots.push(t);
    }
  }
  const sortByStart = (arr: GanttTaskData[]) =>
    arr.sort((a, b) => (a.startDate?.valueOf() ?? 0) - (b.startDate?.valueOf() ?? 0));
  sortByStart(roots);
  for (const list of children.values()) sortByStart(list);
  const ordered: GanttTaskData[] = [];
  const visit = (t: GanttTaskData) => {
    ordered.push(t);
    (children.get(t.recordId) ?? []).forEach(visit);
  };
  roots.forEach(visit);
  return ordered;
}

export const PIXELS_PER_DAY: Record<GanttViewType, number> = {
  week: 80,
  month: 30,
  quarter: 12,
};

export const NAVIGATE_STEP: Record<GanttViewType, { prev: number; next: 'day' | 'week' | 'month' }> = {
  week: { prev: -1, next: 'week' },
  month: { prev: -1, next: 'month' },
  quarter: { prev: -1, next: 'month' },
};

export function createGanttTask(
  record: RecordRow,
  rowIndex: number,
  columns: ColumnDef[],
  config: BaseViewConfig,
): GanttTaskData {
  const startDate = parseDateValue(record[config.ganttStartDateFieldId || '']);
  const endDate = config.ganttEndDateFieldId
    ? parseDateValue(record[config.ganttEndDateFieldId])
    : null;

  const effectiveEndDate = startDate && endDate && endDate.isAfter(startDate) ? endDate : startDate;

  let title = '';
  if (config.ganttTaskNameFieldId) {
    const val = record[config.ganttTaskNameFieldId];
    title = val != null ? getCellText(val as CellValue) : '';
  } else {
    const firstCol = columns.find(c => c.id !== config.ganttStartDateFieldId && c.id !== config.ganttEndDateFieldId);
    if (firstCol) {
      const val = record[firstCol.id];
      title = val != null ? getCellText(val as CellValue) : '';
    }
  }

  let color: CalendarColorKey = 'blue';
  if (config.calendarCardColorFieldId) {
    const val = record[config.calendarCardColorFieldId];
    if (val) {
      const text = getCellText(val as CellValue);
      const colorField = columns.find(c => c.id === config.calendarCardColorFieldId);
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
  } else if (config.calendarDefaultColor && config.calendarDefaultColor in CALENDAR_COLORS) {
    color = config.calendarDefaultColor as CalendarColorKey;
  }

  const durationDays = startDate && effectiveEndDate
    ? Math.max(1, effectiveEndDate.diff(startDate, 'day') + 1)
    : 0;

  return {
    recordId: (record._id as string) || (record.id as string) || '',
    rowIndex,
    title: title || '未命名',
    startDate: startDate ?? null,
    endDate: effectiveEndDate ?? null,
    color,
    durationDays,
    leftPx: 0,
    widthPx: 0,
    fields: record,
  };
}

export function getGanttRange(
  currentDate: Dayjs,
  viewType: GanttViewType,
): { rangeStart: Dayjs; rangeEnd: Dayjs } {
  switch (viewType) {
    case 'week': {
      const start = currentDate.subtract(1, 'week').startOf('week');
      const end = currentDate.add(1, 'week').endOf('week');
      return { rangeStart: start, rangeEnd: end };
    }
    case 'month': {
      const start = currentDate.subtract(1, 'month').startOf('month');
      const end = currentDate.add(1, 'month').endOf('month');
      return { rangeStart: start, rangeEnd: end };
    }
    case 'quarter':
    default: {
      const start = currentDate.subtract(1, 'month').startOf('month');
      const end = currentDate.add(3, 'month').endOf('month');
      return { rangeStart: start, rangeEnd: end };
    }
  }
}

export function getMonthGroups(rangeStart: Dayjs, rangeEnd: Dayjs): GanttMonthGroup[] {
  const groups: GanttMonthGroup[] = [];
  let current = rangeStart.startOf('month');
  while (current.isBefore(rangeEnd) || current.isSame(rangeEnd, 'month')) {
    const monthEnd = current.endOf('month');
    const effectiveEnd = monthEnd.isAfter(rangeEnd) ? rangeEnd : monthEnd;
    const colspan = effectiveEnd.diff(current, 'day') + 1;
    groups.push({
      key: current.format('YYYY-MM'),
      startDate: current,
      endDate: effectiveEnd,
      label: `${current.format('YYYY年M月')}`,
      colspan,
    });
    current = current.add(1, 'month');
  }
  return groups;
}

export function getWeekGroups(rangeStart: Dayjs, rangeEnd: Dayjs): GanttWeekGroup[] {
  const groups: GanttWeekGroup[] = [];
  let current = rangeStart.startOf('week');
  while (current.isBefore(rangeEnd) || current.isSame(rangeEnd, 'day')) {
    const weekEnd = current.endOf('week');
    const effectiveEnd = weekEnd.isAfter(rangeEnd) ? rangeEnd : weekEnd;
    const colspan = effectiveEnd.diff(current, 'day') + 1;
    groups.push({
      key: current.format('YYYY-MM-DD'),
      startDate: current,
      endDate: effectiveEnd,
      label: `${current.format('D日')}-${effectiveEnd.format('D日')}`,
      colspan,
    });
    current = current.add(1, 'week');
  }
  return groups;
}

function formatHeaderLabel(date: Dayjs, viewType: GanttViewType): string {
  switch (viewType) {
    case 'week':
      return date.format('D');
    case 'month':
      return date.format('D');
    case 'quarter':
      return date.format('D');
  }
}

export function formatGanttTitle(date: Dayjs, viewType: GanttViewType): string {
  switch (viewType) {
    case 'week':
      return date.format('YYYY年M月');
    case 'month':
      return date.format('YYYY年M月');
    case 'quarter':
      return `${date.format('YYYY年M月')} - ${date.add(3, 'month').format('M月')}`;
  }
}

export function groupRecordsForGantt(
  records: RecordRow[],
  columns: ColumnDef[],
  config: BaseViewConfig,
  viewType: GanttViewType = 'week',
  currentDate: Dayjs = dayjs(),
  explicitRange?: { rangeStart: Dayjs; rangeEnd: Dayjs },
): {
  tasks: GanttTaskData[];
  headerColumns: GanttHeaderColumn[];
  monthGroups: GanttMonthGroup[];
  weekGroups: GanttWeekGroup[];
  rangeStart: Dayjs;
  rangeEnd: Dayjs;
  pixelsPerDay: number;
} {
  const pixelsPerDay = PIXELS_PER_DAY[viewType];
  const { rangeStart, rangeEnd } = explicitRange || getGanttRange(currentDate, viewType);
  const totalDays = rangeEnd.diff(rangeStart, 'day') + 1;

  const headerColumns: GanttHeaderColumn[] = [];
  const today = dayjs().format('YYYY-MM-DD');
  for (let i = 0; i < totalDays; i++) {
    const date = rangeStart.add(i, 'day');
    headerColumns.push({
      key: date.format('YYYY-MM-DD'),
      date,
      label: formatHeaderLabel(date, viewType),
      isToday: date.format('YYYY-MM-DD') === today,
      isWeekend: date.day() === 0 || date.day() === 6,
    });
  }

  const monthGroups = getMonthGroups(rangeStart, rangeEnd);
  const weekGroups = getWeekGroups(rangeStart, rangeEnd);

  const tasks: GanttTaskData[] = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const rowIndex = (record as any)._rowIndex ?? i;
    const task = createGanttTask(record, rowIndex, columns, config);

    if (task.startDate) {
      const clampedStart = task.startDate.isBefore(rangeStart) ? rangeStart : task.startDate;
      const clampedEnd = task.endDate && task.endDate.isAfter(rangeEnd) ? rangeEnd : task.endDate;

      const leftDayOffset = clampedStart.diff(rangeStart, 'day');
      const effectiveDuration = clampedEnd
        ? Math.max(1, clampedEnd.diff(clampedStart, 'day') + 1)
        : 1;

      tasks.push({
        ...task,
        startDate: clampedStart,
        endDate: clampedEnd || clampedStart,
        durationDays: effectiveDuration,
        leftPx: leftDayOffset * pixelsPerDay,
        widthPx: effectiveDuration * pixelsPerDay,
      });
    } else {
      tasks.push({
        ...task,
        leftPx: 0,
        widthPx: 0,
        durationDays: 0,
      });
    }
  }

  return { tasks, headerColumns, monthGroups, weekGroups, rangeStart, rangeEnd, pixelsPerDay };
}
