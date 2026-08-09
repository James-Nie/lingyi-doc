import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { CellRange, CellValue } from '@lingyi-doc/core-types';
import { parseCellValue } from '@lingyi-doc/core-types';
import { argbToCss, excelCellToStyle } from './excelStyle';

function excelValueToCellValue(cell: ExcelJS.Cell): CellValue | null {
  if (cell.type === ExcelJS.ValueType.Merge) return null;

  if (cell.formula) {
    const formula = cell.formula.startsWith('=') ? cell.formula : `=${cell.formula}`;
    return { type: 'formula', formula };
  }

  const value = cell.value;
  if (value == null || value === '') return null;

  if (typeof value === 'object' && value !== null && 'richText' in value) {
    const rich = value as ExcelJS.CellRichTextValue;
    const segments = rich.richText.map(seg => ({
      text: seg.text,
      bold: seg.font?.bold,
      italic: seg.font?.italic,
      underline: seg.font?.underline ? seg.font.underline !== 'none' : undefined,
      fontColor: argbToCss(seg.font?.color?.argb),
      fontSize: seg.font?.size,
    }));
    const plain = segments.map(s => s.text).join('');
    const hasRichMarks = segments.some(s => s.bold || s.italic || s.underline || s.fontColor || s.fontSize);
    if (hasRichMarks) return { type: 'richtext', segments };
    return parseCellValue(plain);
  }

  if (typeof value === 'object' && value !== null && 'hyperlink' in value) {
    const link = value as ExcelJS.CellHyperlinkValue;
    return { type: 'link', url: link.hyperlink, text: link.text ?? link.hyperlink };
  }

  if (typeof value === 'number') {
    return { type: 'number', value, format: { kind: 'general' } };
  }
  if (typeof value === 'boolean') {
    return { type: 'boolean', value };
  }
  if (value instanceof Date) {
    return { type: 'date', timestamp: value.getTime(), format: { kind: 'short' } };
  }

  const text = cell.text ?? String(value);
  if (text.startsWith('=')) return { type: 'formula', formula: text };
  return parseCellValue(text);
}

function ensureTableSize(table: FreeTable, rowCount: number, colCount: number): void {
  while (table.rowCount < rowCount) {
    table.insertRows(table.rowCount, rowCount - table.rowCount);
  }
  while (table.colCount < colCount) {
    table.insertColumns(table.colCount, colCount - table.colCount);
  }
}

function getWorksheetBounds(worksheet: ExcelJS.Worksheet): {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
} {
  const dim = worksheet.dimensions;
  if (dim) {
    return {
      minRow: dim.top,
      maxRow: dim.bottom,
      minCol: dim.left,
      maxCol: dim.right,
    };
  }

  let maxRow = 1;
  let maxCol = 1;
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    maxRow = Math.max(maxRow, rowNumber);
    row.eachCell({ includeEmpty: false }, (_, colNumber) => {
      maxCol = Math.max(maxCol, colNumber);
    });
  });
  return { minRow: 1, maxRow, minCol: 1, maxCol };
}

function parseMergeRef(mergeRef: string, sheetId: string): CellRange | null {
  try {
    const range = XLSX.utils.decode_range(mergeRef);
    if (range.s.r === range.e.r && range.s.c === range.e.c) return null;
    return {
      sheetId,
      start: { row: range.s.r, col: range.s.c },
      end: { row: range.e.r, col: range.e.c },
    };
  } catch {
    return null;
  }
}

function importWorksheetSizes(table: FreeTable, worksheet: ExcelJS.Worksheet): void {
  worksheet.columns?.forEach((col, index) => {
    if (!col?.width) return;
    table.setColumnWidth(index, Math.max(20, Math.round(col.width * 7)));
  });
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (!row.height) return;
    table.setRowHeight(rowNumber - 1, Math.max(10, Math.round(row.height * 4 / 3)));
  });
}

/** 使用 ExcelJS 导入 .xlsx 工作表（保留样式与合并） */
export function importExcelWorksheet(table: FreeTable, worksheet: ExcelJS.Worksheet): void {
  const { minRow, maxRow, minCol, maxCol } = getWorksheetBounds(worksheet);
  ensureTableSize(table, maxRow, maxCol);

  table.runBatch(() => {
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = worksheet.getCell(r, c);
        const row = r - 1;
        const col = c - 1;

        const cellValue = excelValueToCellValue(cell);
        if (cellValue) {
          table.setCellValue(row, col, cellValue);
        }

        const cellStyle = excelCellToStyle(cell);
        if (cellStyle) {
          table.setCellStyle(row, col, cellStyle);
        }
      }
    }
  }, 'importExcel');

  const merges = worksheet.model.merges ?? [];
  for (const mergeRef of merges) {
    const range = parseMergeRef(mergeRef, table.sheetId);
    if (!range) continue;
    try {
      table.mergeCells(range);
    } catch {
      // 跳过无效或重叠合并
    }
  }

  importWorksheetSizes(table, worksheet);
}

export async function loadExcelWorkbook(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}
