import type { DocBlock, ListBlock } from './types';
import { createEmptyParagraph } from './utils';
import { isTextBlock } from './utils';
import {
  listItemToParagraphBlocks,
  normalizeBulletListItems,
  normalizeOrderedListItems,
  removeListItemAt,
} from './listOps';

export type ListBoundaryFocus = {
  blockIndex: number;
  position: 'start' | 'end' | number;
  listItemIndex?: number;
};

/** 最后一项空行 Enter，且后方已有其他块：退出列表并聚焦后方块（不插入重复段落） */
export function exitEmptyListItemToFollowingBlock(
  blocks: DocBlock[],
  listBlockIndex: number,
  itemIndex: number,
): { blocks: DocBlock[]; focus: ListBoundaryFocus } | null {
  const block = blocks[listBlockIndex];
  if (block.type !== 'list' || itemIndex !== block.items.length - 1) return null;
  if (listBlockIndex >= blocks.length - 1) return null;

  const next = [...blocks];
  if (block.items.length === 1) {
    next.splice(listBlockIndex, 1);
    return { blocks: next, focus: { blockIndex: listBlockIndex, position: 'start' } };
  }

  const removed = removeListItemAt(block, itemIndex);
  if (removed.kind !== 'list') return null;
  next[listBlockIndex] = removed.block;
  return { blocks: next, focus: { blockIndex: listBlockIndex + 1, position: 'start' } };
}

/** 空列表项 Enter：区分末项/中间项、后方是否有块 */
export function handleEmptyListItemEnter(
  blocks: DocBlock[],
  listBlockIndex: number,
  itemIndex: number,
): { blocks: DocBlock[]; focus: ListBoundaryFocus } {
  const block = blocks[listBlockIndex] as ListBlock;
  const isLastItem = itemIndex === block.items.length - 1;
  const hasFollowing = listBlockIndex < blocks.length - 1;

  if (isLastItem && hasFollowing) {
    const exited = exitEmptyListItemToFollowingBlock(blocks, listBlockIndex, itemIndex);
    if (exited) return exited;
  }

  if (isLastItem && !hasFollowing) {
    const next = [...blocks];
    if (block.items.length === 1) {
      next[listBlockIndex] = { ...createEmptyParagraph(), id: block.id };
      return { blocks: next, focus: { blockIndex: listBlockIndex, position: 'start' } };
    }
    const removed = removeListItemAt(block, itemIndex);
    if (removed.kind !== 'list') {
      next[listBlockIndex] = removed.block;
      return { blocks: next, focus: { blockIndex: listBlockIndex, position: 'start' } };
    }
    next[listBlockIndex] = removed.block;
    next.splice(listBlockIndex + 1, 0, createEmptyParagraph());
    return { blocks: next, focus: { blockIndex: listBlockIndex + 1, position: 'start' } };
  }

  const segments = listItemToParagraphBlocks(block, itemIndex);
  const next = [...blocks];
  next.splice(listBlockIndex, 1, ...segments);
  const paraOffset = segments.findIndex(b => b.type === 'paragraph');
  return {
    blocks: next,
    focus: { blockIndex: listBlockIndex + Math.max(0, paraOffset), position: 'start' },
  };
}

/** 空列表项 Backspace：末项且后方有块时退出列表，否则删除该项 */
export function handleEmptyListItemBackspace(
  blocks: DocBlock[],
  listBlockIndex: number,
  itemIndex: number,
): { blocks: DocBlock[]; focus: ListBoundaryFocus } {
  const block = blocks[listBlockIndex] as ListBlock;
  const isLastItem = itemIndex === block.items.length - 1;
  const hasFollowing = listBlockIndex < blocks.length - 1;

  if (isLastItem && hasFollowing) {
    const exited = exitEmptyListItemToFollowingBlock(blocks, listBlockIndex, itemIndex);
    if (exited) return exited;
  }

  const result = removeListItemAt(block, itemIndex);
  const next = [...blocks];
  if (result.kind === 'paragraph') {
    next[listBlockIndex] = result.block;
    return { blocks: next, focus: { blockIndex: listBlockIndex, position: 'start' } };
  }
  next[listBlockIndex] = result.block;
  const focusItem = Math.max(0, itemIndex - 1);
  return {
    blocks: next,
    focus: { blockIndex: listBlockIndex, position: 'end', listItemIndex: focusItem },
  };
}

/** 列表末项 Delete：合并后方文本块，或删除后方非文本块 */
export function mergeFollowingBlockIntoList(
  blocks: DocBlock[],
  listBlockIndex: number,
): { blocks: DocBlock[]; focus: ListBoundaryFocus } | null {
  if (listBlockIndex >= blocks.length - 1) return null;
  const listBlock = blocks[listBlockIndex];
  const following = blocks[listBlockIndex + 1];
  if (listBlock.type !== 'list') return null;

  const items = listBlock.items.map(it => ({ ...it, marks: [...(it.marks ?? [])] }));
  const lastIdx = items.length - 1;
  const lastItem = items[lastIdx];

  if (isTextBlock(following)) {
    const splitAt = lastItem.text.length;
    items[lastIdx] = { ...lastItem, text: lastItem.text + following.text };
    const normalized = listBlock.listType === 'ordered'
      ? normalizeOrderedListItems(items)
      : listBlock.listType === 'bullet'
        ? normalizeBulletListItems(items)
        : items;
    const next = [...blocks];
    next[listBlockIndex] = { ...listBlock, items: normalized };
    next.splice(listBlockIndex + 1, 1);
    return {
      blocks: next,
      focus: { blockIndex: listBlockIndex, position: splitAt, listItemIndex: lastIdx },
    };
  }

  const next = [...blocks];
  next.splice(listBlockIndex + 1, 1);
  return {
    blocks: next,
    focus: { blockIndex: listBlockIndex, position: 'end', listItemIndex: lastIdx },
  };
}

/** 文本块 Backspace 行首：合并进前方列表末项 */
export function mergeTextBlockIntoPrecedingList(
  blocks: DocBlock[],
  textBlockIndex: number,
): { blocks: DocBlock[]; focus: ListBoundaryFocus } | null {
  if (textBlockIndex <= 0) return null;
  const prev = blocks[textBlockIndex - 1];
  const curr = blocks[textBlockIndex];
  if (prev.type !== 'list' || !isTextBlock(curr)) return null;

  const items = prev.items.map(it => ({ ...it, marks: [...(it.marks ?? [])] }));
  const lastIdx = items.length - 1;
  const splitAt = items[lastIdx].text.length;
  items[lastIdx] = { ...items[lastIdx], text: items[lastIdx].text + curr.text };
  const normalized = prev.listType === 'ordered'
    ? normalizeOrderedListItems(items)
    : prev.listType === 'bullet'
      ? normalizeBulletListItems(items)
      : items;
  const next = [...blocks];
  next[textBlockIndex - 1] = { ...prev, items: normalized };
  next.splice(textBlockIndex, 1);
  return {
    blocks: next,
    focus: { blockIndex: textBlockIndex - 1, position: splitAt, listItemIndex: lastIdx },
  };
}

export function applyListBoundaryFocus(
  focus: ListBoundaryFocus,
  focusBlockAt: (
    index: number,
    position?: 'start' | 'end' | number,
    listItemIndex?: number,
  ) => void,
): void {
  const pos = typeof focus.position === 'number' ? focus.position : focus.position;
  focusBlockAt(focus.blockIndex, pos, focus.listItemIndex);
}
