import ExcelJS from 'exceljs';
import type { FreeTable } from '../model/index';
import type { Workbook } from '../model/Workbook';
import type { CellData, CellStyle, CellValue, NumberFormat } from '../types/index';
import { DEFAULT_COLUMN_WIDTH, DEFAULT_ROW_HEIGHT, keyToCoord } from '../types/index';
import { resolveColumnWidth } from '../utils/columnLayout';
import { resolveRowHeight } from '../utils/rowLayout';
import { cellStyleToExcel, cssToArgb } from './excelStyle';

function hasMeaningfulStyle(style?: CellStyle): boolean {
  if (!style) return false;
  return !!(
    style.fontFamily
    || style.fontSize
    || style.bold
    || style.italic
    || style.underline
    || style.strikethrough
    || style.fontColor
    || style.backgroundColor
    || style.horizontalAlign
    || style.verticalAlign
    || style.textWrap
    || style.borderTop
    || style.borderRight
    || style.borderBottom
    || style.borderLeft
  );
}

function getTableBounds(table: FreeTable): { maxRow: number; maxCol: number } {
  let maxRow = -1;
  let maxCol = -1;

  for (const [key, cell] of table.sheet.cells) {
    const { row, col } = keyToCoord(key);
    if (cell.value.type !== 'empty' || hasMeaningfulStyle(cell.style)) {
      maxRow = Math.max(maxRow, row);
      maxCol = Math.max(maxCol, col);
    }
  }

  for (const merge of table.sheet.mergeRanges) {
    maxRow = Math.max(maxRow, merge.end.row);
    maxCol = Math.max(maxCol, merge.end.col);
  }

  return { maxRow, maxCol };
}

function numberFormatToExcel(format?: NumberFormat): string | undefined {
  if (!format) return undefined;
  switch (format.kind) {
    case 'fixed':
      return `0.${'0'.repeat(Math.max(0, format.decimals))}`;
    case 'currency':
      return `${format.symbol}#,##0.${'0'.repeat(Math.max(0, format.decimals))}`;
    case 'percent':
      return `0.${'0'.repeat(Math.max(0, format.decimals))}%`;
    case 'scientific':
      return `0.${'0'.repeat(Math.max(0, format.decimals))}E+00`;
    default:
      return undefined;
  }
}

function applyCellValue(cell: ExcelJS.Cell, value: CellValue): void {
  switch (value.type) {
    case 'empty':
      return;
    case 'formula': {
      const formula = value.formula.replace(/^=/, '');
      if (value.cached && value.cached.type !== 'empty') {
        cell.value = { formula, result: cellValueToPrimitive(value.cached) };
      } else {
        cell.value = { formula };
      }
      return;
    }
    case 'number':
      cell.value = value.value;
      {
        const numFmt = numberFormatToExcel(value.format);
        if (numFmt) cell.numFmt = numFmt;
      }
      return;
    case 'boolean':
      cell.value = value.value;
      return;
    case 'date':
      cell.value = new Date(value.timestamp);
      cell.numFmt = 'yyyy/mm/dd';
      return;
    case 'text':
      cell.value = value.text;
      return;
    case 'error':
      cell.value = { formula: value.error, result: value.error };
      return;
    case 'richtext':
      cell.value = {
        richText: value.segments.map(seg => ({
          text: seg.text,
          font: {
            bold: seg.bold,
            italic: seg.italic,
            underline: seg.underline,
            size: seg.fontSize,
            color: seg.fontColor ? { argb: cssToArgb(seg.fontColor) } : undefined,
          },
        })),
      };
      return;
    case 'link':
      cell.value = {
        text: value.text || value.url,
        hyperlink: value.url,
      };
      return;
  }
}

function cellValueToPrimitive(value: CellValue): string | number | boolean | Date | undefined {
  switch (value.type) {
    case 'empty':
      return undefined;
    case 'number':
      return value.value;
    case 'boolean':
      return value.value;
    case 'date':
      return new Date(value.timestamp);
    case 'text':
      return value.text;
    case 'error':
      return value.error;
    case 'richtext':
      return value.segments.map(seg => seg.text).join('');
    case 'link':
      return value.text || value.url;
    default:
      return undefined;
  }
}

