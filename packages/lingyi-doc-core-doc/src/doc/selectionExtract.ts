import type { DocBlock, ListBlock, ListItem, TextMark } from './types';
import { cloneDocBlock, isTextBlock, splitMarks, normalizeMarks, genBlockId } from './utils';
import { insertTextWithMarks } from './pasteContext';
import type { BlockSubAnchor, DocAnchor, DocSelection } from './selectionModel';
import { getSelectionBlockIndices, isCollapsedDocSelection, normalizeDocSelection } from './selectionModel';

export type ExtractedSelection = {
  plainText: string;
  blocks: DocBlock[];
};

function subToTextOffset(block: DocBlock, sub: BlockSubAnchor): number {
  if (sub.kind === 'text' && isTextBlock(block)) {
    return Math.max(0, Math.min(sub.offset, block.text.length));
  }
  if (sub.kind === 'list' && block.type === 'list') {
    let flat = 0;
    for (let i = 0; i < sub.itemIndex && i < block.items.length; i++) {
      flat += block.items[i].text.length + 1;
    }
    const len = block.items[sub.itemIndex]?.text.length ?? 0;
    return flat + Math.min(sub.offset, len);
  }
  if (sub.kind === 'whole') {
    if (isTextBlock(block)) return block.text.length;
    if (block.type === 'list') {
      return block.items.reduce((acc, it, i) => acc + it.text.length + (i < block.items.length - 1 ? 1 : 0), 0);
    }
    return 0;
  }
  return 0;
}

function sliceTextBlock(
  block: DocBlock & { text: string; marks: TextMark[] },
  start: number,
  end: number,
): DocBlock & { text: string; marks: TextMark[] } {
  const lo = Math.max(0, Math.min(start, end));
  const hi = Math.min(block.text.length, Math.max(start, end));
  const text = block.text.slice(lo, hi);
  const marks = block.marks
    .filter(m => m.end > lo && m.start < hi)
    .map(m => ({
      ...m,
      start: Math.max(0, m.start - lo),
      end: Math.min(text.length, m.end - lo),
    }));
  return { ...block, text, marks: normalizeMarks(marks, text.length) };
}

function sliceListBlock(block: ListBlock, startFlat: number, endFlat: number): ListBlock {
  const lo = Math.min(startFlat, endFlat);
  const hi = Math.max(startFlat, endFlat);

  const toItem = (flat: number) => {
    let rem = flat;
    for (let i = 0; i < block.items.length; i++) {
      const len = block.items[i].text.length;
      if (rem <= len) return { itemIndex: i, offset: rem };
      rem -= len + 1;
    }
    const last = Math.max(0, block.items.length - 1);
    return { itemIndex: last, offset: block.items[last]?.text.length ?? 0 };
  };

  const s = toItem(lo);
  const e = toItem(hi);
  const items = block.items.map(it => ({ ...it, marks: [...(it.marks ?? [])] }));

  if (s.itemIndex === e.itemIndex) {
    const item = items[s.itemIndex];
    const sliced = sliceTextBlock(
      { ...block, type: 'paragraph', id: block.id, text: item.text, marks: item.marks ?? [] },
      s.offset,
      e.offset,
    );
    return { ...block, items: [{ ...item, text: sliced.text, marks: sliced.marks }] };
  }

  const result: ListItem[] = [];
  const head = items[s.itemIndex];
  if (s.offset < head.text.length) {
    const sliced = sliceTextBlock(
      { ...block, type: 'paragraph', id: block.id, text: head.text, marks: head.marks ?? [] },
      s.offset,
      head.text.length,
    );
    result.push({ ...head, text: sliced.text, marks: sliced.marks });
  }
  for (let i = s.itemIndex + 1; i < e.itemIndex; i++) {
    result.push({ ...items[i] });
  }
  const tail = items[e.itemIndex];
  if (e.offset > 0) {
    const sliced = sliceTextBlock(
      { ...block, type: 'paragraph', id: block.id, text: tail.text, marks: tail.marks ?? [] },
      0,
      e.offset,
    );
    result.push({ ...tail, text: sliced.text, marks: sliced.marks });
  }
  return { ...block, items: result.length ? result : [{ text: '', level: 1, marks: [] }] };
}

