import type { CellData, CellRange, ColumnFilterCondition } from '../types/index';
import { getCellText, getRawValue } from '../types/index';

export interface ColumnValueStat {
  value: string;
  label: string;
  count: number;
  isBlank: boolean;
}

function getCellNumericValue(cell: CellData | undefined): number | null {
  if (!cell) return null;
  const raw = getRawValue(cell.value);
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const text = getCellText(cell.value).trim();
  if (text === '') return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

export function evaluateColumnFilterCondition(
  cell: CellData | undefined,
  condition: ColumnFilterCondition,
): boolean {
  const mode = condition.mode ?? (condition.selectedValues ? 'values' : 'condition');

  if (mode === 'values' && condition.selectedValues) {
    const text = cell ? getCellText(cell.value).trim() : '';
    const isBlank = text === '';
    if (isBlank) return condition.includeBlank !== false;
    return condition.selectedValues.includes(text);
  }

  return evaluateColumnFilter(cell, condition.operator ?? 'contains', condition.value);
}

export function evaluateColumnFilter(
  cell: CellData | undefined,
  operator: NonNullable<ColumnFilterCondition['operator']>,
  filterValue?: string,
): boolean {
  const text = cell ? getCellText(cell.value).trim() : '';
  const trimmedFilter = (filterValue ?? '').trim();

  switch (operator) {
    case 'eq':
      return text === trimmedFilter;
    case 'ne':
      return text !== trimmedFilter;
    case 'contains':
      return text.toLowerCase().includes(trimmedFilter.toLowerCase());
    case 'startsWith':
      return text.toLowerCase().startsWith(trimmedFilter.toLowerCase());
    case 'endsWith':
      return text.toLowerCase().endsWith(trimmedFilter.toLowerCase());
    case 'empty':
      return text === '';
    case 'notEmpty':
      return text !== '';
    case 'in':
      return trimmedFilter.split(',').map(v => v.trim()).filter(Boolean).includes(text);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const cellNum = getCellNumericValue(cell);
      const filterNum = Number(trimmedFilter);
      if (cellNum != null && Number.isFinite(filterNum)) {
        if (operator === 'gt') return cellNum > filterNum;
        if (operator === 'gte') return cellNum >= filterNum;
        if (operator === 'lt') return cellNum < filterNum;
        return cellNum <= filterNum;
      }
      const cmp = text.localeCompare(trimmedFilter, undefined, { numeric: true, sensitivity: 'base' });
      if (operator === 'gt') return cmp > 0;
      if (operator === 'gte') return cmp >= 0;
      if (operator === 'lt') return cmp < 0;
      return cmp <= 0;
    }
    default:
      return true;
  }
}

/** 普通表格：判断行是否通过列筛选（headerRow 始终可见） */
export function isFreeformRowFilteredVisible(
  row: number,
  conditions: ColumnFilterCondition[],
  getCell: (row: number, col: number) => CellData | undefined,
  headerRow = 0,
): boolean {
  const active = conditions.filter(c => isColumnFilterActive(c));
  if (active.length === 0) return true;
  if (row === headerRow) return true;
  return active.every(cond => evaluateColumnFilterCondition(getCell(row, cond.col), cond));
}

export function isColumnFilterActive(condition: ColumnFilterCondition): boolean {
  if (condition.mode === 'values' || condition.selectedValues) {
    return Array.isArray(condition.selectedValues);
  }
  if (condition.operator === 'empty' || condition.operator === 'notEmpty') return true;
  return !!(condition.operator && condition.value !== undefined && condition.value !== '');
}

export function getFilteredColumnIndices(conditions: ColumnFilterCondition[]): number[] {
  return [...new Set(conditions.filter(isColumnFilterActive).map(c => c.col))];
}

export function getContiguousColumnIndices(sel: CellRange | null, rowCount: number): number[] {
  if (!sel || rowCount < 1) return [];
  if (sel.start.row !== 0 || sel.end.row !== rowCount - 1) return [];
  const cols: number[] = [];
  for (let c = sel.start.col; c <= sel.end.col; c++) cols.push(c);
  return cols;
}

/** 解析工具栏「筛选」目标列：优先离散多选，否则取连续整列选区 */
export function resolveFilterTargetColumns(
  selectionRange: CellRange | null,
  discreteCols: number[] | undefined,
  rowCount: number,
): number[] {
  if (discreteCols?.length) {
    return [...new Set(discreteCols)].sort((a, b) => a - b);
  }
  if (!selectionRange || rowCount < 1) return [];
  const contiguous = getContiguousColumnIndices(selectionRange, rowCount);
  if (contiguous.length) return contiguous;
  const { start, end } = selectionRange;
  if (start.row === 0 && end.row === 0) {
    const cols: number[] = [];
    for (let c = start.col; c <= end.col; c++) cols.push(c);
    return cols;
  }
  return [];
}

/** 列头显示筛选图标的列 */
export function getColumnFilterIconCols(sheet: {
  columnFilterCols?: number[];
}): number[] {
  return sheet.columnFilterCols ?? [];
}

