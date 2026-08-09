import type { Workbook } from '@lingyi-doc/core';
import { isBaseSheet, parseFieldValue } from '@lingyi-doc/core';

/** 将公式栏/单元格编辑器中未提交的内容写入模型 */
export function commitPendingSheetEdits(
  workbook: Workbook | undefined,
  store: {
    editingCell: { row: number; col: number } | null;
    editingRecordCoord?: { row: number; col: number } | null;
    formulaBarText: string;
    setEditingCell: (coord: null) => void;
  },
): void {
  if (!workbook || !store.editingCell) return;
  const sheet = workbook.activeSheet;
  if (!sheet) return;

  // 多维表排序/分组下 editingCell 是显示行，必须写回记录行
  const target = store.editingRecordCoord ?? store.editingCell;
  const { row, col } = target;
  const text = store.formulaBarText;
  if (text.startsWith('=')) {
    sheet.setCell(row, col, null, text);
  } else if (isBaseSheet(sheet.sheet)) {
    const columnDef = sheet.sheet.columnDefs[col];
    const value = parseFieldValue(text, columnDef?.type ?? 'text', columnDef);
    sheet.setCellValue(row, col, value);
  } else {
    sheet.setCell(row, col, text);
  }
  store.setEditingCell(null);
}
