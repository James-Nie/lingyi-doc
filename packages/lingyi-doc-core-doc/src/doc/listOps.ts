import type { DocBlock, ListBlock, ListItem, ListType, OrderedListStyle, ParagraphBlock, TextMark } from './types';
import { createEmptyParagraph, genBlockId, getOrderedNumFmtForLevel, splitMarks, stripLeadingNewlines } from './utils';

/** 有序列表固定 3 级 */
export const MAX_LIST_LEVEL = 3;
export const LIST_INDENT_PX = 24;

export { getOrderedNumFmtForLevel };

/** 层级限制在 1–3 */
export function clampListLevel(level: number): number {
  return Math.min(Math.max(1, level), MAX_LIST_LEVEL);
}

/** 3 级无序符号：● / ○ / — */
export function getBulletMarkerForLevel(level: number): string {
  const lv = clampListLevel(level);
  if (lv === 1) return '●';
  if (lv === 2) return '○';
  return '—';
}

export function normalizeBulletListItem(item: ListItem): ListItem {
  return { ...item, level: clampListLevel(item.level) };
}

export function normalizeBulletListItems(items: ListItem[]): ListItem[] {
  return items.map(normalizeBulletListItem);
}

export function normalizeOrderedListItem(item: ListItem, orderedStyle: OrderedListStyle = 'multiLevel'): ListItem {
  return { ...item, level: clampListLevel(item.level), numFmt: getOrderedNumFmtForLevel(item.level, orderedStyle) };
}

export function normalizeOrderedListItems(items: ListItem[], orderedStyle: OrderedListStyle = 'multiLevel'): ListItem[] {
  return items.map(item => normalizeOrderedListItem(item, orderedStyle));
}

export function indentListItem(
  items: ListItem[],
  index: number,
  listType: ListType,
  orderedStyle: OrderedListStyle = 'multiLevel',
): ListItem[] {
  const next = items.map(it => ({ ...it, marks: [...(it.marks ?? [])] }));
  const item = next[index];
  if (!item || item.level >= MAX_LIST_LEVEL) return next;
  const updated = { ...item, level: item.level + 1 };
  if (listType === 'ordered') next[index] = normalizeOrderedListItem(updated, orderedStyle);
  else if (listType === 'bullet') next[index] = normalizeBulletListItem(updated);
  else next[index] = updated;
  return next;
}

export function outdentListItem(
  items: ListItem[],
  index: number,
  listType: ListType,
  orderedStyle: OrderedListStyle = 'multiLevel',
): ListItem[] {
  const next = items.map(it => ({ ...it, marks: [...(it.marks ?? [])] }));
  const item = next[index];
  if (!item || item.level <= 1) return next;
  const updated = { ...item, level: item.level - 1 };
  if (listType === 'ordered') next[index] = normalizeOrderedListItem(updated, orderedStyle);
  else if (listType === 'bullet') next[index] = normalizeBulletListItem(updated);
  else next[index] = updated;
  return next;
}

/** 列表项是否无实质文本（含零宽占位符） */
export function isListItemTextEmpty(text: string): boolean {
  return !text.replace(/\u200B/g, '').trim();
}

export function splitListItemOnEnter(
  items: ListItem[],
  itemIndex: number,
  cursorOffset: number,
  fullText: string,
  listType: ListType,
  orderedStyle: OrderedListStyle = 'multiLevel',
): { items: ListItem[]; focusIndex: number } | { cancel: true } {
  if (isListItemTextEmpty(fullText)) return { cancel: true };

  const item = items[itemIndex];
  const before = fullText.slice(0, cursorOffset);
  const afterRaw = fullText.slice(cursorOffset);
  const [, marksAfterRaw] = splitMarks(item.marks ?? [], cursorOffset);
  const { text: after, marks: afterMarks } = stripLeadingNewlines(afterRaw, marksAfterRaw);
  const next = items.map(it => ({ ...it, marks: [...(it.marks ?? [])] }));
  next[itemIndex] = { ...item, text: before };

  const newItem: ListItem = {
    text: after,
    level: item.level,
    checked: listType === 'task' ? false : item.checked,
    marks: afterMarks,
  };
  next.splice(
    itemIndex + 1,
    0,
    listType === 'ordered'
      ? normalizeOrderedListItem(newItem, orderedStyle)
      : listType === 'bullet'
        ? normalizeBulletListItem(newItem)
        : newItem,
  );
  return { items: next, focusIndex: itemIndex + 1 };
}

