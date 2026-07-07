import type { CellRange } from '../types/index';
import { keyToCoord, getCellText } from '../types/index';
import type { FreeTable } from '../model/index';
import type { Workbook } from '../model/Workbook';
import { renderSelectionToCanvas } from './selectionImage';
import { downloadBlob } from '../doc/export';

function getSheetUsedRange(table: FreeTable): CellRange {
  const sheetId = table.sheetId;
  let maxRow = 0;
  let maxCol = 0;

  for (const [key] of table.sheet.cells) {
    const { row, col } = keyToCoord(key);
    const cell = table.getCell(row, col);
    if (cell && getCellText(cell.value) !== '') {
      maxRow = Math.max(maxRow, row);
      maxCol = Math.max(maxCol, col);
    }
  }

  for (const merge of table.sheet.mergeRanges) {
    maxRow = Math.max(maxRow, merge.end.row);
    maxCol = Math.max(maxCol, merge.end.col);
  }

  return {
    sheetId,
    start: { row: 0, col: 0 },
    end: { row: maxRow, col: maxCol },
  };
}

/** 将当前工作表内容区域渲染为 PNG 并下载 */
export function exportActiveSheetAsPng(workbook: Workbook, filename: string): Promise<void> {
  const table = workbook.activeSheet;
  if (!table) return Promise.reject(new Error('没有可导出的工作表'));

  const range = getSheetUsedRange(table);
  const canvas = renderSelectionToCanvas(
    table,
    range,
    table.sheet.columnWidths,
    table.sheet.rowHeights,
    1,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('生成图片失败'));
        return;
      }
      const safeName = filename.replace(/[/\\?%*:|"<>]/g, '_').trim() || '表格';
      downloadBlob(blob, `${safeName}.png`);
      resolve();
    }, 'image/png');
  });
}
