import type { CellValue, ColumnDef, ColumnType, GroupRule, RecordRow, SortRule } from '@lingyi-doc/core-types';
import { isColumnHidden } from './columnLayout';
import { getSelectDisplayName, getSelectSortIndex } from './selectOptions';

export const GROUP_HEADER_ROW_HEIGHT = 36;
export const GROUP_ADD_ROW_HEIGHT = 32;
export const GROUP_INDENT_STEP = 24;
/** 卡片内上下留白（外边框与内容间距） */
export const GROUP_BOX_GAP = 6;
export const GROUP_BOX_RADIUS = 8;
export const GROUP_CARD_PADDING = 8;
export const GROUP_CHEVRON_OFFSET = 12;
/** 折叠三角列右侧：拖拽 + 复选框 + 组内序号 */
export const GROUP_ROW_METADATA_WIDTH = 52;
/** 列头与首个分组卡片之间的间距 */
export const GROUP_VIEW_TOP_GAP = 12;
/** 顶级分组卡片之间的间距 */
export const GROUP_BETWEEN_GAP = 24;
/** 分组卡片内列头行高度 */
export const GROUP_COLUMN_HEADER_HEIGHT = 32;
export const GROUP_EMPTY_KEY = '__empty__';
export const GROUP_EMPTY_LABEL = '(值为空)';

export interface GroupFieldContext {
  [fieldId: string]: unknown;
}

export type GroupLayoutItem =
  | {
      type: 'group-header';
      groupPathKey: string;
      level: number;
      fieldId: string;
      label: string;
      recordCount: number;
      expanded: boolean;
    }
  | {
      type: 'record';
      recordIndex: number;
      localIndex: number;
    }
  | {
      type: 'add-record';
      groupContext: GroupFieldContext;
      groupPathKey: string;
      level: number;
    }
  | {
      type: 'group-gap';
      /** -1=列头与首组间距，0=顶级组间距 */
      level: number;
    }
  | {
      type: 'column-header';
      /** 所属顶级分组 */
      level: number;
    };

export interface GroupedLayoutResult {
  items: GroupLayoutItem[];
  displayRowCount: number;
  displayRowHeights: Map<number, number>;
  groupBoxRanges: GroupBoxRange[];
}

export interface GroupBoxRange {
  groupPathKey: string;
  level: number;
  startRow: number;
  endRow: number;
}

export interface BuildGroupedLayoutOptions {
  /** 经筛选/排序后的行索引 */
  recordIndices: number[];
  rows: RecordRow[];
  columnDefs: ColumnDef[];
  groupRules: GroupRule[];
  collapsedKeys: Set<string>;
  defaultRowHeight: number;
  getFieldValue: (recordIndex: number, fieldId: string) => unknown;
  sortRules?: SortRule[];
}

function extractRawFieldValue(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value === 'object' && value !== null && 'type' in value) {
    const cell = value as CellValue;
    switch (cell.type) {
      case 'empty':
        return null;
      case 'text':
        return cell.text;
      case 'number':
        return cell.value;
      case 'date':
        return cell.timestamp;
      case 'boolean':
        return cell.value;
      case 'link':
        return cell.text || cell.url;
      default:
        if (cell.type === 'richtext') return cell.segments.map(s => s.text).join('');
        return value;
    }
  }
  return value;
}

export function getGroupKey(value: unknown): string {
  const raw = extractRawFieldValue(value);
  if (raw === undefined || raw === null || raw === '') return GROUP_EMPTY_KEY;
  if (typeof raw === 'string') return raw || GROUP_EMPTY_KEY;
  if (typeof raw === 'number') return String(raw);
  if (typeof raw === 'boolean') return raw ? 'true' : 'false';
  if (Array.isArray(raw)) return raw[0]?.toString() ?? GROUP_EMPTY_KEY;
  return String(raw);
}

