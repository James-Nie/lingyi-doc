import type { DocBlock, ListBlock } from './types';
import { isTextBlock } from './utils';
import { getListItemTextEl } from './listDom';
import type { BlockSubAnchor, DocAnchor, DocSelection } from './selectionModel';
import { getBlockSelectionState, normalizeDocSelection } from './selectionModel';

function applyNativeRange(range: Range, focusEl?: HTMLElement): boolean {
  try {
    focusEl?.focus();
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  } catch {
    return false;
  }
}

/** 在 contentEditable 内按字符偏移取 Range 端点 */
export function getRangePointAtOffset(el: HTMLElement, offset: number): [Node, number] {
  if (offset <= 0) {
    if (el.firstChild) return [el, 0];
    return [el, 0];
  }

  let remaining = offset;

  const walk = (node: Node): [Node, number] | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const raw = node.textContent ?? '';
      const len = raw.replace(/\u00a0/g, ' ').replace(/\u200B/g, '').length;
      if (remaining <= len) return [node, remaining];
      remaining -= len;
      return null;
    }
    if (node.nodeName === 'BR') {
      if (remaining <= 0) return [node, 0];
      if (remaining <= 1) return [node, node.textContent ? 1 : 0];
      remaining -= 1;
      return null;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      for (const child of Array.from(node.childNodes)) {
        const hit = walk(child);
        if (hit) return hit;
      }
    }
    return null;
  };

  for (const child of Array.from(el.childNodes)) {
    const hit = walk(child);
    if (hit) return hit;
  }

  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  return [range.endContainer, range.endOffset];
}

export function createRangeAtOffset(el: HTMLElement, offset: number): Range {
  const range = document.createRange();
  const [node, off] = getRangePointAtOffset(el, offset);
  range.setStart(node, off);
  range.collapse(true);
  return range;
}

export function createRangeBetweenOffsets(el: HTMLElement, start: number, end: number): Range {
  const range = document.createRange();
  const [sNode, sOff] = getRangePointAtOffset(el, start);
  const [eNode, eOff] = getRangePointAtOffset(el, end);
  range.setStart(sNode, sOff);
  range.setEnd(eNode, eOff);
  return range;
}

function subAnchorOffsets(
  block: DocBlock,
  sub: BlockSubAnchor,
): { start: number; end: number } {
  if (sub.kind === 'whole') {
    if (isTextBlock(block)) return { start: 0, end: block.text.length };
    if (block.type === 'list') {
      const end = block.items.reduce((acc, it) => acc + it.text.length + 1, 0);
      return { start: 0, end: Math.max(0, end - 1) };
    }
    return { start: 0, end: 0 };
  }
  if (sub.kind === 'text' && isTextBlock(block)) {
    const o = Math.max(0, Math.min(sub.offset, block.text.length));
    return { start: o, end: o };
  }
  if (sub.kind === 'list' && block.type === 'list') {
    const flat = listFlatOffset(block, sub.itemIndex, sub.offset);
    return { start: flat, end: flat };
  }
  return { start: 0, end: 0 };
}

function listFlatOffset(block: ListBlock, itemIndex: number, offset: number): number {
  let flat = 0;
  for (let i = 0; i < itemIndex && i < block.items.length; i++) {
    flat += block.items[i].text.length + 1;
  }
  const itemLen = block.items[itemIndex]?.text.length ?? 0;
  return flat + Math.min(offset, itemLen);
}

function listFlatToItemOffset(block: ListBlock, flat: number): { itemIndex: number; offset: number } {
  let remaining = flat;
  for (let i = 0; i < block.items.length; i++) {
    const len = block.items[i].text.length;
    if (remaining <= len) return { itemIndex: i, offset: remaining };
    remaining -= len + 1;
  }
  const last = Math.max(0, block.items.length - 1);
  return { itemIndex: last, offset: block.items[last]?.text.length ?? 0 };
}

export function createRangeForListBlock(
  listRoot: HTMLElement,
  block: ListBlock,
  startFlat: number,
  endFlat: number,
): Range | null {
  if (!block.items.length) return null;
  const s = listFlatToItemOffset(block, startFlat);
  const e = listFlatToItemOffset(block, endFlat);
  const startEl = getListItemTextEl(listRoot, s.itemIndex);
  const endEl = getListItemTextEl(listRoot, e.itemIndex);
  if (!startEl || !endEl) return null;
  const range = document.createRange();
  const [sNode, sOff] = getRangePointAtOffset(startEl, s.offset);
  const [eNode, eOff] = getRangePointAtOffset(endEl, e.offset);
  range.setStart(sNode, sOff);
  range.setEnd(eNode, eOff);
  return range;
}

