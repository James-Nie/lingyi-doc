import { normalizeRange } from '@lingyi-doc/core-sheet';
import type { CellCoord, CellRange } from '@lingyi-doc/core-types';

/** 焦点在可编辑区域时不拦截快捷键（避免 Backspace 无法删字） */
export function shouldIgnoreSheetShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  if (target.closest('[data-freeform-dropdown-cell], [data-sheet-keep-selection]')) return true;
  if (target.closest('.ant-modal, .ant-select-dropdown, .ant-picker-dropdown, .sheet-select-dropdown, .sheet-select-dropdown-panel, [data-sheet-dropdown-config]')) return true;
  return false;
}

export function resolveCopySourceRange(
  sheetId: string,
  selectionRange: CellRange | null,
  discreteSelections: CellCoord[],
): CellRange | null {
  if (discreteSelections.length > 1) {
    const minRow = Math.min(...discreteSelections.map(c => c.row));
    const maxRow = Math.max(...discreteSelections.map(c => c.row));
    const minCol = Math.min(...discreteSelections.map(c => c.col));
    const maxCol = Math.max(...discreteSelections.map(c => c.col));
    return { sheetId, start: { row: minRow, col: minCol }, end: { row: maxRow, col: maxCol } };
  }
  if (selectionRange) {
    const norm = normalizeRange(selectionRange);
    return {
      sheetId,
      start: { row: norm.startRow, col: norm.startCol },
      end: { row: norm.endRow, col: norm.endCol },
    };
  }
  return null;
}

export function rangesEqual(a: CellRange, b: CellRange): boolean {
  const na = normalizeRange(a);
  const nb = normalizeRange(b);
  return na.startRow === nb.startRow
    && na.endRow === nb.endRow
    && na.startCol === nb.startCol
    && na.endCol === nb.endCol;
}
