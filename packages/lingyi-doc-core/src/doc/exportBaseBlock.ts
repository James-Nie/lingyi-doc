import { FreeTable } from '../model/FreeTable';
import { getCellText } from '../types/index';
import { isBaseSheet } from '../types/sheetGuards';
import type { BaseBlock, DocBlock, TableBlock, TableCell } from './types';

const MAX_EXPORT_ROWS = 100;
const MAX_EXPORT_COLS = 20;

/** 将文档内嵌多维表格块转为可导出的表格块 */
export function baseBlockToExportTable(block: BaseBlock): DocBlock {
  try {
    const table = FreeTable.fromJSON(block.sheetData);
    const sheet = table.sheet;
    if (!isBaseSheet(sheet)) {
      return {
        type: 'paragraph',
        id: block.id,
        text: `[${block.title ?? '多维表格'}]`,
        marks: [],
      };
    }

    const cols = (sheet.columnDefs ?? []).filter(col => !col.hidden).slice(0, MAX_EXPORT_COLS);
    if (!cols.length) {
      return {
        type: 'paragraph',
        id: block.id,
        text: `[${block.title ?? '多维表格'}]`,
        marks: [],
      };
    }

    const headerRow: TableCell[] = cols.map(col => ({
      text: col.name || '',
      marks: [],
      cellStyle: 'heading2',
    }));

    const dataRows: TableCell[][] = [];
    const rowLimit = Math.min(table.rowCount, MAX_EXPORT_ROWS - 1);
    for (let rowIndex = 0; rowIndex < rowLimit; rowIndex++) {
      const row: TableCell[] = cols.map(col => {
        const colIndex = sheet.columnDefs.findIndex(def => def.id === col.id);
        const cell = colIndex >= 0 ? table.getCell(rowIndex, colIndex) : undefined;
        return {
          text: getCellText(cell?.value ?? { type: 'empty' }),
          marks: [],
        };
      });
      if (row.some(cell => cell.text.trim())) {
        dataRows.push(row);
      }
    }

    const cells = [headerRow, ...dataRows];
    const exportTable: TableBlock = {
      type: 'table',
      id: block.id,
      rows: cells.length,
      cols: cols.length,
      cells,
    };
    return exportTable;
  } catch {
    return {
      type: 'paragraph',
      id: block.id,
      text: `[${block.title ?? '多维表格'}]`,
      marks: [],
    };
  }
}
