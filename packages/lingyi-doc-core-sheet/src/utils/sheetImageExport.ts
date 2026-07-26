import type { CellRange } from '@lingyi-doc/core-types';
import { keyToCoord, getCellText } from '@lingyi-doc/core-types';
import type { FreeTable } from '../model/index';
import type { Workbook } from '../model/Workbook';
import { getSheetMergeRanges } from '@lingyi-doc/core-types';
import { renderSelectionToCanvas } from './selectionImage';
import { downloadBlob } from '@lingyi-doc/core-types';
import { printHtmlDocument, wrapImagePrintHtml } from '@lingyi-doc/core-types';

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

  for (const merge of getSheetMergeRanges(table.sheet)) {
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

function renderActiveSheetCanvas(workbook: Workbook): HTMLCanvasElement {
  const table = workbook.activeSheet;
  if (!table) throw new Error('没有可打印的工作表');

  const range = getSheetUsedRange(table);
  return renderSelectionToCanvas(
    table,
    range,
    table.sheet.columnWidths,
    table.sheet.rowHeights,
    1,
  );
}

/** 将当前工作表内容区域渲染并打开打印对话框 */
export async function printActiveSheet(workbook: Workbook, title: string): Promise<void> {
  const table = workbook.activeSheet;
  if (!table) throw new Error('没有可打印的工作表');

  const canvas = renderActiveSheetCanvas(workbook);
  const dataUrl = canvas.toDataURL('image/png');
  const sheetName = table.sheet.name || '工作表';
  await printHtmlDocument(wrapImagePrintHtml(title, dataUrl, { subtitle: sheetName }));
}
