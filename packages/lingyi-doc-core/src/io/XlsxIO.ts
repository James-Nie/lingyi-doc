import * as XLSX from 'xlsx';
import { FreeTable } from '../model/index';
import { Workbook } from '../model/Workbook';
import type { CellRange, CellValue } from '../types/index';
import { keyToCoord, parseCellValue } from '../types/index';
import { exportWorkbookToXlsxBuffer } from './excelExport';
import { importExcelWorksheet, loadExcelWorkbook } from './excelImport';

export type SpreadsheetExportFormat = 'xlsx' | 'csv';

function cellValueToExport(value: CellValue): string | number | boolean | Date | null {
  switch (value.type) {
    case 'empty':
      return null;
    case 'formula':
      return value.formula;
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
      return value.segments.map(s => s.text).join('');
    case 'link':
      return value.text || value.url;
  }
}

function getSheetBounds(table: FreeTable): { maxRow: number; maxCol: number } {
  let maxRow = -1;
  let maxCol = -1;
  for (const [key, cell] of table.sheet.cells) {
    if (cell.value.type === 'empty') continue;
    const { row, col } = keyToCoord(key);
    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, col);
  }
  return { maxRow, maxCol };
}

function fillWorksheet(table: FreeTable): XLSX.WorkSheet {
  const { maxRow, maxCol } = getSheetBounds(table);
  const ws: XLSX.WorkSheet = {};
  if (maxRow < 0) return ws;

  for (let r = 0; r <= maxRow; r++) {
    for (let c = 0; c <= maxCol; c++) {
      const cell = table.getCell(r, c);
      if (!cell || cell.value.type === 'empty') continue;

      const addr = XLSX.utils.encode_cell({ r, c });
      const val = cell.value;

      if (val.type === 'formula') {
        ws[addr] = { f: val.formula.replace(/^=/, '') };
        if (val.cached) {
          const cached = cellValueToExport(val.cached);
          if (cached !== null) ws[addr].v = cached as string | number | boolean | Date;
        }
        continue;
      }

      if (val.type === 'number') {
        ws[addr] = { t: 'n', v: val.value };
        continue;
      }

      if (val.type === 'boolean') {
        ws[addr] = { t: 'b', v: val.value };
        continue;
      }

      if (val.type === 'date') {
        ws[addr] = { t: 'd', v: new Date(val.timestamp) };
        continue;
      }

      const exported = cellValueToExport(val);
      if (exported !== null) {
        ws[addr] = { t: 's', v: String(exported) };
      }
    }
  }

  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: maxRow, c: Math.max(maxCol, 0) },
  });
  return ws;
}

function ensureTableSize(table: FreeTable, rowCount: number, colCount: number): void {
  while (table.rowCount < rowCount) {
    table.insertRows(table.rowCount, rowCount - table.rowCount);
  }
  while (table.colCount < colCount) {
    table.insertColumns(table.colCount, colCount - table.colCount);
  }
}

function importWorksheet(table: FreeTable, ws: XLSX.WorkSheet): void {
  const ref = ws['!ref'];
  if (!ref) return;

  const range = XLSX.utils.decode_range(ref);
  const rowCount = range.e.r + 1;
  const colCount = range.e.c + 1;
  ensureTableSize(table, rowCount, colCount);

  table.runBatch(() => {
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const xcell = ws[addr];
        if (!xcell || xcell.v === undefined || xcell.v === null || xcell.v === '') continue;

        if (xcell.f) {
          const formula = xcell.f.startsWith('=') ? xcell.f : `=${xcell.f}`;
          table.setCellValue(r, c, { type: 'formula', formula });
          continue;
        }

        if (xcell.t === 'b') {
          table.setCellValue(r, c, { type: 'boolean', value: Boolean(xcell.v) });
          continue;
        }

        if (xcell.t === 'n') {
          table.setCellValue(r, c, { type: 'number', value: Number(xcell.v), format: { kind: 'general' } });
          continue;
        }

        if (xcell.t === 'd' || xcell.v instanceof Date) {
          const ts = xcell.v instanceof Date ? xcell.v.getTime() : Date.parse(String(xcell.v));
          if (!Number.isNaN(ts)) {
            table.setCellValue(r, c, { type: 'date', timestamp: ts, format: { kind: 'short' } });
            continue;
          }
        }

        const text = String(xcell.w ?? xcell.v);
        if (text.startsWith('=')) {
          table.setCellValue(r, c, { type: 'formula', formula: text });
        } else {
          table.setCellValue(r, c, parseCellValue(text));
        }
      }
    }
  }, 'importWorksheet');

  const merges = ws['!merges'] as Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> | undefined;
  if (merges?.length) {
    for (const merge of merges) {
      if (merge.s.r === merge.e.r && merge.s.c === merge.e.c) continue;
      const cellRange: CellRange = {
        sheetId: table.sheetId,
        start: { row: merge.s.r, col: merge.s.c },
        end: { row: merge.e.r, col: merge.e.c },
      };
      try {
        table.mergeCells(cellRange);
      } catch {
        // 跳过无效或重叠合并
      }
    }
  }
}

