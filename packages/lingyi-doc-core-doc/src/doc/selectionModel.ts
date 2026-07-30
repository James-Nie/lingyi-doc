import type { DocBlock } from './types';
import type { DocSelectionContext } from './selection';
import { isTextBlock } from './utils';

export type BlockSubAnchor =
  | { kind: 'text'; offset: number }
  | { kind: 'list'; itemIndex: number; offset: number }
  | { kind: 'whole' };

export type DocAnchor =
  | { kind: 'title'; offset: number }
  | { kind: 'block'; blockIndex: number; sub: BlockSubAnchor };

export type DocSelection = {
  anchor: DocAnchor;
  focus: DocAnchor;
};

export type BlockSelectionState = 'none' | 'full' | 'partial';

export const DOC_SELECTION_BG = 'rgba(22, 93, 255, 0.08)';

export function blockAnchor(blockIndex: number, sub: BlockSubAnchor = { kind: 'whole' }): DocAnchor {
  return { kind: 'block', blockIndex, sub };
}

export function isSameAnchor(a: DocAnchor, b: DocAnchor): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'title' && b.kind === 'title') return a.offset === b.offset;
  if (a.kind !== 'block' || b.kind !== 'block') return false;
  if (a.blockIndex !== b.blockIndex) return false;
  if (a.sub.kind !== b.sub.kind) return false;
  if (a.sub.kind === 'whole' && b.sub.kind === 'whole') return true;
  if (a.sub.kind === 'text' && b.sub.kind === 'text') return a.sub.offset === b.sub.offset;
  if (a.sub.kind === 'list' && b.sub.kind === 'list') {
    return a.sub.itemIndex === b.sub.itemIndex && a.sub.offset === b.sub.offset;
  }
  return false;
}

export function isCollapsedDocSelection(sel: DocSelection | null): boolean {
  if (!sel) return true;
  return isSameAnchor(sel.anchor, sel.focus);
}

/** 判断是否为块级选择（选择整个块，而非文本级选择） */
export function isWholeBlockSelection(sel: DocSelection | null): boolean {
  if (!sel) return false;
  if (sel.anchor.kind !== 'block' || sel.focus.kind !== 'block') return false;
  return sel.anchor.sub.kind === 'whole' && sel.focus.sub.kind === 'whole';
}

/** 将 anchor 映射为文档内有序位置（用于比较起止） */
export function anchorToComparable(anchor: DocAnchor, blocks: DocBlock[]): number {
  if (anchor.kind === 'title') return -1 + anchor.offset * 1e-6;
  const block = blocks[anchor.blockIndex];
  if (!block) return anchor.blockIndex * 1e9;
  const base = (anchor.blockIndex + 1) * 1e6;
  const sub = anchor.sub;
  if (sub.kind === 'whole') return base;
  if (sub.kind === 'text') {
    const len = isTextBlock(block) ? block.text.length : 0;
    return base + Math.min(sub.offset, len);
  }
  if (sub.kind === 'list' && block.type === 'list') {
    let offset = 0;
    for (let i = 0; i < sub.itemIndex && i < block.items.length; i++) {
      offset += block.items[i].text.length + 1;
    }
    const itemLen = block.items[sub.itemIndex]?.text.length ?? 0;
    return base + offset + Math.min(sub.offset, itemLen);
  }
  return base;
}

export function normalizeDocSelection(
  sel: DocSelection,
  blocks: DocBlock[],
): { start: DocAnchor; end: DocAnchor; reversed: boolean } {
  const aScore = anchorToComparable(sel.anchor, blocks);
  const bScore = anchorToComparable(sel.focus, blocks);
  if (aScore <= bScore) return { start: sel.anchor, end: sel.focus, reversed: false };
  return { start: sel.focus, end: sel.anchor, reversed: true };
}

export function getSelectionBlockIndices(
  sel: DocSelection | null,
  blocks: DocBlock[],
): number[] | null {
  if (!sel || isCollapsedDocSelection(sel)) return null;
  const { start, end } = normalizeDocSelection(sel, blocks);
  const startIdx = start.kind === 'block' ? start.blockIndex : 0;
  const endIdx = end.kind === 'block' ? end.blockIndex : Math.max(0, blocks.length - 1);
  const min = Math.min(startIdx, endIdx);
  const max = Math.max(startIdx, endIdx);
  const indices: number[] = [];
  for (let i = min; i <= max; i++) indices.push(i);
  return indices;
}

export function isMultiBlockDocSelection(sel: DocSelection | null, blocks: DocBlock[]): boolean {
  const indices = getSelectionBlockIndices(sel, blocks);
  if (!indices) return false;
  return indices.length > 1;
}

export function getBlockSelectionState(
  sel: DocSelection | null,
  blockIndex: number,
  blocks: DocBlock[],
): BlockSelectionState {
  if (!sel || isCollapsedDocSelection(sel)) return 'none';

  const { start, end } = normalizeDocSelection(sel, blocks);
  const startIdx = start.kind === 'block' ? start.blockIndex : -1;
  const endIdx = end.kind === 'block' ? end.blockIndex : blocks.length;

  if (blockIndex < startIdx || blockIndex > endIdx) return 'none';
  if (blockIndex > startIdx && blockIndex < endIdx) return 'full';

  const isStart = start.kind === 'block' && start.blockIndex === blockIndex;
  const isEnd = end.kind === 'block' && end.blockIndex === blockIndex;
  const startPartial = isStart && start.sub.kind !== 'whole';
  const endPartial = isEnd && end.sub.kind !== 'whole';

  if (startIdx === endIdx && (startPartial || endPartial)) return 'partial';
  if (isStart && startPartial) return 'partial';
  if (isEnd && endPartial) return 'partial';
  return 'full';
}

export function selectBlockRange(anchorIdx: number, focusIdx: number): DocSelection {
  const a = Math.min(anchorIdx, focusIdx);
  const f = Math.max(anchorIdx, focusIdx);
  return {
    anchor: blockAnchor(a),
    focus: blockAnchor(f),
  };
}

export function selectAllDocumentBlocks(blockCount: number): DocSelection {
  if (blockCount <= 0) return { anchor: blockAnchor(0), focus: blockAnchor(0) };
  return selectBlockRange(0, blockCount - 1);
}

export function docSelectionToContext(sel: DocSelection, blocks: DocBlock[]): DocSelectionContext {
  const indices = getSelectionBlockIndices(sel, blocks) ?? [0];
  const start = indices[0];
  const end = indices[indices.length - 1];
  return {
    startBlock: start,
    endBlock: end,
    isMultiBlock: indices.length > 1,
    hasTextSelection: true,
    collapsed: false,
  };
}