function flatTextLength(block: DocBlock): number {
  if (isTextBlock(block)) return block.text.length;
  if (block.type === 'list') {
    return block.items.reduce((acc, it, i) => acc + it.text.length + (i < block.items.length - 1 ? 1 : 0), 0);
  }
  if (block.type === 'code' || block.type === 'mermaid') return block.text.length;
  return 0;
}

/** whole 锚点表示整块：起点为 0，终点为块文本长度 */
function resolveSliceOffsets(
  block: DocBlock,
  startSub: BlockSubAnchor,
  endSub: BlockSubAnchor,
  role: 'only' | 'first' | 'middle' | 'last',
): { start: number; end: number } {
  const len = flatTextLength(block);
  if (role === 'middle') return { start: 0, end: len };
  if (role === 'first') {
    const start = startSub.kind === 'whole' ? 0 : subToTextOffset(block, startSub);
    return { start, end: len };
  }
  if (role === 'last') {
    const end = endSub.kind === 'whole' ? len : subToTextOffset(block, endSub);
    return { start: 0, end };
  }
  const start = startSub.kind === 'whole' ? 0 : subToTextOffset(block, startSub);
  const end = endSub.kind === 'whole' ? len : subToTextOffset(block, endSub);
  return { start, end };
}

function extractBlockSlice(
  block: DocBlock,
  startSub: BlockSubAnchor,
  endSub: BlockSubAnchor,
  role: 'only' | 'first' | 'middle' | 'last',
): DocBlock | null {
  if (role === 'middle') return cloneDocBlock(block);

  if (isTextBlock(block)) {
    const { start, end } = resolveSliceOffsets(block, startSub, endSub, role);
    if (role === 'only' && startSub.kind === 'whole' && endSub.kind === 'whole') {
      return cloneDocBlock(block);
    }
    const sliced = sliceTextBlock(block, start, end);
    if (!sliced.text) return null;
    return sliced;
  }

  if (block.type === 'list') {
    const { start, end } = resolveSliceOffsets(block, startSub, endSub, role);
    if (role === 'only' && startSub.kind === 'whole' && endSub.kind === 'whole') {
      return cloneDocBlock(block);
    }
    const sliced = sliceListBlock(block, start, end);
    if (!sliced.items.some(it => it.text)) return null;
    return sliced;
  }

  if (block.type === 'image') {
    return { ...block, id: genBlockId() };
  }

  if (block.type === 'code' || block.type === 'mermaid') {
    const text = block.text;
    const { start, end } = resolveSliceOffsets(block, startSub, endSub, role);
    if (role === 'only' && startSub.kind === 'whole' && endSub.kind === 'whole') {
      return cloneDocBlock(block);
    }
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    if (role === 'only') {
      return { ...block, id: genBlockId(), text: text.slice(lo, hi) };
    }
    if (role === 'first') return { ...block, id: genBlockId(), text: text.slice(lo) };
    if (role === 'last') return { ...block, id: genBlockId(), text: text.slice(0, hi) };
    return cloneDocBlock(block);
  }

  if (block.type === 'divider') {
    return role === 'only' ? { ...block, id: genBlockId() } : null;
  }

  return cloneDocBlock(block);
}

function blockToPlainText(block: DocBlock): string {
  if (isTextBlock(block)) return block.text;
  if (block.type === 'list') return block.items.map(it => it.text).join('\n');
  if (block.type === 'code' || block.type === 'mermaid') return block.text;
  if (block.type === 'image') return block.caption ?? '';
  if (block.type === 'divider') return '---';
  return '';
}

