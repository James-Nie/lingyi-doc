/** MCP 表格写入：把二维数组 / Markdown 转成系统 workbook JSON */

export type SheetWriteMode = 'replace' | 'append';

export interface SheetRowsInput {
  rows?: unknown;
  markdownTable?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function cellKey(row: number, col: number): string {
  return `R${row}C${col}`;
}

export function parseCellCoord(key: string): { row: number; col: number } | null {
  const rc = /^R(\d+)C(\d+)$/i.exec(key);
  if (rc) return { row: Number(rc[1]), col: Number(rc[2]) };
  const parts = key.split(':');
  if (parts.length === 2) {
    const row = Number(parts[0]);
    const col = Number(parts[1]);
    if (Number.isFinite(row) && Number.isFinite(col)) return { row, col };
  }
  return null;
}

function scalarToCellValue(raw: unknown): Record<string, unknown> {
  if (raw == null || raw === '') return { type: 'empty' };
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { type: 'number', value: raw, format: { kind: 'general' } };
  }
  if (typeof raw === 'boolean') return { type: 'boolean', value: raw };
  const text = String(raw).trim();
  if (!text) return { type: 'empty' };
  if (/^(true|false|是|否|yes|no)$/i.test(text)) {
    const upper = text.toUpperCase();
    return {
      type: 'boolean',
      value: upper === 'TRUE' || upper === 'YES' || text === '是',
    };
  }
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return { type: 'number', value: Number(text), format: { kind: 'general' } };
  }
  return { type: 'text', text };
}

function createCellData(raw: unknown): Record<string, unknown> {
  return { value: scalarToCellValue(raw) };
}

/** 解析 Markdown 表格为二维字符串数组（跳过对齐分隔行） */
export function parseMarkdownTable(markdown: string): string[][] {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes('|'));

  const rows: string[][] = [];
  for (const line of lines) {
    const trimmed = line.replace(/^\|/, '').replace(/\|$/, '');
    const cells = trimmed.split('|').map((cell) => cell.trim());
    if (cells.length === 0) continue;
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
    rows.push(cells.map((cell) => cell.replace(/\\\|/g, '|')));
  }
  return rows;
}

export function normalizeSheetRows(input: SheetRowsInput): string[][] {
  if (typeof input.markdownTable === 'string' && input.markdownTable.trim()) {
    return parseMarkdownTable(input.markdownTable);
  }
  if (!Array.isArray(input.rows)) return [];
  return input.rows.map((row) => {
    if (Array.isArray(row)) return row.map((cell) => (cell == null ? '' : String(cell)));
    if (isRecord(row)) return Object.values(row).map((cell) => (cell == null ? '' : String(cell)));
    return [String(row ?? '')];
  });
}

function emptyFreeformSheet(sheetId: string, name: string, rowCount: number, colCount: number) {
  return {
    sheetId,
    name,
    type: 'freeform',
    rowCount: Math.max(rowCount, 50),
    colCount: Math.max(colCount, 26),
    isHidden: false,
    cells: {} as Record<string, unknown>,
    columnWidths: {},
    rowHeights: {},
    conditionalFormats: [],
    validations: [],
    defaultStyle: {},
    freezeState: { frozenRows: 0, frozenCols: 0 },
    charts: [],
    mergeRanges: [],
  };
}

function cloneWorkbook(data: unknown): Record<string, unknown> {
  if (!isRecord(data)) {
    return { activeSheetId: '', sheetOrder: [], sheets: [] };
  }
  return JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
}

function ensureWorkbookShell(data: unknown): {
  workbook: Record<string, unknown>;
  sheets: Array<{ id: string; data: Record<string, unknown> }>;
} {
  const workbook = cloneWorkbook(data);
  if (!Array.isArray(workbook.sheets)) workbook.sheets = [];
  if (!Array.isArray(workbook.sheetOrder)) workbook.sheetOrder = [];
  const sheets = workbook.sheets as Array<{ id: string; data: Record<string, unknown> }>;
  return { workbook, sheets };
}

