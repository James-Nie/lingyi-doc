import type { CellValue, ColumnDef, GroupRule } from '../types/index';
import type { GroupFieldContext, GroupLayoutItem } from './recordGrouping';
import { getGroupKey, GROUP_EMPTY_KEY } from './recordGrouping';

/** 从分组 key 构建对应字段的 CellValue */
export function buildCellValueFromGroupKey(
  key: unknown,
  colDef: ColumnDef,
): CellValue | null {
  if (key === null || key === undefined || key === GROUP_EMPTY_KEY) {
    return { type: 'empty' };
  }

  switch (colDef.type) {
    case 'date':
    case 'datetime': {
      const ts = Number(key);
      if (!Number.isNaN(ts) && ts > 0) {
        return {
          type: 'date',
          timestamp: ts,
          format: { kind: colDef.type === 'datetime' ? 'datetime' : 'short' },
        };
      }
      return { type: 'empty' };
    }
    case 'boolean':
      return { type: 'boolean', value: key === 'true' || key === true };
    case 'number':
    case 'currency':
    case 'percent':
    case 'rating':
    case 'progress': {
      const num = Number(key);
      if (!Number.isNaN(num)) {
        return { type: 'number', value: num, format: { kind: 'general' } };
      }
      return { type: 'empty' };
    }
    case 'select':
      return { type: 'text', text: String(key) };
    case 'multiSelect':
      return { type: 'text', text: String(key) };
    default:
      return { type: 'text', text: String(key) };
  }
}

/** 解析分组内 add-record 行对应的插入 recordIndex（插入到同组最后一条记录之后） */
export function resolveGroupInsertRecordIndex(
  items: GroupLayoutItem[],
  addRecordDisplayRow: number,
): number {
  const addItem = items[addRecordDisplayRow];
  if (!addItem || addItem.type !== 'add-record') return -1;

  const targetLevel = addItem.level;
  let maxRecordIndex = -1;

  for (let i = addRecordDisplayRow - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type === 'record') {
      maxRecordIndex = Math.max(maxRecordIndex, item.recordIndex);
      continue;
    }
    if (item.type === 'group-header' && item.level < targetLevel) {
      break;
    }
  }

  return maxRecordIndex + 1;
}

/** 从记录行读取分组字段上下文（用于子记录继承当前行分组值） */
export function resolveGroupContextFromRecord(
  recordRow: number,
  groupRules: GroupRule[],
  getFieldValue: (recordIndex: number, fieldId: string) => unknown,
): GroupFieldContext {
  const ctx: GroupFieldContext = {};
  for (const rule of groupRules) {
    const key = getGroupKey(getFieldValue(recordRow, rule.fieldId));
    ctx[rule.fieldId] = key === GROUP_EMPTY_KEY ? null : key;
  }
  return ctx;
}

/** 将分组上下文写入新行各字段 */
export function applyGroupContextToRow(
  setCellValue: (row: number, col: number, value: CellValue, options?: { skipHistory?: boolean }) => void,
  row: number,
  groupContext: GroupFieldContext,
  columnDefs: ColumnDef[],
): void {
  for (const [fieldId, key] of Object.entries(groupContext)) {
    const colIndex = columnDefs.findIndex(c => c.id === fieldId);
    if (colIndex < 0) continue;
    const colDef = columnDefs[colIndex];
    const cellValue = buildCellValueFromGroupKey(key, colDef);
    if (cellValue) {
      setCellValue(row, colIndex, cellValue, { skipHistory: true });
    }
  }
}