export function extractDocSelection(blocks: DocBlock[], sel: DocSelection): ExtractedSelection {
  if (isCollapsedDocSelection(sel)) {
    return { plainText: '', blocks: [] };
  }

  const { start, end } = normalizeDocSelection(sel, blocks);
  const indices = getSelectionBlockIndices(sel, blocks) ?? [];
  const extracted: DocBlock[] = [];

  indices.forEach((idx, i) => {
    const block = blocks[idx];
    if (!block) return;
    const role = indices.length === 1 ? 'only' : i === 0 ? 'first' : i === indices.length - 1 ? 'last' : 'middle';
    const startSub = start.kind === 'block' && start.blockIndex === idx ? start.sub : { kind: 'whole' as const };
    const endSub = end.kind === 'block' && end.blockIndex === idx ? end.sub : { kind: 'whole' as const };
    const slice = extractBlockSlice(block, startSub, endSub, role);
    if (slice) extracted.push(slice);
  });

  const plainText = extracted.map(blockToPlainText).filter(Boolean).join('\n');
  return { plainText, blocks: extracted };
}

function trimMarks(marks: TextMark[], len: number): TextMark[] {
  return normalizeMarks(
    marks.filter(m => m.start < len && m.end > 0).map(m => ({
      ...m,
      start: Math.max(0, m.start),
      end: Math.min(len, m.end),
    })),
    len,
  );
}

function deleteTextSlice(
  block: DocBlock & { text: string; marks: TextMark[] },
  delStart: number,
  delEnd: number,
): { text: string; marks: TextMark[] } {
  const lo = Math.max(0, Math.min(delStart, delEnd));
  const hi = Math.min(block.text.length, Math.max(delStart, delEnd));
  const removedLen = hi - lo;
  const text = block.text.slice(0, lo) + block.text.slice(hi);
  const marks = block.marks
    .filter(m => m.end <= lo || m.start >= hi)
    .map(m => (m.start >= hi
      ? { ...m, start: m.start - removedLen, end: m.end - removedLen }
      : { ...m, end: Math.min(m.end, lo), start: Math.min(m.start, lo) }
    ));
  return { text, marks: trimMarks(marks, text.length) };
}

function deleteListSlice(block: ListBlock, startFlat: number, endFlat: number): ListBlock {
  const lo = Math.min(startFlat, endFlat);
  const hi = Math.max(startFlat, endFlat);
  const toItem = (flat: number) => {
    let rem = flat;
    for (let i = 0; i < block.items.length; i++) {
      const len = block.items[i].text.length;
      if (rem <= len) return { itemIndex: i, offset: rem };
      rem -= len + 1;
    }
    const last = block.items.length - 1;
    return { itemIndex: last, offset: block.items[last]?.text.length ?? 0 };
  };
  const s = toItem(lo);
  const e = toItem(hi);
  const items = block.items.map(it => ({ ...it, marks: [...(it.marks ?? [])] }));

  if (s.itemIndex === e.itemIndex) {
    const item = items[s.itemIndex];
    const { text, marks } = deleteTextSlice(
      { ...block, type: 'paragraph', id: block.id, text: item.text, marks: item.marks ?? [] },
      s.offset,
      e.offset,
    );
    items[s.itemIndex] = { ...item, text, marks };
    return { ...block, items: items.filter(it => it.text.length > 0 || items.length === 1) };
  }

  const head = items[s.itemIndex];
  const tail = items[e.itemIndex];
  const mergedText = head.text.slice(0, s.offset) + tail.text.slice(e.offset);
  const [headBefore] = splitMarks(head.marks ?? [], s.offset);
  const [, tailAfter] = splitMarks(tail.marks ?? [], e.offset);
  const mergedMarks = normalizeMarks([
    ...headBefore,
    ...tailAfter.map(m => ({ ...m, start: m.start + s.offset, end: m.end + s.offset })),
  ], mergedText.length);

  const nextItems = [
    ...items.slice(0, s.itemIndex),
    ...(mergedText || items.length === 1 ? [{ ...head, text: mergedText, marks: mergedMarks }] : []),
    ...items.slice(e.itemIndex + 1),
  ];
  return {
    ...block,
    items: nextItems.length ? nextItems : [{ text: '', level: 1, marks: [] }],
  };
}