export class XlsxIO {
  /** 导出整个工作簿为 Excel（保留样式、合并单元格等格式） */
  static async exportToXlsx(workbook: Workbook): Promise<Blob> {
    const buffer = await exportWorkbookToXlsxBuffer(workbook);
    return new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  /** 导出当前活动工作表为 CSV */
  static exportToCsv(workbook: Workbook): Blob {
    const active = workbook.activeSheet;
    const ws = active ? fillWorksheet(active) : {};
    const csv = XLSX.utils.sheet_to_csv(ws);
    return new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  }

  /** 从 Excel / CSV 文件导入为普通表格工作簿 */
  static async importFromFile(file: File): Promise<Workbook> {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const buffer = await file.arrayBuffer();

    const workbook = new Workbook();

    if (ext === 'csv') {
      const text = new TextDecoder('utf-8').decode(buffer);
      const book = XLSX.read(text, { type: 'string', cellDates: true });
      const sheetNames = book.SheetNames.length > 0 ? book.SheetNames : ['Sheet1'];
      for (let i = 0; i < sheetNames.length; i++) {
        const sheetName = sheetNames[i];
        const ws = book.Sheets[sheetName];
        const id = workbook.addSheet(sheetName || `Sheet${i + 1}`, 'freeform');
        const table = workbook.getSheet(id)!;
        if (ws) importWorksheet(table, ws);
        if (i === 0) workbook.switchSheet(id);
      }
      return workbook;
    }

    if (ext === 'xlsx') {
      const excelBook = await loadExcelWorkbook(buffer);
      const worksheets = excelBook.worksheets;
      if (worksheets.length === 0) {
        workbook.addSheet('Sheet1', 'freeform');
        return workbook;
      }
      for (let i = 0; i < worksheets.length; i++) {
        const worksheet = worksheets[i];
        const sheetName = worksheet.name || `Sheet${i + 1}`;
        const id = workbook.addSheet(sheetName, 'freeform');
        const table = workbook.getSheet(id)!;
        importExcelWorksheet(table, worksheet);
        if (i === 0) workbook.switchSheet(id);
      }
      return workbook;
    }

    const book = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetNames = book.SheetNames.length > 0 ? book.SheetNames : ['Sheet1'];
    for (let i = 0; i < sheetNames.length; i++) {
      const sheetName = sheetNames[i];
      const ws = book.Sheets[sheetName];
      const id = workbook.addSheet(sheetName || `Sheet${i + 1}`, 'freeform');
      const table = workbook.getSheet(id)!;
      if (ws) importWorksheet(table, ws);
      if (i === 0) workbook.switchSheet(id);
    }

    return workbook;
  }

  /** 触发浏览器下载 */
  static download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /** 导出并下载 */
  static async exportWorkbook(workbook: Workbook, format: SpreadsheetExportFormat, filename: string): Promise<void> {
    const safeName = filename.replace(/[/\\?%*:|"<>]/g, '_').trim() || '表格';
    if (format === 'xlsx') {
      const blob = await XlsxIO.exportToXlsx(workbook);
      XlsxIO.download(blob, `${safeName}.xlsx`);
    } else {
      XlsxIO.download(XlsxIO.exportToCsv(workbook), `${safeName}.csv`);
    }
  }
}