/** 空列表项 → 空白段落 */
export function emptyListItemToParagraphBlocks(block: ListBlock, itemIndex: number): DocBlock[] {
  return listItemToParagraphBlocks(
    { ...block, items: block.items.map((it, i) => (i === itemIndex ? { ...it, text: '' } : it)) },
    itemIndex,
  );
}

/** 将列表中某一项拆成段落块（前后列表段各自独立编号） */
export function listItemToParagraphBlocks(block: ListBlock, itemIndex: number): DocBlock[] {
  const item = block.items[itemIndex];
  const paragraph: ParagraphBlock = {
    type: 'paragraph',
    id: block.items.length === 1 ? block.id : genBlockId(),
    text: item.text,
    marks: item.marks ?? [],
    align: item.align ?? 'left',
  };

  const before = block.items.slice(0, itemIndex);
  const after = block.items.slice(itemIndex + 1);
  const result: DocBlock[] = [];

  if (before.length > 0) {
    result.push({
      ...block,
      items: block.listType === 'ordered'
        ? normalizeOrderedListItems(before, block.orderedStyle)
        : block.listType === 'bullet'
          ? normalizeBulletListItems(before)
          : before,
    });
  }
  result.push(paragraph);
  if (after.length > 0) {
    result.push({
      ...block,
      id: genBlockId(),
      items: block.listType === 'ordered'
        ? normalizeOrderedListItems(after, block.orderedStyle)
        : block.listType === 'bullet'
          ? normalizeBulletListItems(after)
          : after,
    });
  }
  return result.length ? result : [createEmptyParagraph()];
}

export function removeListItemAt(
  block: ListBlock,
  itemIndex: number,
): { kind: 'paragraph'; block: ParagraphBlock } | { kind: 'list'; block: ListBlock } {
  if (block.items.length <= 1) {
    return {
      kind: 'paragraph',
      block: {
        type: 'paragraph',
        id: block.id,
        text: '',
        marks: [],
        align: 'left',
      },
    };
  }
  const items = block.items.map(it => ({ ...it, marks: [...(it.marks ?? [])] }));
  items.splice(itemIndex, 1);
  const normalized = block.listType === 'ordered'
    ? normalizeOrderedListItems(items, block.orderedStyle)
    : block.listType === 'bullet'
      ? normalizeBulletListItems(items)
      : items;
  return { kind: 'list', block: { ...block, items: normalized } };
}

export function textToListItems(
  text: string,
  marks: TextMark[],
  listType: ListType,
  orderedStyle: OrderedListStyle = 'multiLevel',
): ListItem[] {
  const lines = text.split('\n');
  return lines.map(line => {
    const item: ListItem = {
      text: line,
      level: 1,
      marks: line === lines[0] ? marks : [],
      checked: listType === 'task' ? false : undefined,
    };
    return listType === 'ordered'
      ? normalizeOrderedListItem(item, orderedStyle)
      : listType === 'bullet'
        ? normalizeBulletListItem(item)
        : item;
  });
}

/** 行首 `数字. ` Markdown 语法（仅段落行首） */
export function parseOrderedListMarkdownLine(text: string): { content: string } | null {
  const m = text.match(/^(\d+)\.\s([\s\S]*)$/);
  if (!m) return null;
  return { content: m[2] };
}

/** 行首 `- ` / `* ` / `+ ` Markdown 语法（仅段落行首） */
export function parseBulletListMarkdownLine(text: string): { content: string } | null {
  const m = text.match(/^[-*+]\s([\s\S]*)$/);
  if (!m) return null;
  return { content: m[1] };
}

export function mergeBlocksToListBlock(
  blocks: DocBlock[],
  listType: ListType,
  preserveId?: string,
  orderedStyle: OrderedListStyle = 'multiLevel',
): ListBlock {
  const items: ListItem[] = [];
  blocks.forEach(b => {
    if (b.type === 'list' && b.listType === listType) {
      items.push(...b.items.map(it => ({ ...it, marks: [...(it.marks ?? [])] })));
    } else if (b.type === 'paragraph' || b.type === 'quote' || b.type === 'heading') {
      const text = 'text' in b ? b.text : '';
      const marks = 'marks' in b ? b.marks : [];
      items.push(...textToListItems(text, marks, listType, orderedStyle));
    }
  });
  const normalized = listType === 'ordered'
    ? normalizeOrderedListItems(items, orderedStyle)
    : listType === 'bullet'
      ? normalizeBulletListItems(items)
      : items;
  return {
    type: 'list',
    id: preserveId ?? genBlockId(),
    listType,
    items: normalized.length ? normalized : [{ text: '', level: 1, marks: [] }],
    orderedStyle: listType === 'ordered' ? orderedStyle : undefined,
  };
}
