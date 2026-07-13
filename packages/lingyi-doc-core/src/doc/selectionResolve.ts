import type { DocBlock } from './types';
import { extractContentFromEditable, getCaretOffset } from './utils';
import { findBlockIndexFromNode, findEditableRoot } from './selection';
import { findListItemEl, getListCaretContext, getListItemIndex, getListTextEl } from './listDom';
import { isTextBlock } from './utils';
import { blockAnchor, type BlockSubAnchor, type DocAnchor } from './selectionModel';

function offsetInListTextEl(textEl: HTMLElement, node: Node, nodeOffset: number): number {
  const range = document.createRange();
  range.selectNodeContents(textEl);
  range.setEnd(node, nodeOffset);
  const temp = document.createElement('div');
  temp.appendChild(range.cloneContents());
  return (temp.textContent ?? '').replace(/\u200B/g, '').length;
}

function resolveSubAnchorFromRange(range: Range, block: DocBlock, blockEl?: HTMLElement | null): BlockSubAnchor {
  if (block.type === 'list' && blockEl) {
    const li = findListItemEl(range.startContainer, blockEl);
    if (li) {
      const textEl = getListTextEl(li);
      const itemIndex = getListItemIndex(li);
      if (textEl.contains(range.startContainer) || textEl === range.startContainer) {
        return {
          kind: 'list',
          itemIndex,
          offset: offsetInListTextEl(textEl, range.startContainer, range.startOffset),
        };
      }
      return { kind: 'list', itemIndex, offset: 0 };
    }
    return { kind: 'whole' };
  }

  if (isTextBlock(block) && blockEl?.contains(range.startContainer)) {
    const editable = findEditableRoot(range.startContainer)
      ?? (blockEl.querySelector('[data-doc-editable]') as HTMLElement | null);
    if (editable?.contains(range.startContainer)) {
      const temp = document.createRange();
      temp.selectNodeContents(editable);
      temp.setEnd(range.startContainer, range.startOffset);
      const div = document.createElement('div');
      div.appendChild(temp.cloneContents());
      return { kind: 'text', offset: extractContentFromEditable(div).text.length };
    }
  }

  return { kind: 'whole' };
}

function resolveSubAnchorFromNode(node: Node, block: DocBlock): BlockSubAnchor {
  if (block.type === 'list') {
    let el: HTMLElement | null = node instanceof HTMLElement ? node : node.parentElement;
    while (el) {
      const listRoot = el.closest('[data-list-root]') as HTMLElement | null;
      if (listRoot) {
        const li = findListItemEl(node, listRoot);
        if (li) {
          const marker = li.querySelector('[data-list-marker]');
          if (marker && (marker === node || marker.contains(node))) {
            return { kind: 'list', itemIndex: getListItemIndex(li), offset: 0 };
          }
        }
        const ctx = getListCaretContext(listRoot);
        if (ctx) {
          return { kind: 'list', itemIndex: ctx.focusItemIndex, offset: ctx.focusOffset };
        }
        if (li) {
          return { kind: 'list', itemIndex: getListItemIndex(li), offset: 0 };
        }
        break;
      }
      el = el.parentElement;
    }
    return { kind: 'whole' };
  }

  if (isTextBlock(block)) {
    const editable = findEditableRoot(node);
    if (editable) {
      return { kind: 'text', offset: getCaretOffset(editable) };
    }
  }

  return { kind: 'whole' };
}

/** 从 DOM 节点解析文档锚点 */
export function resolveAnchorFromNode(node: Node | null, blocks: DocBlock[]): DocAnchor | null {
  if (!node) return null;

  const el = node instanceof Element ? node : node.parentElement;
  if (el?.closest('[data-doc-title]')) {
    const titleEl = el.closest('[data-doc-title]') as HTMLElement;
    let offset = 0;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && titleEl.contains(sel.focusNode)) {
      try {
        const range = sel.getRangeAt(0);
        const pre = range.cloneRange();
        pre.selectNodeContents(titleEl);
        pre.setEnd(range.endContainer, range.endOffset);
        offset = pre.toString().length;
      } catch {
        offset = 0;
      }
    }
    return { kind: 'title', offset };
  }

  const blockIndex = findBlockIndexFromNode(node);
  if (blockIndex < 0) return null;
  const block = blocks[blockIndex];
  if (!block) return null;

  return blockAnchor(blockIndex, resolveSubAnchorFromNode(node, block));
}

function resolveAnchorFromRange(range: Range, blocks: DocBlock[]): DocAnchor | null {
  const blockIndex = findBlockIndexFromNode(range.startContainer);
  if (blockIndex < 0) return resolveAnchorFromNode(range.startContainer, blocks);
  const block = blocks[blockIndex];
  if (!block) return null;

  let blockEl: HTMLElement | null = null;
  const startEl = range.startContainer instanceof Element
    ? range.startContainer
    : range.startContainer.parentElement;
  if (startEl) {
    blockEl = startEl.closest('[data-block-index]') as HTMLElement | null;
  }

  return blockAnchor(blockIndex, resolveSubAnchorFromRange(range, block, blockEl));
}

/** 从指针位置解析锚点（优先 caretRangeFromPoint 获取字符级精度） */
export function resolveAnchorFromPoint(
  clientX: number,
  clientY: number,
  blocks: DocBlock[],
): DocAnchor | null {
  let range: Range | null = null;
  if (typeof document.caretRangeFromPoint === 'function') {
    range = document.caretRangeFromPoint(clientX, clientY);
  } else {
    const pos = (document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    }).caretPositionFromPoint?.(clientX, clientY);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  }
  if (range) {
    const fromRange = resolveAnchorFromRange(range, blocks);
    if (fromRange) return fromRange;
  }
  const node = document.elementFromPoint(clientX, clientY);
  if (!node) return null;
  return resolveAnchorFromNode(node, blocks);
}

/** 根据 Y 坐标定位块索引（含块间距等不可直接命中的区域） */
export function resolveBlockIndexFromClientY(
  clientY: number,
  editorEl: HTMLElement,
): number {
  const rows = Array.from(editorEl.querySelectorAll('[data-block-row]')) as HTMLElement[];
  if (!rows.length) return -1;

  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      const idx = row.dataset.blockRow;
      return idx != null ? Number(idx) : -1;
    }
  }

  const firstRect = rows[0].getBoundingClientRect();
  if (clientY < firstRect.top) {
    return Number(rows[0].dataset.blockRow ?? 0);
  }

  const last = rows[rows.length - 1];
  const lastRect = last.getBoundingClientRect();
  if (clientY > lastRect.bottom) {
    return Number(last.dataset.blockRow ?? rows.length - 1);
  }

  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i].getBoundingClientRect();
    const b = rows[i + 1].getBoundingClientRect();
    if (clientY > a.bottom && clientY < b.top) {
      const pick = clientY < (a.bottom + b.top) / 2 ? rows[i] : rows[i + 1];
      return Number(pick.dataset.blockRow ?? i);
    }
  }

  return -1;
}

/** 根据点击 Y 坐标判断应聚焦到块首还是块尾 */
export function resolveClickCaretPosition(
  clientY: number,
  blockRowEl: HTMLElement | null,
): 'start' | 'end' {
  if (!blockRowEl) return 'start';
  const rect = blockRowEl.getBoundingClientRect();
  return clientY > rect.top + rect.height / 2 ? 'end' : 'start';
}