function applyCellStyle(cell: ExcelJS.Cell, style?: CellStyle): void {
  const excelStyle = cellStyleToExcel(style);
  if (!excelStyle) return;
  if (excelStyle.font) cell.font = { ...cell.font, ...excelStyle.font };
  if (excelStyle.fill) cell.fill = excelStyle.fill;
  if (excelStyle.alignment) cell.alignment = { ...cell.alignment, ...excelStyle.alignment };
  if (excelStyle.border) cell.border = { ...cell.border, ...excelStyle.border };
}

function exportWorksheetSizes(table: FreeTable, worksheet: ExcelJS.Worksheet, maxRow: number, maxCol: number): void {
  for (let c = 0; c <= maxCol; c++) {
    const px = resolveColumnWidth(c, table.sheet.columnWidths, DEFAULT_COLUMN_WIDTH);
    if (px <= 0) {
      worksheet.getColumn(c + 1).hidden = true;
      continue;
    }
    worksheet.getColumn(c + 1).width = Math.max(px / 7, 1);
  }

  for (let r = 0; r <= maxRow; r++) {
    const px = resolveRowHeight(r, table.sheet.rowHeights, DEFAULT_ROW_HEIGHT);
    if (px <= 0) {
      worksheet.getRow(r + 1).hidden = true;
      continue;
    }
    worksheet.getRow(r + 1).height = Math.max(px * 3 / 4, 12);
  }
}

function writeCellData(cell: ExcelJS.Cell, cellData: CellData): void {
  if (cellData.value.type !== 'empty') {
    applyCellValue(cell, cellData.value);
  }
  applyCellStyle(cell, cellData.style);
}

export function exportTableToWorksheet(table: FreeTable, worksheet: ExcelJS.Worksheet): void {
  const { maxRow, maxCol } = getTableBounds(table);
  if (maxRow < 0) return;

  exportWorksheetSizes(table, worksheet, maxRow, maxCol);

  for (let r = 0; r <= maxRow; r++) {
    for (let c = 0; c <= maxCol; c++) {
      const merge = table.isInMergedCell(r, c);
      if (merge) {
        const master = merge.master || merge.start;
        if (r !== master.row || c !== master.col) continue;
      }

      const cellData = table.getCell(r, c);
      if (!cellData) continue;
      if (cellData.value.type === 'empty' && !hasMeaningfulStyle(cellData.style)) continue;

      writeCellData(worksheet.getCell(r + 1, c + 1), cellData);
    }
  }

  for (const merge of table.sheet.mergeRanges) {
    if (merge.start.row === merge.end.row && merge.start.col === merge.end.col) continue;
    try {
      worksheet.mergeCells(
        merge.start.row + 1,
        merge.start.col + 1,
        merge.end.row + 1,
        merge.end.col + 1,
      );
    } catch {
      // 跳过无效或重叠合并
    }
  }
}

function sanitizeSheetName(name: string, used: Set<string>): string {
  const base = (name || 'Sheet1').replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Sheet1';
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let i = 2;
  while (used.has(`${base.slice(0, 28)}_${i}`)) i++;
  const unique = `${base.slice(0, 28)}_${i}`;
  used.add(unique);
  return unique;
}

export async function exportWorkbookToXlsxBuffer(workbook: Workbook): Promise<ArrayBuffer> {
  const excelBook = new ExcelJS.Workbook();
  const usedNames = new Set<string>();

  for (const sheetInfo of workbook.sheets) {
    const worksheet = excelBook.addWorksheet(sanitizeSheetName(sheetInfo.name, usedNames));
    exportTableToWorksheet(sheetInfo.table, worksheet);
  }

  if (excelBook.worksheets.length === 0) {
    excelBook.addWorksheet('Sheet1');
  }

  return excelBook.xlsx.writeBuffer();
}