function resolveTargetSheet(
  workbook: Record<string, unknown>,
  sheets: Array<{ id: string; data: Record<string, unknown> }>,
  options: { sheetId?: string; sheetName?: string; createType: 'freeform' | 'base' },
): { id: string; data: Record<string, unknown>; created: boolean } {
  const byId = options.sheetId
    ? sheets.find((sheet) => sheet.id === options.sheetId)
    : undefined;
  if (byId) return { id: byId.id, data: byId.data ?? {}, created: false };

  const byName = options.sheetName
    ? sheets.find((sheet) => String(sheet.data?.name ?? '') === options.sheetName)
    : undefined;
  if (byName) return { id: byName.id, data: byName.data ?? {}, created: false };

  if (sheets.length === 1) {
    return { id: sheets[0].id, data: sheets[0].data ?? {}, created: false };
  }

  if (sheets.length === 0) {
    const id = `sheet_${Date.now().toString(36)}`;
    const name = options.sheetName?.trim() || 'Sheet1';
    const data = options.createType === 'base'
      ? emptyBaseSheet(id, name, [], [])
      : emptyFreeformSheet(id, name, 50, 26);
    sheets.push({ id, data });
    workbook.sheetOrder = [id];
    workbook.activeSheetId = id;
    return { id, data, created: true };
  }

  const activeId = String(workbook.activeSheetId ?? '');
  const active = sheets.find((sheet) => sheet.id === activeId) ?? sheets[0];
  return { id: active.id, data: active.data ?? {}, created: false };
}

function findLastUsedRow(cells: Record<string, unknown>): number {
  let max = -1;
  for (const key of Object.keys(cells)) {
    const coord = parseCellCoord(key);
    if (coord) max = Math.max(max, coord.row);
  }
  return max;
}

export function writeSheetCellsToWorkbook(
  data: unknown,
  input: {
    rows: string[][];
    sheetId?: string;
    sheetName?: string;
    mode?: SheetWriteMode;
    startRow?: number;
    startCol?: number;
  },
): { data: Record<string, unknown>; sheetId: string; rowCount: number; colCount: number } {
  const matrix = input.rows;
  if (matrix.length === 0) {
    throw new Error('rows/markdownTable is empty');
  }

  const { workbook, sheets } = ensureWorkbookShell(data);
  const target = resolveTargetSheet(workbook, sheets, {
    sheetId: input.sheetId,
    sheetName: input.sheetName,
    createType: 'freeform',
  });

  const sheet = {
    ...emptyFreeformSheet(
      target.id,
      String(target.data.name ?? input.sheetName ?? 'Sheet1'),
      50,
      26,
    ),
    ...target.data,
    type: 'freeform',
    sheetId: target.id,
  };

  const mode = input.mode === 'append' ? 'append' : 'replace';
  const cells = mode === 'replace'
    ? ({} as Record<string, unknown>)
    : { ...((isRecord(sheet.cells) ? sheet.cells : {}) as Record<string, unknown>) };

  const startCol = Math.max(0, Number(input.startCol ?? 0) || 0);
  let startRow = Math.max(0, Number(input.startRow ?? 0) || 0);
  if (mode === 'append' && input.startRow == null) {
    startRow = findLastUsedRow(cells) + 1;
  }

  let maxCol = startCol;
  for (let r = 0; r < matrix.length; r += 1) {
    const row = matrix[r] ?? [];
    for (let c = 0; c < row.length; c += 1) {
      const absoluteRow = startRow + r;
      const absoluteCol = startCol + c;
      maxCol = Math.max(maxCol, absoluteCol);
      const value = row[c];
      if (value == null || String(value) === '') {
        if (mode === 'replace') delete cells[cellKey(absoluteRow, absoluteCol)];
        continue;
      }
      cells[cellKey(absoluteRow, absoluteCol)] = createCellData(value);
    }
  }

  sheet.cells = cells;
  sheet.rowCount = Math.max(Number(sheet.rowCount ?? 0), startRow + matrix.length, 50);
  sheet.colCount = Math.max(Number(sheet.colCount ?? 0), maxCol + 1, 26);
  if (input.sheetName?.trim()) sheet.name = input.sheetName.trim();

  const index = sheets.findIndex((item) => item.id === target.id);
  if (index >= 0) sheets[index] = { id: target.id, data: sheet };
  else sheets.push({ id: target.id, data: sheet });

  workbook.sheets = sheets;
  if (!Array.isArray(workbook.sheetOrder) || (workbook.sheetOrder as string[]).length === 0) {
    workbook.sheetOrder = sheets.map((item) => item.id);
  }
  if (!workbook.activeSheetId) workbook.activeSheetId = target.id;

  return {
    data: workbook,
    sheetId: target.id,
    rowCount: matrix.length,
    colCount: Math.max(...matrix.map((row) => row.length), 0),
  };
}

function emptyBaseSheet(
  sheetId: string,
  name: string,
  columnDefs: Array<Record<string, unknown>>,
  rows: Array<Record<string, unknown>>,
) {
  return {
    sheetId,
    name,
    type: 'base',
    rowCount: Math.max(rows.length, 10),
    colCount: Math.max(columnDefs.length, 1),
    isHidden: false,
    cells: {} as Record<string, unknown>,
    columnWidths: {},
    rowHeights: {},
    conditionalFormats: [],
    validations: [],
    defaultStyle: {},
    freezeState: { frozenRows: 0, frozenCols: 1 },
    charts: [],
    columnDefs,
    rows,
    views: [{
      viewId: 'view_grid_default',
      viewName: '表格',
      viewType: 'grid',
      config: {},
    }],
    activeViewId: 'view_grid_default',
    defaultRowHeight: 36,
  };
}

