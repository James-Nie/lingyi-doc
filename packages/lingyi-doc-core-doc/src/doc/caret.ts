import type { DocBlock, TableBlock } from './types';
import { getListItemPlainText, setListItemCaret } from './listDom';
import type { ListBoundaryFocus } from './listBoundary';
import { extractContentFromEditable, isTextBlock, setCaretOffset } from './utils';

export type CaretPosition = 'start' | 'end' | number;

/** 待 DOM 同步完成后恢复的光标意图 */
export type PendingCaret = {
  blockId: string;
  blockIndex: number;
  position: CaretPosition;
  listItemIndex?: number;
  tableCell?: { row: number; col: number };
};

export type PendingCaretSpec = {
  blockIndex: number;
  position?: CaretPosition;
  listItemIndex?: number;
  tableCell?: { row: number; col: number };
};

export function resolveCaretOffset(position: CaretPosition, textLength: number): number {
  if (position === 'start') return 0;
  if (position === 'end') return textLength;
  return Math.max(0, Math.min(position, textLength));
}

export function pendingCaretFromBoundary(focus: ListBoundaryFocus): PendingCaretSpec {
  return {
    blockIndex: focus.blockIndex,
    position: focus.position,
    listItemIndex: focus.listItemIndex,
  };
}

export function buildPendingCaret(
  blocks: DocBlock[],
  spec: PendingCaretSpec,
): PendingCaret | null {
  const block = blocks[spec.blockIndex];
  if (!block) return null;
  return {
    blockId: block.id,
    blockIndex: spec.blockIndex,
    position: spec.position ?? 'start',
    listItemIndex: spec.listItemIndex,
    tableCell: spec.tableCell,
  };
}

/** 将 caret 应用到已同步的 DOM（段落/标题/引用/列表） */
export function applyCaretToBlockEl(
  el: HTMLElement,
  block: DocBlock,
  spec: { position: CaretPosition; listItemIndex?: number },
): void {
  el.focus();
  if (isTextBlock(block)) {
    const len = extractContentFromEditable(el).text.length;
    setCaretOffset(el, resolveCaretOffset(spec.position, len));
    return;
  }
  if (block.type === 'list') {
    const itemIdx = spec.listItemIndex ?? 0;
    const len = getListItemPlainText(el, itemIdx).length;
    setListItemCaret(el, itemIdx, resolveCaretOffset(spec.position, len));
  }
}

/** 结构变更后、model 已更新时用 model 文本长度定位 */
export function applyPendingCaretToBlockEl(
  el: HTMLElement,
  block: DocBlock,
  pending: PendingCaret,
): void {
  if (pending.tableCell && block.type === 'table') {
    applyPendingCaretToTableCell(el, block, pending);
    return;
  }
  el.focus();
  if (isTextBlock(block)) {
    setCaretOffset(el, resolveCaretOffset(pending.position, block.text.length));
    return;
  }
  if (block.type === 'list') {
    const itemIdx = pending.listItemIndex ?? 0;
    const textLen = block.items[itemIdx]?.text.length ?? 0;
    setListItemCaret(el, itemIdx, resolveCaretOffset(pending.position, textLen));
  }
}

export function applyPendingCaretToTableCell(
  tableRoot: HTMLElement,
  block: TableBlock,
  pending: PendingCaret,
): void {
  if (!pending.tableCell) return;
  const { row, col } = pending.tableCell;
  const cell = block.cells[row]?.[col];
  const cellEl = tableRoot.querySelector(`[data-table-cell="${row}-${col}"]`) as HTMLElement | null;
  if (!cellEl || !cell) return;
  cellEl.focus();
  setCaretOffset(cellEl, resolveCaretOffset(pending.position, cell.text.length));
}