export function createRangeForBlockAnchor(
  blockEl: HTMLElement,
  block: DocBlock,
  anchor: DocAnchor,
): Range | null {
  if (anchor.kind !== 'block' || anchor.blockIndex < 0) return null;
  const sub = anchor.sub;

  if (isTextBlock(block)) {
    const { start } = subAnchorOffsets(block, sub);
    return createRangeAtOffset(blockEl, start);
  }

  if (block.type === 'list') {
    const { start } = subAnchorOffsets(block, sub);
    if (sub.kind === 'whole') {
      const range = document.createRange();
      range.selectNodeContents(blockEl);
      return range;
    }
    return createRangeForListBlock(blockEl, block, start, start);
  }

  const range = document.createRange();
  range.selectNodeContents(blockEl);
  return range;
}

export function createRangeForBlockSelection(
  blockEl: HTMLElement,
  block: DocBlock,
  blockIndex: number,
  sel: DocSelection,
  allBlocks: DocBlock[],
): Range | null {
  const { start, end } = normalizeDocSelection(sel, allBlocks);
  const state = getBlockSelectionState(sel, blockIndex, allBlocks);
  if (state === 'none') return null;

  if (state === 'full') {
    const range = document.createRange();
    range.selectNodeContents(blockEl);
    return range;
  }

  const startSub = start.kind === 'block' && start.blockIndex === blockIndex ? start.sub : { kind: 'whole' as const };
  const endSub = end.kind === 'block' && end.blockIndex === blockIndex ? end.sub : { kind: 'whole' as const };

  if (isTextBlock(block)) {
    const s = subAnchorOffsets(block, startSub).start;
    const e = subAnchorOffsets(block, endSub).end;
    const lo = Math.min(s, e);
    const hi = Math.max(s, e);
    return createRangeBetweenOffsets(blockEl, lo, hi);
  }

  if (block.type === 'list') {
    const s = subAnchorOffsets(block, startSub).start;
    const e = subAnchorOffsets(block, endSub).end;
    return createRangeForListBlock(blockEl, block, Math.min(s, e), Math.max(s, e));
  }

  const range = document.createRange();
  range.selectNodeContents(blockEl);
  return range;
}

export function getRangeClientRects(range: Range): DOMRect[] {
  const rects: DOMRect[] = [];
  for (const r of Array.from(range.getClientRects())) {
    if (r.width > 0 || r.height > 0) rects.push(r);
  }
  return rects;
}

export function collectDocSelectionRects(
  sel: DocSelection,
  blocks: DocBlock[],
  blockEls: Map<string, HTMLElement>,
  containerEl: HTMLElement,
): DOMRect[] {
  const indices = (() => {
    const { start, end } = normalizeDocSelection(sel, blocks);
    const s = start.kind === 'block' ? start.blockIndex : 0;
    const e = end.kind === 'block' ? end.blockIndex : blocks.length - 1;
    const out: number[] = [];
    for (let i = Math.min(s, e); i <= Math.max(s, e); i++) out.push(i);
    return out;
  })();

  const containerRect = containerEl.getBoundingClientRect();
  const scrollTop = containerEl.scrollTop;
  const scrollLeft = containerEl.scrollLeft;
  const rects: DOMRect[] = [];

  for (const idx of indices) {
    const block = blocks[idx];
    if (!block) continue;
    const el = blockEls.get(block.id);
    if (!el) continue;
    const range = createRangeForBlockSelection(el, block, idx, sel, blocks);
    if (!range) continue;
    for (const r of getRangeClientRects(range)) {
      rects.push(new DOMRect(
        r.left - containerRect.left + scrollLeft,
        r.top - containerRect.top + scrollTop,
        r.width,
        r.height,
      ));
    }
  }

  return rects;
}

function textOffsetFromSub(block: DocBlock, sub: BlockSubAnchor, edge: 'start' | 'end'): number {
  if (!isTextBlock(block)) return 0;
  if (sub.kind === 'text') return Math.max(0, Math.min(sub.offset, block.text.length));
  return edge === 'start' ? 0 : block.text.length;
}