export type DeleteSelectionResult = {
  blocks: DocBlock[];
  caretBlockIndex: number;
  caretOffset: number;
  caretListItemIndex?: number;
};

export function deleteDocSelectionBlocks(blocks: DocBlock[], sel: DocSelection): DeleteSelectionResult | null {
  if (isCollapsedDocSelection(sel)) return null;
  const { start, end } = normalizeDocSelection(sel, blocks);
  const indices = getSelectionBlockIndices(sel, blocks);
  if (!indices?.length) return null;

  const startIdx = indices[0];
  const endIdx = indices[indices.length - 1];

  if (startIdx === endIdx) {
    const block = blocks[startIdx];
    const startSub = start.kind === 'block' && start.blockIndex === startIdx ? start.sub : { kind: 'whole' as const };
    const endSub = end.kind === 'block' && end.blockIndex === startIdx ? end.sub : { kind: 'whole' as const };

    if (isTextBlock(block)) {
      const { start: delStart, end: delEnd } = resolveSliceOffsets(block, startSub, endSub, 'only');
      const lo = Math.min(delStart, delEnd);
      const hi = Math.max(delStart, delEnd);
      const next = [...blocks];
      const { text, marks } = deleteTextSlice(block, lo, hi);
      next[startIdx] = { ...block, text, marks };
      return { blocks: next, caretBlockIndex: startIdx, caretOffset: lo };
    }

    if (block.type === 'list') {
      if (startSub.kind === 'whole' && endSub.kind === 'whole') {
        const next = [...blocks];
        next[startIdx] = { ...block, items: [{ text: '', level: 1, marks: [] }] };
        return { blocks: next, caretBlockIndex: startIdx, caretOffset: 0, caretListItemIndex: 0 };
      }
      const lo = subToTextOffset(block, startSub);
      const hi = subToTextOffset(block, endSub);
      const next = [...blocks];
      next[startIdx] = deleteListSlice(block, lo, hi);
      const toItem = (flat: number) => {
        let rem = flat;
        for (let i = 0; i < block.items.length; i++) {
          const len = block.items[i].text.length;
          if (rem <= len) return { itemIndex: i, offset: rem };
          rem -= len + 1;
        }
        return { itemIndex: 0, offset: 0 };
      };
      const c = toItem(lo);
      return { blocks: next, caretBlockIndex: startIdx, caretOffset: c.offset, caretListItemIndex: c.itemIndex };
    }

    if (startSub.kind === 'whole' && endSub.kind === 'whole') {
      const next = [...blocks];
      next.splice(startIdx, 1, { type: 'paragraph', id: genBlockId(), text: '', marks: [], align: 'left' });
      return { blocks: next, caretBlockIndex: startIdx, caretOffset: 0 };
    }

    return null;
  }

  const next = [...blocks];
  const first = blocks[startIdx];
  const last = blocks[endIdx];
  const startSub = start.kind === 'block' && start.blockIndex === startIdx ? start.sub : { kind: 'whole' as const };
  const endSub = end.kind === 'block' && end.blockIndex === endIdx ? end.sub : { kind: 'whole' as const };

  let mergedBlock: DocBlock | null = null;
  let caretOffset = 0;
  let caretListItemIndex: number | undefined;

  if (isTextBlock(first) && isTextBlock(last)) {
    const { start: prefixEnd } = resolveSliceOffsets(first, startSub, endSub, 'first');
    const { end: suffixStart } = resolveSliceOffsets(last, startSub, endSub, 'last');
    const prefix = first.text.slice(0, prefixEnd);
    const suffix = last.text.slice(suffixStart);
    const mergedText = prefix + suffix;
    const splitAt = prefix.length;
    const mergedMarks = [
      ...first.marks.filter(m => m.end <= prefixEnd),
      ...last.marks.filter(m => m.start >= suffixStart).map(m => ({
        ...m,
        start: m.start - suffixStart + splitAt,
        end: m.end - suffixStart + splitAt,
      })),
    ];
    mergedBlock = {
      ...first,
      text: mergedText,
      marks: trimMarks(mergedMarks, mergedText.length),
    };
    caretOffset = splitAt;
  } else if (first.type === 'list' && last.type === 'list') {
    const lo = subToTextOffset(first, startSub);
    const hi = subToTextOffset(last, endSub);
    if (first.id === last.id) {
      mergedBlock = deleteListSlice(first, lo, hi);
      const toItem = (flat: number) => {
        let rem = flat;
        for (let i = 0; i < first.items.length; i++) {
          const len = first.items[i].text.length;
          if (rem <= len) return { itemIndex: i, offset: rem };
          rem -= len + 1;
        }
        return { itemIndex: 0, offset: 0 };
      };
      const c = toItem(lo);
      caretOffset = c.offset;
      caretListItemIndex = c.itemIndex;
    } else {
      const prefixItem = deleteListSlice(first, lo, flatTextLength(first));
      const suffixItem = deleteListSlice(last, 0, hi);
      const prefix = prefixItem.items.map(it => it.text).join('\n');
      const suffix = suffixItem.items.map(it => it.text).join('\n');
      const mergedText = prefix + suffix;
      mergedBlock = {
        type: 'paragraph',
        id: first.id,
        text: mergedText,
        marks: [],
        align: 'left',
      };
      caretOffset = prefix.length;
    }
  } else if (isTextBlock(first) || isTextBlock(last)) {
    const textBlock = isTextBlock(first) ? first : last;
    const prefix = isTextBlock(first)
      ? first.text.slice(0, startSub.kind === 'text' ? startSub.offset : 0)
      : '';
    const suffix = isTextBlock(last)
      ? last.text.slice(endSub.kind === 'text' ? endSub.offset : last.text.length)
      : '';
    const mergedText = prefix + suffix;
    mergedBlock = {
      type: 'paragraph',
      id: first.id,
      text: mergedText,
      marks: trimMarks(
        isTextBlock(first) ? first.marks.filter(m => m.end <= (startSub.kind === 'text' ? startSub.offset : 0)) : [],
        mergedText.length,
      ),
      align: isTextBlock(first) && 'align' in first ? first.align ?? 'left' : 'left',
    };
    caretOffset = prefix.length;
  } else {
    mergedBlock = { type: 'paragraph', id: genBlockId(), text: '', marks: [], align: 'left' };
    caretOffset = 0;
  }

  next.splice(startIdx, endIdx - startIdx + 1, mergedBlock);
  return {
    blocks: next,
    caretBlockIndex: startIdx,
    caretOffset,
    caretListItemIndex,
  };
}