/** 普通表格：筛选功能是否已开启 */
export function isSheetColumnFilterEnabled(sheet: {
  columnFilterEnabled?: boolean;
  columnFilterCols?: number[];
  columnFilters?: ColumnFilterCondition[];
}): boolean {
  return getColumnFilterIconCols(sheet).length > 0
    || !!sheet.columnFilterEnabled
    || getFilteredColumnIndices(sheet.columnFilters ?? []).length > 0;
}

export type ColumnFilterSelectionContext =
  | { type: 'column'; col: number }
  | { type: 'headerRow' };

/** 从当前选区解析列筛选目标：整列选中或表头行 */
export function getColumnFilterSelectionContext(
  selectionRange: CellRange | null,
  rowCount: number,
): ColumnFilterSelectionContext | null {
  if (!selectionRange || rowCount < 1) return null;
  const { start, end } = selectionRange;

  if (start.row === 0 && end.row === 0) {
    if (start.col === end.col) return { type: 'column', col: start.col };
    return { type: 'headerRow' };
  }

  if (start.row === 0 && end.row === rowCount - 1 && start.col === end.col) {
    return { type: 'column', col: start.col };
  }

  return null;
}

export function getColumnFilterForCol(
  conditions: ColumnFilterCondition[] | undefined,
  col: number,
): ColumnFilterCondition | undefined {
  return conditions?.find(c => c.col === col);
}

/** 收集列内各值及出现次数（不含表头行） */
export function collectColumnValueStats(
  rowCount: number,
  col: number,
  getCell: (row: number, col: number) => CellData | undefined,
  headerRow = 0,
): ColumnValueStat[] {
  const counts = new Map<string, number>();
  let blankCount = 0;

  for (let r = headerRow + 1; r < rowCount; r++) {
    const cell = getCell(r, col);
    const text = cell ? getCellText(cell.value).trim() : '';
    if (text === '') {
      blankCount++;
    } else {
      counts.set(text, (counts.get(text) ?? 0) + 1);
    }
  }

  const stats: ColumnValueStat[] = [];
  if (blankCount > 0) {
    stats.push({ value: '', label: '(空白)', count: blankCount, isBlank: true });
  }
  const sorted = [...counts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }),
  );
  for (const [value, count] of sorted) {
    stats.push({ value, label: value, count, isBlank: false });
  }
  return stats;
}

/** 将未通过筛选的行高度设为 0，实现行折叠 */
export function buildFreeformFilterRowHeights(
  rowCount: number,
  rowHeights: Map<number, number>,
  defaultHeight: number,
  conditions: ColumnFilterCondition[],
  getCell: (row: number, col: number) => CellData | undefined,
  headerRow = 0,
): Map<number, number> {
  const result = new Map<number, number>();
  for (let r = 0; r < rowCount; r++) {
    const base = rowHeights.get(r) ?? defaultHeight;
    const visible = isFreeformRowFilteredVisible(r, conditions, getCell, headerRow);
    result.set(r, visible ? base : 0);
  }
  return result;
}

/** 根据当前 sheet 状态计算普通表格有效行高（渲染时实时读取，避免闭包 stale） */
export function computeFreeformEffectiveRowHeights(
  rowCount: number,
  rowHeights: Map<number, number>,
  defaultHeight: number,
  sheet: { columnFilterEnabled?: boolean; columnFilters?: ColumnFilterCondition[] },
  getCell: (row: number, col: number) => CellData | undefined,
): Map<number, number> {
  if (!sheet.columnFilterEnabled) return rowHeights;
  const conditions = sheet.columnFilters ?? [];
  if (conditions.length === 0) return rowHeights;
  return buildFreeformFilterRowHeights(rowCount, rowHeights, defaultHeight, conditions, getCell);
}

export const COLUMN_FILTER_OPERATORS: { value: NonNullable<ColumnFilterCondition['operator']>; label: string }[] = [
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'contains', label: '包含' },
  { value: 'startsWith', label: '开头是' },
  { value: 'endsWith', label: '结尾是' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'empty', label: '为空' },
  { value: 'notEmpty', label: '不为空' },
];

export const TEXT_CONDITION_PRESETS: { label: string; operator: ColumnFilterCondition['operator'] }[] = [
  { label: '等于', operator: 'eq' },
  { label: '不等于', operator: 'ne' },
  { label: '包含', operator: 'contains' },
  { label: '不包含', operator: 'ne' },
  { label: '开头是', operator: 'startsWith' },
  { label: '结尾是', operator: 'endsWith' },
  { label: '为空', operator: 'empty' },
  { label: '不为空', operator: 'notEmpty' },
];

export const NUMBER_CONDITION_PRESETS: { label: string; operator: ColumnFilterCondition['operator'] }[] = [
  { label: '等于', operator: 'eq' },
  { label: '不等于', operator: 'ne' },
  { label: '大于', operator: 'gt' },
  { label: '大于等于', operator: 'gte' },
  { label: '小于', operator: 'lt' },
  { label: '小于等于', operator: 'lte' },
  { label: '为空', operator: 'empty' },
  { label: '不为空', operator: 'notEmpty' },
];
