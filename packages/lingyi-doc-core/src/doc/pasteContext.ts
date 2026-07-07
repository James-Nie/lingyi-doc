import type { DocBlock, ListBlock, TableBlock, TextMark } from './types';
import {
  extractContentFromEditable,
  isTextBlock,
  normalizeMarks,
  getCaretOffset,
} from './utils';
import { findBlockIndexFromNode } from './selection';
import { getListCaretContext, getListItemPlainText, findListItemEl, getListItemIndex, getListTextEl } from './listDom';

export type EditablePasteContext = {
  blockIndex: number;
  offset: number;
  currentText: string;
  currentMarks: TextMark[];
  tableCell?: { row: number; col: number };
  listItemIndex?: number;
};

/** 从单元格 contentEditable 解析行列坐标 */
export function parseTableCellCoords(el: HTMLElement | null): { row: number; col: number } | null {
  const attr = el?.getAttribute('data-table-cell');
  if (!attr) return null;
  const [row, col] = attr.split('-').map(Number);
  if (Number.isNaN(row) || Number.isNaN(col)) return null;
  return { row, col };
}

function offsetInEditable(editable: HTMLElement, container: Node, nodeOffset: number): number {
  if (!editable.contains(container)) {
    return extractContentFromEditable(editable).text.length;
  }
  const pre = document.createRange();
  pre.selectNodeContents(editable);
  pre.setEnd(container, nodeOffset);
  const temp = document.createElement('div');
  temp.appendChild(pre.cloneContents());
  return extractContentFromEditable(temp).text.length;
}

function trimMarksAfterDelete(marks: TextMark[], delStart: number, delEnd: number, textLen: number): TextMark[] {
  const lo = Math.min(delStart, delEnd);
  const hi = Math.max(delStart, delEnd);
  const removedLen = hi - lo;
  return normalizeMarks(
    marks
      .filter(m => m.end <= lo || m.start >= hi)
      .map(m => (m.start >= hi
        ? { ...m, start: m.start - removedLen, end: m.end - removedLen }
        : m)),
    textLen,
  );
}

/** 删除 editable 内原生选区，返回删除后的文本/marks/光标 */
export function deleteSelectionInEditable(editable: HTMLElement): {
  text: string;
  marks: TextMark[];
  caret: number;
} {
  const extracted = extractContentFromEditable(editable);
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    return {
      text: extracted.text,
      marks: extracted.marks,
      caret: getCaretOffset(editable),
    };
  }
  if (!editable.contains(sel.anchorNode) || !editable.contains(sel.focusNode)) {
    return {
      text: extracted.text,
      marks: extracted.marks,
      caret: getCaretOffset(editable),
    };
  }

  const range = sel.getRangeAt(0);
  const start = offsetInEditable(editable, range.startContainer, range.startOffset);
  const end = offsetInEditable(editable, range.endContainer, range.endOffset);
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const text = extracted.text.slice(0, lo) + extracted.text.slice(hi);
  const marks = trimMarksAfterDelete(extracted.marks, lo, hi, text.length);
  return { text, marks, caret: lo };
}

/** 在文本/mark 指定位置插入纯文本 */
export function insertTextWithMarks(
  baseText: string,
  baseMarks: TextMark[],
  insertAt: number,
  insertText: string,
): { text: string; marks: TextMark[] } {
  const lo = Math.max(0, Math.min(insertAt, baseText.length));
  const newText = baseText.slice(0, lo) + insertText + baseText.slice(lo);
  const marksBefore = baseMarks.filter(m => m.end <= lo);
  const marksAfter = baseMarks
    .filter(m => m.start >= lo)
    .map(m => ({ ...m, start: m.start + insertText.length, end: m.end + insertText.length }));
  return { text: newText, marks: normalizeMarks([...marksBefore, ...marksAfter], newText.length) };
}

