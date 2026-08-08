import type { DocumentRecord } from '../types/database';
import { extractDocumentPlainText } from './documentContentStats';
import { parseCellCoord } from './mcp-sheet-write.util';

export interface McpSheetCellMap {
  [key: string]: string;
}

export interface McpSheetSummary {
  sheetId: string;
  name: string;
  type: string;
  rowCount: number;
  colCount: number;
  cells: McpSheetCellMap;
  markdownTable: string;
  columns?: Array<{ id: string; name: string; type?: string }>;
  records?: Array<Record<string, string>>;
}

function cellValueToText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const v = value as Record<string, unknown>;
  switch (v.type) {
    case 'empty':
      return '';
    case 'text':
      return String(v.text ?? '');
    case 'number':
      return String(v.value ?? '');
    case 'boolean':
      return v.value ? 'TRUE' : 'FALSE';
    case 'date':
      return String(v.timestamp ?? '');
    case 'formula':
      return v.cached ? cellValueToText(v.cached) : '';
    case 'error':
      return String(v.error ?? '');
    case 'richtext':
      return Array.isArray(v.segments)
        ? v.segments.map((seg) => (seg as { text?: string }).text ?? '').join('')
        : '';
    case 'link':
      return String(v.text || v.url || '');
    default:
      return '';
  }
}

function extractCellText(cell: unknown): string {
  if (!cell || typeof cell !== 'object') return '';
  const c = cell as Record<string, unknown>;
  if (c.value) return cellValueToText(c.value);
  if (typeof c.text === 'string') return c.text;
  return cellValueToText(c);
}

function fieldValueToText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => fieldValueToText(item)).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.type) return cellValueToText(record);
    if (typeof record.text === 'string') return record.text;
    if (typeof record.name === 'string') return record.name;
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return '';
}

function escapeMarkdownCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function buildMarkdownTable(cells: McpSheetCellMap, maxRow: number, maxCol: number): string {
  if (maxRow < 0 || maxCol < 0) return '';
  const lines: string[] = [];
  for (let row = 0; row <= maxRow; row += 1) {
    const values: string[] = [];
    for (let col = 0; col <= maxCol; col += 1) {
      values.push(escapeMarkdownCell(
        cells[`R${row}C${col}`] ?? cells[`${row}:${col}`] ?? '',
      ));
    }
    if (values.every((value) => !value)) continue;
    lines.push(`| ${values.join(' | ')} |`);
    if (lines.length === 1) {
      lines.push(`| ${values.map(() => '---').join(' | ')} |`);
    }
  }
  return lines.join('\n');
}

function serializeFreeformSheet(sheetId: string, sheetData: Record<string, unknown>): McpSheetSummary {
  const cellsRaw = sheetData.cells;
  const cells: McpSheetCellMap = {};
  let maxRow = -1;
  let maxCol = -1;

  if (cellsRaw && typeof cellsRaw === 'object') {
    for (const [key, cell] of Object.entries(cellsRaw as Record<string, unknown>)) {
      const text = extractCellText(cell);
      if (!text) continue;
      const coord = parseCellCoord(key);
      if (!coord) continue;
      const normalizedKey = `R${coord.row}C${coord.col}`;
      cells[normalizedKey] = text;
      maxRow = Math.max(maxRow, coord.row);
      maxCol = Math.max(maxCol, coord.col);
    }
  }

  return {
    sheetId,
    name: String(sheetData.name ?? sheetId),
    type: String(sheetData.type ?? 'freeform'),
    rowCount: Number(sheetData.rowCount ?? maxRow + 1),
    colCount: Number(sheetData.colCount ?? maxCol + 1),
    cells,
    markdownTable: buildMarkdownTable(cells, maxRow, maxCol),
  };
}

