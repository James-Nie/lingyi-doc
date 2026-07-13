import type { CellValue, ColumnDef, FilterCondition, RecordRow, SortRule } from '../types/index';
import { getCellText } from '../types/index';
import { getGroupKey, GROUP_EMPTY_KEY } from './recordGrouping';
import { getMultiSelectDisplayNames, getSelectDisplayName, normalizeSelectOptionId } from './selectOptions';
import { isRowVisible } from './rowTree';

export interface PrepareGroupedRecordsOptions {
  rowCount: number;
  filter?: FilterCondition[];
  sort?: SortRule[];
  columnDefs: ColumnDef[];
  getFieldValue: (rowIndex: number, fieldId: string) => unknown;
}

function cellValueToCompareText(value: unknown, columnDef?: ColumnDef): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object' && value !== null && 'type' in value) {
    const cellValue = value as CellValue;
    if (columnDef?.type === 'select' && cellValue.type === 'text') {
      return getSelectDisplayName(columnDef.options, cellValue.text);
    }
    if (columnDef?.type === 'multiSelect') {
      return getMultiSelectDisplayNames(cellValue, columnDef.options).join(', ');
    }
    return getCellText(cellValue);
  }
  return String(value);
}

function normalizeFilterCompareValue(value: unknown, columnDef?: ColumnDef): string {
  const text = String(value ?? '');
  if (columnDef?.type === 'select' && columnDef.options) {
    return getSelectDisplayName(columnDef.options, text);
  }
  return text;
}

function isFieldEmpty(value: unknown): boolean {
  return getGroupKey(value) === GROUP_EMPTY_KEY;
}

function compareFieldValues(
  a: unknown,
  b: unknown,
  order: 'asc' | 'desc',
  columnDef?: ColumnDef,
): number {
  const keyA = getGroupKey(a);
  const keyB = getGroupKey(b);
  if (keyA === GROUP_EMPTY_KEY && keyB !== GROUP_EMPTY_KEY) return 1;
  if (keyB === GROUP_EMPTY_KEY && keyA !== GROUP_EMPTY_KEY) return -1;
  if (keyA === GROUP_EMPTY_KEY && keyB === GROUP_EMPTY_KEY) return 0;

  let cmp = 0;
  const type = columnDef?.type ?? 'text';
  if (type === 'number' || type === 'currency' || type === 'percent' || type === 'date' || type === 'datetime') {
    cmp = Number(keyA) - Number(keyB);
  } else if ((type === 'select' || type === 'multiSelect') && columnDef?.options) {
    const idxA = columnDef.options.findIndex(o => o.id === keyA);
    const idxB = columnDef.options.findIndex(o => o.id === keyB);
    cmp = (idxA < 0 ? 999 : idxA) - (idxB < 0 ? 999 : idxB);
  } else {
    cmp = keyA.localeCompare(keyB, 'zh-CN');
  }
  return order === 'desc' ? -cmp : cmp;
}

function matchesFilter(fieldValue: unknown, cond: FilterCondition, columnDef?: ColumnDef): boolean {
  const isEmpty = isFieldEmpty(fieldValue);
  const text = cellValueToCompareText(fieldValue, columnDef).toLowerCase();
  const condValue = normalizeFilterCompareValue(cond.value, columnDef);

  switch (cond.operator) {
    case 'empty':
      return isEmpty;
    case 'notEmpty':
      return !isEmpty;
    case 'eq':
      return text === String(condValue ?? '').toLowerCase();
    case 'ne':
      return text !== String(condValue ?? '').toLowerCase();
    case 'contains':
      return text.includes(String(condValue ?? '').toLowerCase());
    case 'startsWith':
      return text.startsWith(String(condValue ?? '').toLowerCase());
    case 'endsWith':
      return text.endsWith(String(condValue ?? '').toLowerCase());
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const num = Number(getGroupKey(fieldValue));
      const cmp = Number(condValue);
      if (Number.isNaN(num) || Number.isNaN(cmp)) return false;
      if (cond.operator === 'gt') return num > cmp;
      if (cond.operator === 'gte') return num >= cmp;
      if (cond.operator === 'lt') return num < cmp;
      return num <= cmp;
    }
    case 'in': {
      const list = Array.isArray(condValue)
        ? condValue
        : String(condValue ?? '').split(',').map(s => s.trim()).filter(Boolean);
      return list.some(item => text === String(item).toLowerCase());
    }
    default:
      return true;
  }
}

