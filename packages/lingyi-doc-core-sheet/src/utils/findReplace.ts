import type { CellData, CellValue } from '@lingyi-doc/core-types';
import { getCellText, getEditText, keyToCoord, parseCellValue } from '@lingyi-doc/core-types';
import type { FreeTable } from '../model/FreeTable';

/** 匹配单元格：浅黄；当前匹配：浅绿（对齐产品示意） */
export const SHEET_FIND_MATCH_BG = '#d8e3f6';
export const SHEET_FIND_ACTIVE_BG = '#d8e3f6';

export interface SheetFindMatch {
  row: number;
  col: number;
  /** 在可搜索文本中的起始偏移 */
  start: number;
  end: number;
}

export interface SheetFindReplaceOptions {
  /** 默认不区分大小写 */
  caseSensitive?: boolean;
  /** 整格匹配（完整相等），默认子串包含 */
  matchEntireCell?: boolean;
}

function cellSearchText(value: CellValue): string {
  if (value.type === 'boolean') {
    return value.value ? 'TRUE' : 'FALSE';
  }
  return getCellText(value);
}

function booleanAliases(isTrue: boolean): string[] {
  return isTrue ? ['TRUE', 'true', '是', '1'] : ['FALSE', 'false', '否', '0'];
}

function cellMatchesQuery(
  text: string,
  query: string,
  options: SheetFindReplaceOptions,
): { start: number; end: number } | null {
  if (!query) return null;
  const caseSensitive = !!options.caseSensitive;
  const hay = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();

  if (options.matchEntireCell) {
    if (hay === needle) return { start: 0, end: text.length };
    if (text === 'TRUE' || text === 'FALSE') {
      const hit = booleanAliases(text === 'TRUE').some(
        a => (caseSensitive ? a : a.toLowerCase()) === needle,
      );
      if (hit) return { start: 0, end: text.length };
    }
    return null;
  }

  const idx = hay.indexOf(needle);
  if (idx >= 0) return { start: idx, end: idx + query.length };

  // 布尔格：用中文/数字别名命中
  if (text === 'TRUE' || text === 'FALSE') {
    const hit = booleanAliases(text === 'TRUE').some(a => {
      const n = caseSensitive ? a : a.toLowerCase();
      return n === needle || n.includes(needle);
    });
    if (hit) return { start: 0, end: text.length };
  }

  return null;
}

/** 在表格中查找全部匹配单元格（按行优先、列次之的文档顺序） */
export function findInSheet(
  table: FreeTable,
  query: string,
  options: SheetFindReplaceOptions = {},
): SheetFindMatch[] {
  const trimmed = query;
  if (!trimmed) return [];

  const matches: SheetFindMatch[] = [];
  const cells = table.sheet.cells;
  const rowCount = table.rowCount;
  const colCount = table.colCount;

  // 优先遍历已有单元格，避免空表全量扫描
  for (const [key, cell] of cells) {
    const { row, col } = keyToCoord(key);
    if (row < 0 || col < 0 || row >= rowCount || col >= colCount) continue;
    const value = table.getCell(row, col)?.value ?? cell.value;
    const text = cellSearchText(value);
    const hit = cellMatchesQuery(text, trimmed, options);
    if (hit) {
      matches.push({ row, col, ...hit });
    }
  }

  matches.sort((a, b) => (a.row - b.row) || (a.col - b.col));
  return matches;
}

function replaceInSearchText(
  text: string,
  query: string,
  replacement: string,
  options: SheetFindReplaceOptions,
): string | null {
  if (!query) return null;
  if (options.matchEntireCell) {
    const hit = cellMatchesQuery(text, query, options);
    return hit ? replacement : null;
  }
  if (options.caseSensitive) {
    if (!text.includes(query)) return null;
    return text.split(query).join(replacement);
  }
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  let from = 0;
  let out = '';
  let changed = false;
  while (from < text.length) {
    const idx = lower.indexOf(needle, from);
    if (idx < 0) {
      out += text.slice(from);
      break;
    }
    out += text.slice(from, idx) + replacement;
    from = idx + needle.length;
    changed = true;
  }
  return changed ? out : null;
}

function buildReplacedValue(
  oldValue: CellValue,
  query: string,
  replacement: string,
  options: SheetFindReplaceOptions,
): CellValue | null {
  // 公式：仅在公式源文本中替换，避免误改计算结果展示
  if (oldValue.type === 'formula') {
    const next = replaceInSearchText(oldValue.formula, query, replacement, options);
    if (next == null) return null;
    return { type: 'formula', formula: next.startsWith('=') ? next : `=${next}` };
  }

  if (oldValue.type === 'boolean') {
    const text = cellSearchText(oldValue);
    const hit = cellMatchesQuery(text, query, options);
    if (!hit) return null;
    const t = replacement.trim().toUpperCase();
    if (t === '' || t === '0' || t === 'FALSE' || replacement.trim() === '否') {
      return { type: 'boolean', value: false };
    }
    if (t === '1' || t === 'TRUE' || replacement.trim() === '是') {
      return { type: 'boolean', value: true };
    }
    return parseCellValue(replacement);
  }

  const edit = getEditText(oldValue);
  const display = cellSearchText(oldValue);
  // 优先在显示文本上替换；显示与编辑不同时回退编辑文本
  let next = replaceInSearchText(display, query, replacement, options);
  if (next == null && edit !== display) {
    next = replaceInSearchText(edit, query, replacement, options);
  }
  if (next == null) return null;
  return parseCellValue(next);
}

/** 替换单个匹配；成功返回 true */
export function replaceSheetMatch(
  table: FreeTable,
  match: SheetFindMatch,
  query: string,
  replacement: string,
  options: SheetFindReplaceOptions = {},
): boolean {
  const cell = table.getCell(match.row, match.col);
  const oldValue = cell?.value ?? { type: 'empty' as const };
  const nextValue = buildReplacedValue(oldValue, query, replacement, options);
  if (!nextValue) return false;

  const nextCell: CellData = { value: nextValue };
  if (cell?.style) nextCell.style = { ...cell.style };
  table.replaceCell(match.row, match.col, nextCell);
  return true;
}

/** 全部替换，单条 undo；返回替换次数 */
export function replaceAllInSheet(
  table: FreeTable,
  query: string,
  replacement: string,
  options: SheetFindReplaceOptions = {},
): number {
  const matches = findInSheet(table, query, options);
  if (!matches.length) return 0;

  const entries: Array<{ row: number; col: number; cell: CellData | null }> = [];
  for (const match of matches) {
    const cell = table.getCell(match.row, match.col);
    const oldValue = cell?.value ?? { type: 'empty' as const };
    const nextValue = buildReplacedValue(oldValue, query, replacement, options);
    if (!nextValue) continue;
    const nextCell: CellData = { value: nextValue };
    if (cell?.style) nextCell.style = { ...cell.style };
    entries.push({ row: match.row, col: match.col, cell: nextCell });
  }
  if (!entries.length) return 0;
  table.replaceCellsBulk(entries);
  return entries.length;
}
