import { stableStringify } from './canonical';

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
  'mergeRanges', 'columnWidths', 'rowHeights', 'columnDefs', 'rows',
  'conditionalFormats', 'validations', 'defaultStyle', 'freezeState',
  'charts', 'views', 'activeViewId', 'defaultRowHeight',
  'columnFilters', 'columnFilterEnabled', 'columnFilterCols',
] as const;

export function diffWorkbook(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): import('./types').WorkbookPatchOp[] {
  const ops: import('./types').WorkbookPatchOp[] = [];

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
): import('./types').WorkbookPatchOp[] {
  const ops: import('./types').WorkbookPatchOp[] = [];

  const beforeCells = (before.cells as Record<string, unknown>) || {};
  const afterCells = (after.cells as Record<string, unknown>) || {};
  const cellKeys = new Set([...Object.keys(beforeCells), ...Object.keys(afterCells)]);

  for (const key of cellKeys) {
    const prevCell = beforeCells[key];
    const nextCell = afterCells[key];
    if (stableStringify(prevCell) !== stableStringify(nextCell)) {
      ops.push({ type: 'set_cell', sheetId, key, cell: nextCell ?? null });
    }
  }

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

export function estimatePatchBytes(ops: unknown[]): number {
  return JSON.stringify(ops).length;
}