export function formatGroupLabel(key: string, columnDef: ColumnDef): string {
  if (key === GROUP_EMPTY_KEY) return GROUP_EMPTY_LABEL;
  if (columnDef.type === 'select' || columnDef.type === 'multiSelect') {
    return getSelectDisplayName(columnDef.options, key);
  }
  if (columnDef.type === 'date' || columnDef.type === 'datetime') {
    const ts = Number(key);
    if (!Number.isNaN(ts) && ts > 0) {
      const d = new Date(ts);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}/${m}/${day}`;
    }
  }
  return key;
}

/** 数值型列：分组键按数字大小比较 */
const NUMERIC_COLUMN_TYPES: ReadonlySet<ColumnType> = new Set<ColumnType>([
  'number', 'currency', 'percent', 'rating', 'progress', 'autoNumber',
]);

/** 日期型列：分组键为时间戳；文本值兜底用 Date.parse 解析 */
const DATE_COLUMN_TYPES: ReadonlySet<ColumnType> = new Set<ColumnType>([
  'date', 'datetime', 'createdTime', 'updatedTime',
]);

/**
 * 把分组键解析为可比较的数字。
 * - 优先 Number()（正常日期键即时间戳字符串）。
 * - 日期列遇到非数字文本（如从 Excel 粘入的 "2024年1月15日"）用 Date.parse 兜底。
 * - 仍无法解析返回 NaN，交由调用方按“空值排末尾”处理，避免比较器返回 NaN。
 */
function toComparableNumber(key: string, isDate: boolean): number {
  const n = Number(key);
  if (!Number.isNaN(n)) return n;
  if (isDate) {
    const ts = Date.parse(key);
    if (!Number.isNaN(ts)) return ts;
  }
  return NaN;
}

/**
 * 数值/日期列的稳定比较：任一侧无法解析为数字时按“空值”排到末尾，
 * 保证不返回 NaN（Array.sort 收到 NaN 会视为相等而乱序）。
 */
function compareNumeric(numA: number, numB: number): number {
  const aNan = Number.isNaN(numA);
  const bNan = Number.isNaN(numB);
  if (aNan && bNan) return 0;
  if (aNan) return 1;
  if (bNan) return -1;
  return numA - numB;
}

function compareGroupKeys(
  a: string,
  b: string,
  order: 'asc' | 'desc',
  columnDef: ColumnDef,
): number {
  if (a === GROUP_EMPTY_KEY && b !== GROUP_EMPTY_KEY) return 1;
  if (b === GROUP_EMPTY_KEY && a !== GROUP_EMPTY_KEY) return -1;
  if (a === GROUP_EMPTY_KEY && b === GROUP_EMPTY_KEY) return 0;

  const isDate = DATE_COLUMN_TYPES.has(columnDef.type);
  if (isDate || NUMERIC_COLUMN_TYPES.has(columnDef.type)) {
    const numA = toComparableNumber(a, isDate);
    const numB = toComparableNumber(b, isDate);
    const aEmpty = Number.isNaN(numA);
    const bEmpty = Number.isNaN(numB);
    // 无法解析的值恒排末尾，不随 asc/desc 翻转
    if (aEmpty || bEmpty) {
      if (aEmpty && bEmpty) return 0;
      return aEmpty ? 1 : -1;
    }
    const cmp = numA - numB;
    return order === 'desc' ? -cmp : cmp;
  }

  let cmp = 0;
  if ((columnDef.type === 'select' || columnDef.type === 'multiSelect') && columnDef.options) {
    const idxA = getSelectSortIndex(columnDef.options, a, columnDef.type === 'multiSelect');
    const idxB = getSelectSortIndex(columnDef.options, b, columnDef.type === 'multiSelect');
    cmp = idxA - idxB;
  } else {
    cmp = a.localeCompare(b, 'zh-CN');
  }
  return order === 'desc' ? -cmp : cmp;
}

/** 导出供 baseViewPipeline 复用，保证分组/非分组视图排序口径一致 */
export { NUMERIC_COLUMN_TYPES, DATE_COLUMN_TYPES, toComparableNumber, compareNumeric };

function sortGroupKeys(keys: string[], order: 'asc' | 'desc', columnDef: ColumnDef): string[] {
  return [...keys].sort((a, b) => compareGroupKeys(a, b, order, columnDef));
}

function sortRecordIndices(
  indices: number[],
  sortRules: SortRule[] | undefined,
  columnDefs: ColumnDef[],
  getFieldValue: (recordIndex: number, fieldId: string) => unknown,
): number[] {
  if (!sortRules?.length) return indices;
  return [...indices].sort((ia, ib) => {
    for (const rule of sortRules) {
      const colDef = columnDefs.find(c => c.id === rule.fieldId);
      const keyA = getGroupKey(getFieldValue(ia, rule.fieldId));
      const keyB = getGroupKey(getFieldValue(ib, rule.fieldId));
      const cmp = compareGroupKeys(keyA, keyB, rule.order, colDef ?? { id: rule.fieldId, name: '', type: 'text' });
      if (cmp !== 0) return cmp;
    }
    return ia - ib;
  });
}

export function makeGroupPathKey(pathKeys: string[]): string {
  return pathKeys.join('|');
}

export function resolveGroupContext(pathKeys: string[], fieldIds: string[]): GroupFieldContext {
  const ctx: GroupFieldContext = {};
  for (let i = 0; i < fieldIds.length; i++) {
    const key = pathKeys[i];
    ctx[fieldIds[i]] = key === GROUP_EMPTY_KEY ? null : key;
  }
  return ctx;
}

interface FlattenState {
  items: GroupLayoutItem[];
  collapsedKeys: Set<string>;
  groupRules: GroupRule[];
  columnDefs: ColumnDef[];
  getFieldValue: (recordIndex: number, fieldId: string) => unknown;
  sortRules?: SortRule[];
}

function flattenGroups(
  recordIndices: number[],
  rows: RecordRow[],
  level: number,
  pathKeys: string[],
  state: FlattenState,
): void {
  const { groupRules, columnDefs, collapsedKeys, items, getFieldValue, sortRules } = state;

  if (level >= groupRules.length) {
    const sorted = sortRecordIndices(recordIndices, sortRules, columnDefs, getFieldValue);
    let localIndex = 0;
    for (const recordIndex of sorted) {
      localIndex += 1;
      items.push({ type: 'record', recordIndex, localIndex });
    }
    if (pathKeys.length > 0) {
      const fieldIds = groupRules.slice(0, pathKeys.length).map(r => r.fieldId);
      items.push({
        type: 'add-record',
        groupContext: resolveGroupContext(pathKeys, fieldIds),
        groupPathKey: makeGroupPathKey(pathKeys),
        level: pathKeys.length,
      });
    }
    return;
  }

  const rule = groupRules[level];
  const columnDef = columnDefs.find(c => c.id === rule.fieldId);
  if (!columnDef) {
    flattenGroups(recordIndices, rows, level + 1, pathKeys, state);
    return;
  }

  const groups = new Map<string, number[]>();
  for (const idx of recordIndices) {
    const raw = getFieldValue(idx, rule.fieldId);
    const key = getGroupKey(raw);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(idx);
  }

  const sortedKeys = sortGroupKeys([...groups.keys()], rule.order, columnDef);

  for (const key of sortedKeys) {
    if (level === 0 && items.length > 0) {
      items.push({ type: 'group-gap', level: 0 });
    }
    const indices = groups.get(key)!;
    const currentPath = [...pathKeys, key];
    const pathKey = makeGroupPathKey(currentPath);
    const expanded = !collapsedKeys.has(pathKey);

    items.push({
      type: 'group-header',
      groupPathKey: pathKey,
      level,
      fieldId: rule.fieldId,
      label: formatGroupLabel(key, columnDef),
      recordCount: indices.length,
      expanded,
    });

    if (expanded) {
      flattenGroups(indices, rows, level + 1, currentPath, state);
    }
  }
}

export function isGroupLayoutRow(item: GroupLayoutItem | null | undefined): boolean {
  return item?.type === 'group-header'
    || item?.type === 'add-record'
    || item?.type === 'group-gap';
}

export function resolveDisplayRowsForRecordRows(
  items: GroupLayoutItem[],
  recordRows: number[],
): number[] {
  const wanted = new Set(recordRows);
  const displayRows: number[] = [];
  items.forEach((item, displayRow) => {
    if (item.type === 'record' && wanted.has(item.recordIndex)) {
      displayRows.push(displayRow);
    }
  });
  return displayRows;
}

export function buildGroupedLayout(options: BuildGroupedLayoutOptions): GroupedLayoutResult {
  const {
    recordIndices,
    rows,
    columnDefs,
    groupRules,
    collapsedKeys,
    defaultRowHeight,
    getFieldValue,
    sortRules,
  } = options;
  const items: GroupLayoutItem[] = [];

  flattenGroups(recordIndices, rows, 0, [], {
    items,
    collapsedKeys,
    groupRules,
    columnDefs,
    getFieldValue,
    sortRules,
  });

  if (items.length > 0) {
    items.unshift({ type: 'group-gap', level: -1 });
  }

  const displayRowHeights = new Map<number, number>();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type === 'group-header') {
      displayRowHeights.set(i, GROUP_HEADER_ROW_HEIGHT);
    } else if (item.type === 'add-record') {
      displayRowHeights.set(i, GROUP_ADD_ROW_HEIGHT);
    } else if (item.type === 'group-gap') {
      displayRowHeights.set(i, item.level === -1 ? GROUP_VIEW_TOP_GAP : GROUP_BETWEEN_GAP);
    } else {
      displayRowHeights.set(i, defaultRowHeight);
    }
  }

  return {
    items,
    displayRowCount: items.length,
    displayRowHeights,
    groupBoxRanges: computeGroupBoxRangesFromItems(items),
  };
}

function computeGroupBoxRangesFromItems(items: GroupLayoutItem[]): GroupBoxRange[] {
  const ranges: GroupBoxRange[] = [];
  const stack: Array<{ level: number; headerRow: number; groupPathKey: string }> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type === 'group-gap') {
      while (stack.length > 0) {
        const open = stack.pop()!;
        ranges.push({
          groupPathKey: open.groupPathKey,
          level: open.level,
          startRow: open.headerRow,
          endRow: i - 1,
        });
      }
      continue;
    }
    if (item.type !== 'group-header') continue;

    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      const open = stack.pop()!;
      ranges.push({
        groupPathKey: open.groupPathKey,
        level: open.level,
        startRow: open.headerRow,
        endRow: i - 1,
      });
    }
    stack.push({ level: item.level, headerRow: i, groupPathKey: item.groupPathKey });
  }

  while (stack.length > 0) {
    const open = stack.pop()!;
    ranges.push({
      groupPathKey: open.groupPathKey,
      level: open.level,
      startRow: open.headerRow,
      endRow: items.length - 1,
    });
  }

  // 布局期按 level 升序，绘制侧免每帧 sort
  ranges.sort((a, b) => a.level - b.level || a.startRow - b.startRow);
  return ranges;
}

export function resolveRecordRowFromLayout(items: GroupLayoutItem[], displayRow: number): number | null {
  const item = items[displayRow];
  if (item?.type === 'record') return item.recordIndex;
  return null;
}

export function resolveLocalRecordIndex(items: GroupLayoutItem[], displayRow: number): number | null {
  const item = items[displayRow];
  if (item?.type === 'record') return item.localIndex;
  return null;
}

export function getLayoutItem(items: GroupLayoutItem[], displayRow: number): GroupLayoutItem | null {
  return items[displayRow] ?? null;
}

export function isLayoutRowSelectable(item: GroupLayoutItem | null): boolean {
  return item?.type === 'record';
}

/** 解析 displayRow 所在最深层级分组的数据区左缩进（px，未乘 zoom） */
export function resolveGroupDataInset(
  groupBoxRanges: GroupBoxRange[],
  displayRow: number,
): number {
  const range = findInnermostBoxRange(groupBoxRanges, displayRow);
  if (!range) return 0;
  return range.level * GROUP_INDENT_STEP;
}

/** 行控件（折叠三角 / 复选框 / 添加）所在层级 */
export function resolveRowControlLevel(
  items: GroupLayoutItem[],
  displayRow: number,
): number {
  const item = items[displayRow];
  if (!item) return 0;
  if (item.type === 'group-header' || item.type === 'add-record') {
    return item.level;
  }
  if (item.type === 'group-gap') return 0;
  for (let i = displayRow - 1; i >= 0; i--) {
    const prev = items[i];
    if (prev.type === 'group-header') return prev.level;
  }
  return 0;
}

/** 折叠三角列相对卡片左缘的缩进（px，未乘 zoom） */
export function resolveGroupChevronInsetPx(level: number): number {
  return level * GROUP_INDENT_STEP + GROUP_CHEVRON_OFFSET;
}

/** 记录行第一列内容的左内边距（px，未乘 zoom，相对卡片左缘） */
export function resolveGroupRecordMetadataEndPx(level: number): number {
  return level * GROUP_INDENT_STEP + GROUP_CHEVRON_OFFSET + GROUP_ROW_METADATA_WIDTH;
}

/** 查找 displayRow 所属的顶级（level 0）分组卡片 */
export function findLevel0BoxRange(
  groupBoxRanges: GroupBoxRange[],
  displayRow: number,
): GroupBoxRange | null {
  for (const range of groupBoxRanges) {
    if (range.level === 0 && displayRow >= range.startRow && displayRow <= range.endRow) {
      return range;
    }
  }
  return null;
}

/**
 * 分组卡片左缘（屏幕 px）：边框与白底同一锚点，与 corner 复选框列头左边界对齐（x=0）。
 */
export function resolveGroupedCardLeft(): number {
  return 0;
}

/** @deprecated 使用 resolveGroupedCardLeft */
export function resolveGroupedCardBorderLeft(): number {
  return resolveGroupedCardLeft();
}

/** @deprecated 使用 resolveGroupedCardLeft */
export function resolveGroupedCardContentLeft(_headerWidth: number): number {
  return resolveGroupedCardLeft();
}

/** metadata 区与首字段列的分界（屏幕 px），与列头 checkbox|文本 竖线对齐 */
export function resolveGroupedMetadataDividerX(headerWidth: number): number {
  return headerWidth;
}

/** 查找 displayRow 所属最深层级分组卡片 */
export function findInnermostBoxRange(
  groupBoxRanges: GroupBoxRange[],
  displayRow: number,
): GroupBoxRange | null {
  let best: GroupBoxRange | null = null;
  for (const range of groupBoxRanges) {
    if (displayRow < range.startRow || displayRow > range.endRow) continue;
    if (!best || range.level > best.level) best = range;
  }
  return best;
}

/** 顶级分组卡片左右边界（屏幕 px） */
export function resolveLevel0CardScreenBounds(
  dataLeft: number,
  gridRight: number,
  groupBoxRanges: GroupBoxRange[],
  displayRow: number,
): { left: number; right: number } | null {
  if (!findLevel0BoxRange(groupBoxRanges, displayRow)) return null;
  return {
    left: dataLeft,
    right: gridRight,
  };
}

/**
 * 记录行高亮区域：整行铺满所在最外层卡片（x=0 → gridRight）。
 * 嵌套子组记录行同样横跨顶级卡片宽度，与设计稿一致。
 */
export function resolveGroupedRecordHighlightBounds(
  cardLeft: number,
  gridRight: number,
  groupBoxRanges: GroupBoxRange[],
  displayRow: number,
): { left: number; right: number } | null {
  return resolveLevel0CardScreenBounds(cardLeft, gridRight, groupBoxRanges, displayRow);
}

/** 统计分组子树内已勾选的记录数 */
export function countCheckedInGroupSubtree(
  items: GroupLayoutItem[],
  headerRow: number,
  headerLevel: number,
  checkedRecordRows: Set<number>,
): number {
  let count = 0;
  for (let i = headerRow + 1; i < items.length; i++) {
    const item = items[i];
    if (item.type === 'group-header' && item.level <= headerLevel) break;
    if (item.type === 'record' && checkedRecordRows.has(item.recordIndex)) count++;
  }
  return count;
}
