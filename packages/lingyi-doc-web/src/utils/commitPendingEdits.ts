import type { Workbook } from '@lingyi-doc/core';

/** 将公式栏/单元格编辑器中未提交的内容写入模型 */
export function commitPendingSheetEdits(
  workbook: Workbook | undefined,
  store: {
    editingCell: { row: number; col: number } | null;
    formulaBarText: string;
    setEditingCell: (coord: null) => void;
  },
): void {
  if (!workbook || !store.editingCell) return;
  const sheet = workbook.activeSheet;
  if (!sheet) return;

  const { row, col } = store.editingCell;
  const text = store.formulaBarText;
  if (text.startsWith('=')) {
    sheet.setCell(row, col, null, text);
  } else {
    sheet.setCell(row, col, text);
  }
  store.setEditingCell(null);
}
