import type { CellValue, ColumnDef, RecordChangeEntry, RecordRow } from '@lingyi-doc/core-types';
import { getCellText } from '@lingyi-doc/core-types';
import { getCurrentRecordOperator } from './rowTree';

const EMPTY_VALUE: CellValue = { type: 'empty' };

export interface RecordHistoryDisplayRow {
  key: string;
  timestamp: number;
  timeLabel: string;
  operator: string;
  fieldName: string;
  fieldType?: ColumnDef['type'];
  before: string;
  after: string;
  afterTag?: { label: string; color: string };
  beforeTag?: { label: string; color: string };
  isCreate?: boolean;
}

export function cellValuesEqual(a: CellValue | undefined, b: CellValue | undefined): boolean {
  const left = a ?? EMPTY_VALUE;
  const right = b ?? EMPTY_VALUE;
  if (left.type !== right.type) return false;
  switch (left.type) {
    case 'empty':
      return true;
    case 'text':
      return right.type === 'text' && left.text === right.text;
    case 'number':
      return right.type === 'number' && left.value === right.value;
    case 'boolean':
      return right.type === 'boolean' && left.value === right.value;
    case 'date':
      return right.type === 'date' && left.timestamp === right.timestamp;
    case 'formula':
      return right.type === 'formula' && left.formula === right.formula;
    case 'error':
      return right.type === 'error' && left.error === right.error;
    default:
      return JSON.stringify(left) === JSON.stringify(right);
  }
}

export function appendRecordCreateHistory(record: RecordRow, operator = getCurrentRecordOperator()): void {
  if (record._history?.some(entry => entry.action === 'create')) return;
  appendRecordHistoryChange(record, { action: 'create' }, operator);
}

export function appendRecordHistoryChange(
  record: RecordRow,
  patch: Pick<RecordChangeEntry, 'action' | 'fieldId' | 'before' | 'after'> & Partial<Pick<RecordChangeEntry, 'at' | 'by'>>,
  operator = getCurrentRecordOperator(),
): void {
  const at = patch.at ?? Date.now();
  const by = patch.by ?? operator;
  const entry: RecordChangeEntry = {
    id: `hist_${at}_${Math.random().toString(36).slice(2, 9)}`,
    at,
    by,
    action: patch.action,
    fieldId: patch.fieldId,
    before: patch.before,
    after: patch.after,
  };
  if (!record._history) record._history = [];
  record._history.push(entry);
  record._updatedAt = at;
  record._updatedBy = by;
}

export function formatRecordOperator(name: string): string {
  if (!name || name === 'local') return '当前用户';
  if (name === 'public_form') return '填写者';
  return name;
}

/** 人员头像内文字：中文取末两字，短名全显 */
export function getPersonAvatarText(name: string): string {
  const display = formatRecordOperator(name);
  if (!display || display === '—') return '?';
  return display.length <= 2 ? display : display.slice(-2);
}

export function formatRecordHistoryTime(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp);
  const current = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const sameDay = date.getFullYear() === current.getFullYear()
    && date.getMonth() === current.getMonth()
    && date.getDate() === current.getDate();
  if (sameDay) return time;
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`;
}

export function formatRecordHistoryValue(
  value: CellValue | undefined,
  col: ColumnDef,
): { text: string; tag?: { label: string; color: string } } {
  if (!value || value.type === 'empty') return { text: '-' };
  if (col.type === 'boolean' && value.type === 'boolean') {
    return { text: value.value ? '是' : '否' };
  }
  if ((col.type === 'select' || col.type === 'multiSelect') && value.type === 'text') {
    const opt = col.options?.find(o => o.id === value.text || o.name === value.text);
    if (opt) return { text: opt.name, tag: { label: opt.name, color: opt.color || '#7c6cff' } };
  }
  const text = getCellText(value);
  return { text: text || '-' };
}

function resolveColumnByFieldId(columnDefs: ColumnDef[], fieldId?: string): ColumnDef | undefined {
  if (!fieldId) return undefined;
  return columnDefs.find(col => col.id === fieldId);
}

function buildLegacyCreateRow(record: RecordRow): RecordHistoryDisplayRow {
  return {
    key: 'legacy-create',
    timestamp: record._createdAt,
    timeLabel: formatRecordHistoryTime(record._createdAt),
    operator: formatRecordOperator(record._createdBy),
    fieldName: '创建了记录',
    before: '',
    after: '',
    isCreate: true,
  };
}

/** 将 RecordRow._history 转为详情抽屉展示行（无历史时至少展示创建记录） */
export function buildRecordHistoryDisplayRows(
  record: RecordRow | undefined,
  columnDefs: ColumnDef[],
): RecordHistoryDisplayRow[] {
  if (!record) return [];

  const entries = record._history ?? [];
  if (entries.length === 0) {
    return [buildLegacyCreateRow(record)];
  }

  const rows: RecordHistoryDisplayRow[] = entries.map(entry => {
    const col = resolveColumnByFieldId(columnDefs, entry.fieldId);
    if (entry.action === 'create') {
      return {
        key: entry.id,
        timestamp: entry.at,
        timeLabel: formatRecordHistoryTime(entry.at),
        operator: formatRecordOperator(entry.by),
        fieldName: '创建了记录',
        before: '',
        after: '',
        isCreate: true,
      };
    }

    const fieldName = col?.name ?? entry.fieldId ?? '未知字段';
    const beforeFormatted = col
      ? formatRecordHistoryValue(entry.before, col)
      : { text: entry.before ? getCellText(entry.before) : '-' };
    const afterFormatted = col
      ? formatRecordHistoryValue(entry.after, col)
      : { text: entry.after ? getCellText(entry.after) : '-' };

    return {
      key: entry.id,
      timestamp: entry.at,
      timeLabel: formatRecordHistoryTime(entry.at),
      operator: formatRecordOperator(entry.by),
      fieldName,
      fieldType: col?.type,
      before: beforeFormatted.text,
      after: afterFormatted.text,
      beforeTag: beforeFormatted.tag,
      afterTag: afterFormatted.tag,
    };
  });

  return rows.sort((a, b) => b.timestamp - a.timestamp);
}