export function replaceDocSelectionWithText(
  blocks: DocBlock[],
  sel: DocSelection,
  text: string,
): DeleteSelectionResult | null {
  const deleted = deleteDocSelectionBlocks(blocks, sel);
  if (!deleted) return null;
  const next = [...deleted.blocks];
  const block = next[deleted.caretBlockIndex];
  if (block && isTextBlock(block)) {
    const insertAt = deleted.caretOffset;
    const { text: newText, marks } = insertTextWithMarks(block.text, block.marks, insertAt, text);
    next[deleted.caretBlockIndex] = { ...block, text: newText, marks };
    return {
      blocks: next,
      caretBlockIndex: deleted.caretBlockIndex,
      caretOffset: insertAt + text.length,
    };
  }
  if (block?.type === 'list' && deleted.caretListItemIndex != null) {
    const itemIndex = deleted.caretListItemIndex;
    const item = block.items[itemIndex];
    if (!item) return deleted;
    const insertAt = deleted.caretOffset;
    const { text: newText, marks } = insertTextWithMarks(item.text, item.marks ?? [], insertAt, text);
    const items = block.items.map((it, i) =>
      i === itemIndex ? { ...it, text: newText, marks } : it,
    );
    next[deleted.caretBlockIndex] = { ...block, items };
    return {
      blocks: next,
      caretBlockIndex: deleted.caretBlockIndex,
      caretOffset: insertAt + text.length,
      caretListItemIndex: itemIndex,
    };
  }
  return deleted;
}