function resolveListItemPasteContext(
  listRoot: HTMLElement,
  block: ListBlock,
  blockIndex: number,
): EditablePasteContext | null {
  let listCtx = getListCaretContext(listRoot);

  if (!listCtx) {
    const sel = window.getSelection();
    const focusNode = sel?.focusNode;
    if (!sel || sel.rangeCount === 0 || !focusNode) return null;
    const li = findListItemEl(focusNode, listRoot);
    if (!li) return null;
    const itemIndex = getListItemIndex(li);
    const textEl = getListTextEl(li);
    const item = block.items[itemIndex];
    if (!item) return null;
    return {
      blockIndex,
      offset: getCaretOffset(textEl),
      currentText: getListItemPlainText(listRoot, itemIndex),
      currentMarks: [...(item.marks ?? [])],
      listItemIndex: itemIndex,
    };
  }

  if (!listCtx.collapsed && listCtx.anchorItemIndex !== listCtx.focusItemIndex) {
    return null;
  }

  const itemIndex = listCtx.focusItemIndex;
  const item = block.items[itemIndex];
  let text = listCtx.focusItemText;
  let marks = [...(item?.marks ?? [])];
  let offset = listCtx.focusOffset;

  if (!listCtx.collapsed) {
    const lo = Math.min(listCtx.anchorOffset, listCtx.focusOffset);
    const hi = Math.max(listCtx.anchorOffset, listCtx.focusOffset);
    text = text.slice(0, lo) + text.slice(hi);
    marks = trimMarksAfterDelete(marks, lo, hi, text.length);
    offset = lo;
  }

  return {
    blockIndex,
    offset,
    currentText: text,
    currentMarks: marks,
    listItemIndex: itemIndex,
  };
}

/** 解析粘贴目标（含删除选区内文字），供 model 层插入 */
export function resolveEditablePasteContext(
  editable: HTMLElement,
  blocks: DocBlock[],
): EditablePasteContext | null {
  const blockIndex = findBlockIndexFromNode(editable);
  if (blockIndex < 0) return null;
  const block = blocks[blockIndex];
  if (!block) return null;

  const tableCell = parseTableCellCoords(editable);
  if (block.type === 'table' && tableCell && editable.dataset.docEditable !== undefined) {
    const { text, marks, caret } = deleteSelectionInEditable(editable);
    return { blockIndex, offset: caret, currentText: text, currentMarks: marks, tableCell };
  }

  if (block.type === 'list' && editable.dataset.listRoot !== undefined) {
    return resolveListItemPasteContext(editable, block, blockIndex);
  }

  if (isTextBlock(block) && editable.dataset.docEditable !== undefined && editable.dataset.listRoot === undefined) {
    const { text, marks, caret } = deleteSelectionInEditable(editable);
    return { blockIndex, offset: caret, currentText: text, currentMarks: marks };
  }

  return null;
}

/** 从单个 editable（段落/表格单元格）提取选区 plain */
export function extractEditableSelectionPlainText(editable: HTMLElement): string {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return '';
  if (!editable.contains(sel.anchorNode) || !editable.contains(sel.focusNode)) return '';

  const extracted = extractContentFromEditable(editable);
  const range = sel.getRangeAt(0);
  const start = offsetInEditable(editable, range.startContainer, range.startOffset);
  const end = offsetInEditable(editable, range.endContainer, range.endOffset);
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  return extracted.text.slice(lo, hi);
}

/** 从列表根节点提取选区 plain（单条内或跨条） */
export function extractListSelectionPlainText(listRoot: HTMLElement): string {
  const ctx = getListCaretContext(listRoot);
  if (!ctx || ctx.collapsed) return '';

  if (ctx.anchorItemIndex === ctx.focusItemIndex) {
    const lo = Math.min(ctx.anchorOffset, ctx.focusOffset);
    const hi = Math.max(ctx.anchorOffset, ctx.focusOffset);
    const itemText = getListItemPlainText(listRoot, ctx.anchorItemIndex);
    return itemText.slice(lo, hi);
  }

  const parts: string[] = [];
  const loItem = Math.min(ctx.anchorItemIndex, ctx.focusItemIndex);
  const hiItem = Math.max(ctx.anchorItemIndex, ctx.focusItemIndex);
  const forward = ctx.anchorItemIndex <= ctx.focusItemIndex;

  for (let i = loItem; i <= hiItem; i++) {
    const itemText = getListItemPlainText(listRoot, i);
    if (loItem === hiItem) break;
    if (i === loItem) {
      parts.push(forward
        ? itemText.slice(ctx.anchorOffset)
        : itemText.slice(ctx.focusOffset));
    } else if (i === hiItem) {
      parts.push(forward
        ? itemText.slice(0, ctx.focusOffset)
        : itemText.slice(0, ctx.anchorOffset));
    } else {
      parts.push(itemText);
    }
  }
  return parts.join('\n');
}

export function normalizePasteText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '');
}