/** 按视图筛选条件过滤行索引 */
export function applyBaseFilter(
  indices: number[],
  filters: FilterCondition[] | undefined,
  getFieldValue: (rowIndex: number, fieldId: string) => unknown,
  columnDefs?: ColumnDef[],
): number[] {
  if (!filters?.length) return indices;
  return indices.filter(idx =>
    filters.every(cond => {
      const colDef = columnDefs?.find(c => c.id === cond.fieldId);
      return matchesFilter(getFieldValue(idx, cond.fieldId), cond, colDef);
    }),
  );
}

/** 按视图排序规则排序行索引 */
export function applyBaseSort(
  indices: number[],
  sortRules: SortRule[] | undefined,
  columnDefs: ColumnDef[],
  getFieldValue: (rowIndex: number, fieldId: string) => unknown,
): number[] {
  if (!sortRules?.length) return indices;
  return [...indices].sort((ia, ib) => {
    for (const rule of sortRules) {
      const colDef = columnDefs.find(c => c.id === rule.fieldId);
      const cmp = compareFieldValues(
        getFieldValue(ia, rule.fieldId),
        getFieldValue(ib, rule.fieldId),
        rule.order,
        colDef,
      );
      if (cmp !== 0) return cmp;
    }
    return ia - ib;
  });
}

/** 筛选 → 排序，返回参与分组的行索引 */
export function prepareGroupedRecordIndices(options: PrepareGroupedRecordsOptions): number[] {
  const { rowCount, filter, sort, columnDefs, getFieldValue } = options;
  let indices = Array.from({ length: rowCount }, (_, i) => i);
  indices = applyBaseFilter(indices, filter, getFieldValue, columnDefs);
  indices = applyBaseSort(indices, sort, columnDefs, getFieldValue);
  return indices;
}

export interface FlatRecordLayoutResult {
  displayRowCount: number;
  recordIndexByDisplayRow: number[];
  displayRowHeights: Map<number, number>;
}

/** 非分组视图：按筛选/排序后的记录索引构建紧凑显示行布局 */
export function buildFlatSortedRecordLayout(options: {
  recordIndices: number[];
  rows: RecordRow[];
  rowHeights: Map<number, number>;
  collapsedIds: Set<string>;
  defaultHeight: number;
}): FlatRecordLayoutResult {
  const { recordIndices, rows, rowHeights, collapsedIds, defaultHeight } = options;
  const visible = recordIndices.filter(r => isRowVisible(r, rows, collapsedIds));
  const displayRowHeights = new Map<number, number>();
  for (let d = 0; d < visible.length; d++) {
    const recordIdx = visible[d];
    displayRowHeights.set(d, rowHeights.get(recordIdx) ?? defaultHeight);
  }
  return {
    displayRowCount: visible.length,
    recordIndexByDisplayRow: visible,
    displayRowHeights,
  };
}

/** 按单元格值生成「等于」筛选条件（空值用 empty 运算符） */
export function createFilterConditionFromCell(
  fieldId: string,
  cellValue: CellValue | undefined,
  columnDef?: ColumnDef,
): FilterCondition {
  if (!cellValue || cellValue.type === 'empty') {
    return { fieldId, operator: 'empty' };
  }
  if (columnDef?.type === 'select' && cellValue.type === 'text') {
    const optionId = normalizeSelectOptionId(columnDef.options, cellValue.text);
    return { fieldId, operator: 'eq', value: getSelectDisplayName(columnDef.options, optionId) };
  }
  if (columnDef?.type === 'multiSelect') {
    const names = getMultiSelectDisplayNames(cellValue, columnDef.options);
    if (names.length === 0) return { fieldId, operator: 'empty' };
    return { fieldId, operator: 'contains', value: names[0] };
  }
  const text = getCellText(cellValue).trim();
  if (text === '') {
    return { fieldId, operator: 'empty' };
  }
  return { fieldId, operator: 'eq', value: text };
}

/** 合并/替换同字段筛选条件 */
export function upsertFilterCondition(
  conditions: FilterCondition[],
  next: FilterCondition,
): FilterCondition[] {
  const rest = conditions.filter(c => c.fieldId !== next.fieldId);
  return [...rest, next];
}