function createRecordRow(order: number): Record<string, unknown> {
  const now = Date.now();
  return {
    _id: `rec_${now}_${Math.random().toString(36).slice(2, 9)}`,
    _createdAt: now,
    _createdBy: 'mcp',
    _updatedAt: now,
    _updatedBy: 'mcp',
    _order: order,
    _parentId: null,
  };
}

function slugFieldId(name: string, index: number): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  return `col_${base || index}`;
}

export function writeBaseRecordsToWorkbook(
  data: unknown,
  input: {
    columns?: Array<{ id?: string; name: string; type?: string }>;
    records: Array<Record<string, unknown>>;
    sheetId?: string;
    sheetName?: string;
    mode?: SheetWriteMode;
  },
): { data: Record<string, unknown>; sheetId: string; recordCount: number; columnCount: number } {
  if (!Array.isArray(input.records) || input.records.length === 0) {
    throw new Error('records is empty');
  }

  const { workbook, sheets } = ensureWorkbookShell(data);
  const target = resolveTargetSheet(workbook, sheets, {
    sheetId: input.sheetId,
    sheetName: input.sheetName,
    createType: 'base',
  });

  const mode = input.mode === 'append' ? 'append' : 'replace';
  const existingDefs = Array.isArray(target.data.columnDefs)
    ? (target.data.columnDefs as Array<Record<string, unknown>>)
    : [];

  let columnDefs: Array<Record<string, unknown>>;
  if (Array.isArray(input.columns) && input.columns.length > 0) {
    columnDefs = input.columns.map((col, index) => ({
      id: col.id?.trim() || slugFieldId(col.name, index),
      name: col.name.trim() || `字段${index + 1}`,
      type: col.type?.trim() || 'text',
      width: 140,
    }));
  } else if (mode === 'append' && existingDefs.length > 0) {
    columnDefs = existingDefs;
  } else {
    const keys = new Set<string>();
    for (const record of input.records) {
      Object.keys(record).forEach((key) => {
        if (!key.startsWith('_')) keys.add(key);
      });
    }
    columnDefs = Array.from(keys).map((name, index) => ({
      id: slugFieldId(name, index),
      name,
      type: 'text',
      width: 140,
    }));
  }

  const existingRows = Array.isArray(target.data.rows)
    ? (target.data.rows as Array<Record<string, unknown>>)
    : [];
  const existingCells = isRecord(target.data.cells)
    ? { ...(target.data.cells as Record<string, unknown>) }
    : {};

  const startRow = mode === 'append' ? existingRows.length : 0;
  const nextRows = mode === 'append' ? [...existingRows] : [];
  const nextCells = mode === 'append' ? existingCells : ({} as Record<string, unknown>);

  for (let i = 0; i < input.records.length; i += 1) {
    const source = input.records[i] ?? {};
    const rowIndex = startRow + i;
    const record = createRecordRow(rowIndex);

    for (let col = 0; col < columnDefs.length; col += 1) {
      const def = columnDefs[col];
      const fieldId = String(def.id);
      const fieldName = String(def.name);
      const raw = source[fieldId] ?? source[fieldName];
      const cellValue = scalarToCellValue(raw);
      record[fieldId] = cellValue;
      if (cellValue.type !== 'empty') {
        nextCells[cellKey(rowIndex, col)] = { value: cellValue };
      }
    }
    nextRows.push(record);
  }

  const sheet = {
    ...emptyBaseSheet(
      target.id,
      String(target.data.name ?? input.sheetName ?? '多维表'),
      columnDefs,
      nextRows,
    ),
    ...target.data,
    type: 'base',
    sheetId: target.id,
    name: input.sheetName?.trim() || String(target.data.name ?? '多维表'),
    columnDefs,
    rows: nextRows,
    cells: nextCells,
    rowCount: Math.max(nextRows.length, 10),
    colCount: Math.max(columnDefs.length, 1),
  };

  const index = sheets.findIndex((item) => item.id === target.id);
  if (index >= 0) sheets[index] = { id: target.id, data: sheet };
  else sheets.push({ id: target.id, data: sheet });

  workbook.sheets = sheets;
  if (!Array.isArray(workbook.sheetOrder) || (workbook.sheetOrder as string[]).length === 0) {
    workbook.sheetOrder = sheets.map((item) => item.id);
  }
  if (!workbook.activeSheetId) workbook.activeSheetId = target.id;

  return {
    data: workbook,
    sheetId: target.id,
    recordCount: input.records.length,
    columnCount: columnDefs.length,
  };
}
