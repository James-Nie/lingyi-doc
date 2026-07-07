import type { DocBlock, ListBlock, ListItem, TextMark } from './types';
import {
  extractContentFromEditable,
  isTextBlock,
  marksToHtml,
  normalizeMarks,
  toggleMark,
} from './utils';
import { findBlockIndexFromNode, findEditableRoot } from './selection';
import {
  findListItemEl,
  getListCaretContext,
  getListItemIndex,
  getListItemTextEl,
  getListTextEl,
  LIST_TEXT_ZWSP,
  setListItemCaret,
} from './listDom';
import type { DocAnchor } from './selectionModel';
import { blockAnchor, getSelectionBlockIndices, isCollapsedDocSelection, type DocSelection } from './selectionModel';
import { applyTextSelectionBetweenAnchors, createRangeForListBlock } from './selectionGeometry';

export type InlineFormatAction =
  | { type: 'bold' | 'italic' | 'underline' | 'strikethrough' }
  | { type: 'color' | 'background' | 'fontSize' | 'link'; value: string };

export interface TextSelectionSlice {
  blockIndex: number;
  start: number;
  end: number;
  listItemIndex?: number;
}

export interface NativeTextSelectionDetail {
  slices: TextSelectionSlice[];
  collapsed: boolean;
}

function getEditableEl(blockEl: HTMLElement): HTMLElement | null {
  if (blockEl.dataset.docEditable !== undefined) return blockEl;
  return blockEl.querySelector('[data-doc-editable]') as HTMLElement | null;
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

function pushTextBlockSlices(
  slices: TextSelectionSlice[],
  blocks: DocBlock[],
  blockEls: Map<string, HTMLElement>,
  range: Range,
  startBlockIdx: number,
  endBlockIdx: number,
): void {
  const lo = Math.min(startBlockIdx, endBlockIdx);
  const hi = Math.max(startBlockIdx, endBlockIdx);
  const forward = startBlockIdx <= endBlockIdx;

  for (let i = lo; i <= hi; i++) {
    const block = blocks[i];
    if (!block || !isTextBlock(block)) continue;
    const root = blockEls.get(block.id);
    const editable = root ? getEditableEl(root) : null;
    if (!editable) continue;

    let start = 0;
    let end = extractContentFromEditable(editable).text.length;

    if (lo === hi) {
      const sContainer = forward ? range.startContainer : range.endContainer;
      const sOffset = forward ? range.startOffset : range.endOffset;
      const eContainer = forward ? range.endContainer : range.startContainer;
      const eOffset = forward ? range.endOffset : range.startOffset;
      start = offsetInEditable(editable, sContainer, sOffset);
      end = offsetInEditable(editable, eContainer, eOffset);
    } else if (i === lo) {
      if (forward) {
        start = offsetInEditable(editable, range.startContainer, range.startOffset);
      } else {
        start = offsetInEditable(editable, range.endContainer, range.endOffset);
      }
    } else if (i === hi) {
      if (forward) {
        end = offsetInEditable(editable, range.endContainer, range.endOffset);
      } else {
        end = offsetInEditable(editable, range.startContainer, range.startOffset);
      }
    }

    const s = Math.min(start, end);
    const e = Math.max(start, end);
    if (s < e) slices.push({ blockIndex: i, start: s, end: e });
  }
}

function pushListSlices(
  slices: TextSelectionSlice[],
  blockIndex: number,
  block: ListBlock,
  listRoot: HTMLElement,
  ctx: NonNullable<ReturnType<typeof getListCaretContext>>,
): void {
  const itemLo = Math.min(ctx.anchorItemIndex, ctx.focusItemIndex);
  const itemHi = Math.max(ctx.anchorItemIndex, ctx.focusItemIndex);
  const forward = ctx.anchorItemIndex <= ctx.focusItemIndex;

  for (let i = itemLo; i <= itemHi; i++) {
    const item = block.items[i];
    if (!item) continue;
    let start = 0;
    let end = item.text.length;

    if (itemLo === itemHi) {
      start = forward ? ctx.anchorOffset : ctx.focusOffset;
      end = forward ? ctx.focusOffset : ctx.anchorOffset;
    } else if (i === itemLo) {
      start = forward ? ctx.anchorOffset : ctx.focusOffset;
    } else if (i === itemHi) {
      end = forward ? ctx.focusOffset : ctx.anchorOffset;
    }

    const s = Math.min(start, end);
    const e = Math.max(start, end);
    if (s < e) {
      slices.push({ blockIndex, listItemIndex: i, start: s, end: e });
    }
  }

  void listRoot;
}

function pushListBlockBoundarySlice(
  slices: TextSelectionSlice[],
  blockIndex: number,
  block: ListBlock,
  listRoot: HTMLElement,
  range: Range,
  edge: 'start' | 'end',
  forward: boolean,
): void {
  if (slices.some(s => s.blockIndex === blockIndex && s.listItemIndex != null)) return;

  const container = edge === 'start'
    ? (forward ? range.startContainer : range.endContainer)
    : (forward ? range.endContainer : range.startContainer);
  const nodeOffset = edge === 'start'
    ? (forward ? range.startOffset : range.endOffset)
    : (forward ? range.endOffset : range.startOffset);

  const li = findListItemEl(container, listRoot);
  if (!li) return;
  const textEl = getListTextEl(li);
  if (!textEl.contains(container) && textEl !== container) return;

  const itemIndex = getListItemIndex(li);
  const item = block.items[itemIndex];
  if (!item) return;

  const point = offsetInEditable(textEl, container, nodeOffset);
  if (edge === 'start') {
    if (point < item.text.length) {
      slices.push({ blockIndex, listItemIndex: itemIndex, start: point, end: item.text.length });
    }
  } else if (point > 0) {
    slices.push({ blockIndex, listItemIndex: itemIndex, start: 0, end: point });
  }
}

function mergeTextSelectionSlices(slices: TextSelectionSlice[]): TextSelectionSlice[] {
  const map = new Map<string, TextSelectionSlice>();
  for (const slice of slices) {
    const key = `${slice.blockIndex}:${slice.listItemIndex ?? -1}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...slice });
      continue;
    }
    prev.start = Math.min(prev.start, slice.start);
    prev.end = Math.max(prev.end, slice.end);
  }
  return [...map.values()];
}

/** 读取当前原生文本选区（段落/标题/引用/列表） */
export function getNativeTextSelectionDetail(
  blocks: DocBlock[],
  blockEls: Map<string, HTMLElement>,
): NativeTextSelectionDetail | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return { slices: [], collapsed: true };

  const startBlockIdx = findBlockIndexFromNode(range.startContainer);
  const endBlockIdx = findBlockIndexFromNode(range.endContainer);
  if (startBlockIdx < 0 || endBlockIdx < 0) return null;

  const slices: TextSelectionSlice[] = [];
  const lo = Math.min(startBlockIdx, endBlockIdx);
  const hi = Math.max(startBlockIdx, endBlockIdx);

  if (lo === hi) {
    const block = blocks[lo];
    const root = block ? blockEls.get(block.id) : null;
    if (block?.type === 'list' && root) {
      const ctx = getListCaretContext(root);
      if (ctx && !ctx.collapsed) {
        pushListSlices(slices, lo, block, root, ctx);
        return { slices: mergeTextSelectionSlices(slices), collapsed: false };
      }
    }
    pushTextBlockSlices(slices, blocks, blockEls, range, startBlockIdx, endBlockIdx);
    const merged = mergeTextSelectionSlices(slices);
    return { slices: merged, collapsed: merged.length === 0 };
  }

  pushTextBlockSlices(slices, blocks, blockEls, range, startBlockIdx, endBlockIdx);

  if (lo !== hi) {
    const forward = startBlockIdx <= endBlockIdx;
    const startBlock = blocks[startBlockIdx];
    const endBlock = blocks[endBlockIdx];
    if (startBlock?.type === 'list') {
      const root = blockEls.get(startBlock.id);
      if (root) pushListBlockBoundarySlice(slices, startBlockIdx, startBlock, root, range, 'start', forward);
    }
    if (endBlock?.type === 'list') {
      const root = blockEls.get(endBlock.id);
      if (root) pushListBlockBoundarySlice(slices, endBlockIdx, endBlock, root, range, 'end', forward);
    }
  }

  for (let i = lo; i <= hi; i++) {
    if (i === startBlockIdx || i === endBlockIdx) continue;
    const block = blocks[i];
    if (block?.type === 'list') {
      const root = blockEls.get(block.id);
      if (!root) continue;
      block.items.forEach((item, itemIndex) => {
        if (item.text.length > 0) {
          slices.push({ blockIndex: i, listItemIndex: itemIndex, start: 0, end: item.text.length });
        }
      });
    }
  }

  const merged = mergeTextSelectionSlices(slices);
  return { slices: merged, collapsed: merged.length === 0 };
}

function applyMarkToText(
  text: string,
  marks: TextMark[],
  start: number,
  end: number,
  action: InlineFormatAction,
): TextMark[] {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  if (lo >= hi && action.type !== 'color' && action.type !== 'background' && action.type !== 'fontSize') {
    return marks;
  }

  if (action.type === 'background' && action.value === 'transparent') {
    return normalizeMarks(
      marks.filter(m => !(m.type === 'background' && m.end > lo && m.start < hi)),
      text.length,
    );
  }

  if (action.type === 'color' || action.type === 'background' || action.type === 'fontSize' || action.type === 'link') {
    return toggleMark(marks, text.length, action.type, lo, hi, action.value);
  }

  return toggleMark(marks, text.length, action.type, lo, hi);
}

function applyToListItem(item: ListItem, start: number, end: number, action: InlineFormatAction): ListItem {
  return {
    ...item,
    marks: applyMarkToText(item.text, item.marks ?? [], start, end, action),
  };
}

/** 按 model marks 应用行内格式（不依赖 execCommand） */
export function applyInlineFormatToBlocks(
  blocks: DocBlock[],
  slices: TextSelectionSlice[],
  action: InlineFormatAction,
): DocBlock[] {
  const merged = mergeTextSelectionSlices(slices);
  if (!merged.length) return blocks;

  const next = [...blocks];
  for (const slice of merged) {
    const block = next[slice.blockIndex];
    if (!block) continue;

    if (isTextBlock(block)) {
      next[slice.blockIndex] = {
        ...block,
        marks: applyMarkToText(block.text, block.marks, slice.start, slice.end, action),
      };
      continue;
    }

    if (block.type === 'list' && slice.listItemIndex != null) {
      const items = block.items.map((it, i) =>
        i === slice.listItemIndex
          ? applyToListItem(it, slice.start, slice.end, action)
          : it,
      );
      next[slice.blockIndex] = { ...block, items };
    }
  }

  return next;
}

/** 格式应用前同步受影响块的 DOM，避免 restore 与 DocBlockView effect 竞态 */
export function syncFormattedBlocksDom(
  blocks: DocBlock[],
  slices: TextSelectionSlice[],
  blockEls: Map<string, HTMLElement>,
): void {
  const blockIndices = new Set(slices.map(s => s.blockIndex));
  for (const blockIndex of blockIndices) {
    const block = blocks[blockIndex];
    if (!block) continue;
    const root = blockEls.get(block.id);
    if (!root) continue;

    if (isTextBlock(block)) {
      const editable = getEditableEl(root) ?? root;
      const html = marksToHtml(block.text, block.marks);
      if (editable.innerHTML !== html) editable.innerHTML = html || '';
      continue;
    }

    if (block.type === 'list') {
      block.items.forEach((item, itemIndex) => {
        const textEl = getListItemTextEl(root, itemIndex);
        if (!textEl) return;
        if (item.text || (item.marks?.length ?? 0) > 0) {
          const html = marksToHtml(item.text, item.marks ?? []);
          if (textEl.innerHTML !== html) textEl.innerHTML = html;
        } else if (!textEl.textContent) {
          textEl.textContent = LIST_TEXT_ZWSP;
        }
      });
    }
  }
}

function listFlatOffset(block: ListBlock, itemIndex: number, offset: number): number {
  let flat = 0;
  for (let i = 0; i < itemIndex && i < block.items.length; i++) {
    flat += block.items[i].text.length + 1;
  }
  const len = block.items[itemIndex]?.text.length ?? 0;
  return flat + Math.min(offset, len);
}

export function restoreNativeTextSelection(
  blocks: DocBlock[],
  slices: TextSelectionSlice[],
  blockEls: Map<string, HTMLElement>,
): boolean {
  if (!slices.length) return false;
  const first = slices[0];
  const last = slices[slices.length - 1];

  if (first.listItemIndex != null || last.listItemIndex != null) {
    const block = blocks[first.blockIndex];
    const el = block ? blockEls.get(block.id) : null;
    if (!block || block.type !== 'list' || !el) return false;
    try {
      const startFlat = listFlatOffset(block, first.listItemIndex ?? 0, first.start);
      const endFlat = listFlatOffset(
        block,
        last.listItemIndex ?? first.listItemIndex ?? 0,
        last.end,
      );
      const range = createRangeForListBlock(el, block, Math.min(startFlat, endFlat), Math.max(startFlat, endFlat));
      if (!range) return false;
      el.focus();
      const sel = window.getSelection();
      if (!sel) return false;
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    } catch {
      el.focus();
      setListItemCaret(el, last.listItemIndex ?? first.listItemIndex ?? 0, last.end);
      return true;
    }
  }

  const anchor = blockAnchor(first.blockIndex, { kind: 'text', offset: first.start });
  const focus = blockAnchor(last.blockIndex, { kind: 'text', offset: last.end });
  return applyTextSelectionBetweenAnchors(anchor, focus, blocks, blockEls);
}

export function selectionSlicesToAnchors(
  slices: TextSelectionSlice[],
): { anchor: DocAnchor; focus: DocAnchor } | null {
  if (!slices.length) return null;
  const first = slices[0];
  const last = slices[slices.length - 1];
  if (first.listItemIndex != null) {
    return {
      anchor: blockAnchor(first.blockIndex, {
        kind: 'list',
        itemIndex: first.listItemIndex,
        offset: first.start,
      }),
      focus: blockAnchor(last.blockIndex, {
        kind: 'list',
        itemIndex: last.listItemIndex ?? first.listItemIndex,
        offset: last.end,
      }),
    };
  }
  return {
    anchor: blockAnchor(first.blockIndex, { kind: 'text', offset: first.start }),
    focus: blockAnchor(last.blockIndex, { kind: 'text', offset: last.end }),
  };
}

/** 从原生文本选区提取 plain（保留块内 \\n 软换行，跨块以 \\n 连接） */
export function extractNativeSelectionPlainText(
  blocks: DocBlock[],
  blockEls: Map<string, HTMLElement>,
  savedDetail?: NativeTextSelectionDetail | null,
): string {
  let detail = getNativeTextSelectionDetail(blocks, blockEls);
  if ((!detail || detail.collapsed || !detail.slices.length) && savedDetail) {
    detail = savedDetail;
  }
  if (!detail || detail.collapsed || !detail.slices.length) return '';

  const parts: string[] = [];
  for (const slice of detail.slices) {
    const block = blocks[slice.blockIndex];
    if (!block) continue;
    if (slice.listItemIndex != null && block.type === 'list') {
      const item = block.items[slice.listItemIndex];
      if (item) parts.push(item.text.slice(slice.start, slice.end));
    } else if (isTextBlock(block)) {
      parts.push(block.text.slice(slice.start, slice.end));
    }
  }
  return parts.join('\n');
}

/** 解析当前应参与删除/粘贴的文档选区（块级选区或跨段原生文本选区） */
export function resolveEditableDocSelection(
  blocks: DocBlock[],
  blockEls: Map<string, HTMLElement>,
  docSelection: DocSelection | null,
  savedDetail?: NativeTextSelectionDetail | null,
): DocSelection | null {
  if (docSelection && !isCollapsedDocSelection(docSelection)) {
    return docSelection;
  }

  let detail = getNativeTextSelectionDetail(blocks, blockEls);
  if ((!detail || detail.collapsed || !detail.slices.length) && savedDetail && !savedDetail.collapsed && savedDetail.slices.length) {
    detail = savedDetail;
  }
  if (!detail || detail.collapsed || !detail.slices.length) return null;

  const anchors = selectionSlicesToAnchors(detail.slices);
  if (!anchors) return null;
  return { anchor: anchors.anchor, focus: anchors.focus };
}

/** 是否为跨多个块的可编辑选区 */
export function isCrossBlockEditableSelection(
  blocks: DocBlock[],
  blockEls: Map<string, HTMLElement>,
  docSelection: DocSelection | null,
  savedDetail?: NativeTextSelectionDetail | null,
): boolean {
  const sel = resolveEditableDocSelection(blocks, blockEls, docSelection, savedDetail);
  if (!sel) return false;
  const indices = getSelectionBlockIndices(sel, blocks);
  return (indices?.length ?? 0) > 1;
}
