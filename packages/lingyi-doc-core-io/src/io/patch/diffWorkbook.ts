import { stableStringify } from './canonical';
import {
  SET_CELLS_CHUNK_SIZE,
  SET_CELLS_COALESCE_MIN,
  type WorkbookPatchOp,
} from './types';

function sheetDataMap(workbook: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  const sheets = (workbook.sheets as Array<{ id: string; data: Record<string, unknown> }>) || [];
  for (const sheet of sheets) {
    if (sheet?.id) map.set(sheet.id, sheet.data || {});
  }
  return map;
}

const SHEET_META_FIELDS = [
  'name', 'type', 'rowCount', 'colCount', 'isHidden',
  'mergeRanges', 'columnWidths', 'rowHeights', 'columnDefs',
  'conditionalFormats', 'validations', 'defaultStyle', 'freezeState',
  'charts', 'views', 'activeViewId', 'defaultRowHeight',
  'columnFilters', 'columnFilterEnabled', 'columnFilterCols',
] as const;

/** 单元格相等：用 JSON.stringify，避免 stableStringify 排序开销（粘贴大表时可达数秒） */
function cellEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function packCellChanges(
  sheetId: string,
  changes: Array<{ key: string; cell: unknown | null }>,
): WorkbookPatchOp[] {
  if (changes.length === 0) return [];
  if (changes.length < SET_CELLS_COALESCE_MIN) {
    return changes.map(({ key, cell }) => ({ type: 'set_cell', sheetId, key, cell }));
  }

  const ops: WorkbookPatchOp[] = [];
  for (let i = 0; i < changes.length; i += SET_CELLS_CHUNK_SIZE) {
    const slice = changes.slice(i, i + SET_CELLS_CHUNK_SIZE);
    const cells: Record<string, unknown | null> = {};
    for (const { key, cell } of slice) cells[key] = cell;
    ops.push({ type: 'set_cells', sheetId, cells });
  }
  return ops;
}

export function diffWorkbook(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): WorkbookPatchOp[] {
  const ops: WorkbookPatchOp[] = [];

  if (before.activeSheetId !== after.activeSheetId) {
    ops.push({ type: 'set_workbook_meta', patch: { activeSheetId: after.activeSheetId as string } });
  }

  const beforeOrder = (before.sheetOrder as string[]) || [];
  const afterOrder = (after.sheetOrder as string[]) || [];
  if (stableStringify(beforeOrder) !== stableStringify(afterOrder)) {
    ops.push({ type: 'set_workbook_meta', patch: { sheetOrder: afterOrder } });
  }

  const beforeSheets = sheetDataMap(before);
  const afterSheets = sheetDataMap(after);
  const afterSheetList = (after.sheets as Array<{ id: string; data: Record<string, unknown> }>) || [];

  for (const sheet of afterSheetList) {
    if (!beforeSheets.has(sheet.id)) {
      ops.push({ type: 'add_sheet', sheet: { id: sheet.id, data: sheet.data } });
    }
  }

  for (const sheetId of beforeSheets.keys()) {
    if (!afterSheets.has(sheetId)) {
      ops.push({ type: 'remove_sheet', sheetId });
    }
  }

  for (const sheet of afterSheetList) {
    const prev = beforeSheets.get(sheet.id);
    if (!prev) continue;
    ops.push(...diffSheet(prev, sheet.data, sheet.id));
  }

  return ops;
}

function diffSheet(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  sheetId: string,
): WorkbookPatchOp[] {
  const ops: WorkbookPatchOp[] = [];

  const beforeCells = (before.cells as Record<string, unknown>) || {};
  const afterCells = (after.cells as Record<string, unknown>) || {};
  const changes: Array<{ key: string; cell: unknown | null }> = [];

  for (const key of Object.keys(afterCells)) {
    const prevCell = beforeCells[key];
    const nextCell = afterCells[key];
    if (prevCell === undefined) {
      changes.push({ key, cell: nextCell });
      continue;
    }
    if (!cellEqual(prevCell, nextCell)) {
      changes.push({ key, cell: nextCell });
    }
  }
  for (const key of Object.keys(beforeCells)) {
    if (!(key in afterCells)) {
      changes.push({ key, cell: null });
    }
  }
  ops.push(...packCellChanges(sheetId, changes));

  ops.push(...diffRows(sheetId, before.rows, after.rows));

  const patch: Record<string, unknown> = {};
  for (const field of SHEET_META_FIELDS) {
    if (stableStringify(before[field]) !== stableStringify(after[field])) {
      patch[field] = after[field];
    }
  }
  if (Object.keys(patch).length > 0) {
    ops.push({ type: 'set_sheet_meta', sheetId, patch });
  }

  return ops;
}

interface RowEntry {
  _id?: unknown;
  [key: string]: unknown;
}

/** 按 _id 粒度对比 rows 变更，只产出变更行（增/改/删）的 set_rows op */
function diffRows(
  sheetId: string,
  beforeRows: unknown,
  afterRows: unknown,
): WorkbookPatchOp[] {
  const beforeArr = (Array.isArray(beforeRows) ? beforeRows : []) as RowEntry[];
  const afterArr = (Array.isArray(afterRows) ? afterRows : []) as RowEntry[];

  const beforeMap = new Map<string, RowEntry>();
  for (const row of beforeArr) {
    if (row?._id != null) beforeMap.set(String(row._id), row);
  }

  const changed: Record<string, Record<string, unknown> | null> = {};

  for (const row of afterArr) {
    if (row?._id == null) continue;
    const id = String(row._id);
    const prev = beforeMap.get(id);
    if (!prev || !cellEqual(prev, row)) {
      changed[id] = row;
    }
    beforeMap.delete(id);
  }

  for (const id of beforeMap.keys()) {
    changed[id] = null;
  }

  if (Object.keys(changed).length === 0) return [];
  return [{ type: 'set_rows', sheetId, rows: changed }];
}

export function estimatePatchBytes(ops: unknown[]): number {
  return JSON.stringify(ops).length;
}