function listOffsetFromSub(block: ListBlock, sub: BlockSubAnchor, edge: 'start' | 'end'): number {
  if (sub.kind === 'list') return listFlatOffset(block, sub.itemIndex, sub.offset);
  if (sub.kind === 'whole') {
    if (edge === 'start') return 0;
    let flat = 0;
    for (const it of block.items) flat += it.text.length + 1;
    return Math.max(0, flat - 1);
  }
  return 0;
}

/** 按锚点设置正文文本选区（同块软换行 / 跨块 / 列表项） */
export function applyTextSelectionBetweenAnchors(
  anchor: DocAnchor,
  focus: DocAnchor,
  blocks: DocBlock[],
  blockEls: Map<string, HTMLElement>,
): boolean {
  if (anchor.kind !== 'block' || focus.kind !== 'block') return false;

  const { start, end } = normalizeDocSelection({ anchor, focus }, blocks);
  if (start.kind !== 'block' || end.kind !== 'block') return false;

  const startBlock = blocks[start.blockIndex];
  const endBlock = blocks[end.blockIndex];
  if (!startBlock || !endBlock) return false;

  const startEl = blockEls.get(startBlock.id);
  const endEl = blockEls.get(endBlock.id);
  if (!startEl || !endEl) return false;

  if (startBlock.type === 'list' && endBlock.type === 'list') {
    const startFlat = listOffsetFromSub(startBlock, start.sub, 'start');
    const endFlat = listOffsetFromSub(endBlock, end.sub, 'end');
    if (start.blockIndex === end.blockIndex && startFlat === endFlat) return false;
    const range = createRangeForListBlock(
      startEl,
      startBlock,
      Math.min(startFlat, endFlat),
      Math.max(startFlat, endFlat),
    );
    if (!range) return false;
    return applyNativeRange(range, startEl);
  }

  if (isTextBlock(startBlock) && isTextBlock(endBlock)) {
    const startOff = textOffsetFromSub(startBlock, start.sub, 'start');
    const endOff = textOffsetFromSub(endBlock, end.sub, 'end');
    if (start.blockIndex === end.blockIndex && startOff === endOff) return false;

    try {
      const loStart = start.blockIndex === end.blockIndex
        ? Math.min(startOff, endOff)
        : startOff;
      const hiEnd = start.blockIndex === end.blockIndex
        ? Math.max(startOff, endOff)
        : endOff;
      const range = start.blockIndex === end.blockIndex
        ? createRangeBetweenOffsets(startEl, loStart, hiEnd)
        : (() => {
            const r = document.createRange();
            const [sNode, sOff] = getRangePointAtOffset(startEl, startOff);
            const [eNode, eOff] = getRangePointAtOffset(endEl, endOff);
            r.setStart(sNode, sOff);
            r.setEnd(eNode, eOff);
            return r;
          })();
      return applyNativeRange(range, startEl);
    } catch {
      return false;
    }
  }

  if (isTextBlock(startBlock) && endBlock.type === 'list') {
    const startOff = textOffsetFromSub(startBlock, start.sub, 'start');
    const endFlat = listOffsetFromSub(endBlock, end.sub, 'end');
    const endPos = listFlatToItemOffset(endBlock, endFlat);
    const endItemEl = getListItemTextEl(endEl, endPos.itemIndex);
    if (!endItemEl) return false;
    try {
      const r = document.createRange();
      const [sNode, sOff] = getRangePointAtOffset(startEl, startOff);
      const [eNode, eOff] = getRangePointAtOffset(endItemEl, endPos.offset);
      r.setStart(sNode, sOff);
      r.setEnd(eNode, eOff);
      return applyNativeRange(r, startEl);
    } catch {
      return false;
    }
  }

  if (startBlock.type === 'list' && isTextBlock(endBlock)) {
    const startFlat = listOffsetFromSub(startBlock, start.sub, 'start');
    const startPos = listFlatToItemOffset(startBlock, startFlat);
    const startItemEl = getListItemTextEl(startEl, startPos.itemIndex);
    if (!startItemEl) return false;
    const endOff = textOffsetFromSub(endBlock, end.sub, 'end');
    try {
      const r = document.createRange();
      const [sNode, sOff] = getRangePointAtOffset(startItemEl, startPos.offset);
      const [eNode, eOff] = getRangePointAtOffset(endEl, endOff);
      r.setStart(sNode, sOff);
      r.setEnd(eNode, eOff);
      return applyNativeRange(r, startEl);
    } catch {
      return false;
    }
  }

  return false;
}