function serializeBaseSheet(sheetId: string, sheetData: Record<string, unknown>): McpSheetSummary {
  const columnDefs = Array.isArray(sheetData.columnDefs)
    ? sheetData.columnDefs as Array<Record<string, unknown>>
    : [];
  const rows = Array.isArray(sheetData.rows)
    ? sheetData.rows as Array<Record<string, unknown>>
    : [];

  const columns = columnDefs.map((col) => ({
    id: String(col.id ?? ''),
    name: String(col.name ?? col.id ?? ''),
    type: typeof col.type === 'string' ? col.type : undefined,
  }));

  const records = rows.map((row) => {
    const record: Record<string, string> = {};
    for (const col of columns) {
      record[col.name || col.id] = fieldValueToText(row[col.id]);
    }
    return record;
  });

  const header = columns.map((col) => col.name || col.id);
  const markdownLines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...records.map((record) => `| ${header.map((key) => escapeMarkdownCell(record[key] ?? '')).join(' | ')} |`),
  ];

  return {
    sheetId,
    name: String(sheetData.name ?? sheetId),
    type: 'base',
    rowCount: rows.length,
    colCount: columns.length,
    cells: {},
    markdownTable: records.length > 0 ? markdownLines.join('\n') : '',
    columns,
    records,
  };
}

function serializeSheetEntry(sheetId: string, sheetData: Record<string, unknown>): McpSheetSummary {
  if (sheetData.type === 'base') {
    return serializeBaseSheet(sheetId, sheetData);
  }
  return serializeFreeformSheet(sheetId, sheetData);
}

export function extractWorkbookSheets(data: unknown): McpSheetSummary[] {
  if (!data || typeof data !== 'object') return [];
  const workbook = data as Record<string, unknown>;
  const summaries: McpSheetSummary[] = [];

  if (Array.isArray(workbook.sheets)) {
    const order = Array.isArray(workbook.sheetOrder)
      ? workbook.sheetOrder as string[]
      : workbook.sheets.map((sheet) => String((sheet as Record<string, unknown>).id ?? ''));

    const sheetMap = new Map<string, Record<string, unknown>>();
    for (const item of workbook.sheets) {
      if (!item || typeof item !== 'object') continue;
      const wrapper = item as Record<string, unknown>;
      const sheetId = String(wrapper.id ?? '');
      if (!sheetId) continue;
      const sheetData = (wrapper.data && typeof wrapper.data === 'object'
        ? wrapper.data
        : wrapper) as Record<string, unknown>;
      sheetMap.set(sheetId, sheetData);
    }

    for (const sheetId of order) {
      const sheetData = sheetMap.get(sheetId);
      if (sheetData) summaries.push(serializeSheetEntry(sheetId, sheetData));
    }

    for (const [sheetId, sheetData] of sheetMap.entries()) {
      if (!order.includes(sheetId)) summaries.push(serializeSheetEntry(sheetId, sheetData));
    }
    return summaries;
  }

  if (workbook.cells || workbook.columnDefs || workbook.rows) {
    summaries.push(serializeSheetEntry(
      String(workbook.sheetId ?? workbook.activeSheetId ?? 'sheet1'),
      workbook,
    ));
  }

  return summaries;
}

export function buildMcpDocumentPayload(doc: DocumentRecord) {
  const docType = doc.docType === 'rich' ? 'richtext' : doc.docType;
  const plainText = extractDocumentPlainText(doc.data, docType);
  const sheets = docType === 'freeform' || docType === 'base'
    ? extractWorkbookSheets(doc.data)
    : [];

  const sheetText = sheets
    .map((sheet) => {
      const parts = [`## Sheet: ${sheet.name} (${sheet.type})`];
      if (sheet.markdownTable) parts.push(sheet.markdownTable);
      return parts.join('\n');
    })
    .filter(Boolean)
    .join('\n\n');

  return {
    docId: doc.id,
    title: doc.title,
    docType: doc.docType,
    version: doc.version,
    updatedAt: doc.updatedAt,
    plainText: plainText || sheetText,
    content: doc.data ?? null,
    sheets,
    sheetText: sheetText || undefined,
  };
}
