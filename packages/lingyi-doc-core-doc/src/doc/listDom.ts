import type { ListBlock, ListItem, TextMark } from './types';
import { clampListLevel, getBulletMarkerForLevel, isListItemTextEmpty } from './listOps';
import {
  extractContentFromEditable,
  extractPlainText,
  marksEqual,
  marksToHtml,
  normalizeMarks,
  orderedListMarker,
  setCaretOffset,
} from './utils';
import type { FindHighlightRange } from './findReplace';
import type { MarksToHtmlOptions } from './comments';

/** 空列表项文本占位，保证 span 可聚焦、可点击 */
export const LIST_TEXT_ZWSP = '\u200B';

export function normalizeListItemPlainText(text: string): string {
  return text.replace(/\u200B/g, '');
}

function readListTextEl(textEl: HTMLElement): string {
  return normalizeListItemPlainText(extractPlainText(textEl));
}

function trimItemMarks(marks: TextMark[], len: number): TextMark[] {
  return normalizeMarks(
    marks.filter(m => m.start < len && m.end > 0).map(m => ({
      ...m,
      start: Math.max(0, m.start),
      end: Math.min(len, m.end),
    })),
    len,
  );
}

function writeListTextEl(
  textEl: HTMLElement,
  text: string,
  marks?: TextMark[],
  htmlOptions?: MarksToHtmlOptions,
): void {
  const normalized = normalizeListItemPlainText(text);
  const itemMarks = trimItemMarks(marks ?? [], normalized.length);
  textSpanClear(textEl);
  if (normalized) {
    if (normalized.includes('\n') || itemMarks.length || (htmlOptions?.findHighlights?.length ?? 0) > 0) {
      textEl.innerHTML = marksToHtml(normalized, itemMarks, htmlOptions);
    } else {
      textEl.textContent = normalized;
    }
  } else {
    textEl.appendChild(document.createTextNode(LIST_TEXT_ZWSP));
  }
}

function textSpanClear(textEl: HTMLElement): void {
  while (textEl.firstChild) textEl.removeChild(textEl.firstChild);
}

function ensureListTextEl(textEl: HTMLElement): void {
  if (!textEl.textContent) writeListTextEl(textEl, '');
}

function applyListTextElStyle(textEl: HTMLElement): void {
  textEl.style.flex = '1';
  textEl.style.outline = 'none';
  textEl.style.minHeight = '1.7em';
  textEl.style.minWidth = '1px';
  textEl.style.lineHeight = '1.7';
  textEl.style.display = 'block';
}

export interface ListCaretContext {
  anchorItemIndex: number;
  focusItemIndex: number;
  anchorOffset: number;
  focusOffset: number;
  collapsed: boolean;
  focusItemText: string;
}

export function findListItemEl(node: Node | null, listRoot: HTMLElement): HTMLElement | null {
  let el = node instanceof HTMLElement ? node : node?.parentElement;
  while (el && el !== listRoot) {
    if (el.dataset.listItem !== undefined) return el;
    el = el.parentElement;
  }
  return null;
}

export function getListTextEl(li: HTMLElement): HTMLElement {
  return li.querySelector('[data-list-text]') as HTMLElement ?? li;
}

export function getListItemIndex(li: HTMLElement): number {
  return Number(li.dataset.listItem ?? 0);
}

export function extractListItemText(li: HTMLElement): string {
  return readListTextEl(getListTextEl(li));
}

function caretOffsetInContainer(container: HTMLElement, node: Node, nodeOffset: number, li?: HTMLElement): number {
  if (li) {
    const marker = li.querySelector('[data-list-marker]');
    if (marker && (marker === node || marker.contains(node))) return 0;
  }
  if (!container.contains(node)) return 0;
  const range = document.createRange();
  range.selectNodeContents(container);
  range.setEnd(node, nodeOffset);
  const temp = document.createElement('div');
  temp.appendChild(range.cloneContents());
  return normalizeListItemPlainText(extractPlainText(temp)).length;
}

export function getListCaretContext(listRoot: HTMLElement): ListCaretContext | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const anchorLi = findListItemEl(sel.anchorNode, listRoot);
  const focusLi = findListItemEl(sel.focusNode, listRoot);
  if (!anchorLi || !focusLi) return null;

  const anchorTextEl = getListTextEl(anchorLi);
  const focusTextEl = getListTextEl(focusLi);

  return {
    anchorItemIndex: getListItemIndex(anchorLi),
    focusItemIndex: getListItemIndex(focusLi),
    anchorOffset: caretOffsetInContainer(anchorTextEl, sel.anchorNode!, sel.anchorOffset, anchorLi),
    focusOffset: caretOffsetInContainer(focusTextEl, sel.focusNode!, sel.focusOffset, focusLi),
    collapsed: sel.isCollapsed,
    focusItemText: readListTextEl(focusTextEl),
  };
}

export function setListItemCaret(listRoot: HTMLElement, itemIndex: number, offset: number): void {
  const li = listRoot.querySelector(`li[data-list-item="${itemIndex}"]`) as HTMLElement | null;
  if (!li) return;
  const textEl = getListTextEl(li);
  ensureListTextEl(textEl);
  listRoot.focus();
  setCaretOffset(textEl, offset);
}

export function getListItemTextEl(listRoot: HTMLElement, itemIndex: number): HTMLElement | null {
  const li = listRoot.querySelector(`li[data-list-item="${itemIndex}"]`) as HTMLElement | null;
  return li ? getListTextEl(li) : null;
}

/** DOM 与 model 结构不一致时需完整重建（如 Enter 新增项） */
export function listDomNeedsFullSync(listRoot: HTMLElement, block: ListBlock): boolean {
  const lis = listRoot.querySelectorAll(':scope > li[data-list-item]');
  if (lis.length !== block.items.length) return true;
  return block.items.some((item, i) => {
    const li = lis[i] as HTMLElement | undefined;
    if (!li) return true;
    if (extractListItemText(li) !== item.text) return true;
    const textEl = getListTextEl(li);
    const extracted = extractContentFromEditable(textEl);
    const domText = normalizeListItemPlainText(extracted.text);
    const domMarks = trimItemMarks(extracted.marks, domText.length);
    if (!marksEqual(item.marks, domMarks)) return true;
    if (clampListLevel(Number(li.dataset.listLevel ?? 1)) !== clampListLevel(item.level)) return true;
    if (block.listType === 'task') {
      const cb = li.querySelector('input[data-list-checkbox]') as HTMLInputElement | null;
      if (!!cb?.checked !== !!item.checked) return true;
    }
    return false;
  });
}

/** 仅在文本 span 内删除字符，避免误删 marker */
export function deleteListItemCharAt(
  listRoot: HTMLElement,
  itemIndex: number,
  offset: number,
): boolean {
  const textEl = getListItemTextEl(listRoot, itemIndex);
  if (!textEl) return false;
  ensureListTextEl(textEl);
  const text = readListTextEl(textEl);
  if (offset < 0 || offset >= text.length) return false;
  writeListTextEl(textEl, text.slice(0, offset) + text.slice(offset + 1));
  setListItemCaret(listRoot, itemIndex, offset);
  return true;
}

export function getListItemPlainText(listRoot: HTMLElement, itemIndex: number): string {
  const textEl = getListItemTextEl(listRoot, itemIndex);
  return textEl ? readListTextEl(textEl) : '';
}

/** 点击空项时将光标落入文本区（不干扰非空项的拖拽选区） */
export function focusListItemFromPointer(listRoot: HTMLElement, target: Node | null): boolean {
  if (!(target instanceof Node)) return false;
  if (target instanceof HTMLElement
    && target.closest('[data-list-marker], input[data-list-checkbox]')) {
    return false;
  }
  const li = findListItemEl(target, listRoot);
  if (!li) return false;
  const textEl = getListTextEl(li);
  const itemIndex = getListItemIndex(li);
  if (!isListItemTextEmpty(readListTextEl(textEl))) return false;

  const onItemRow = target === li
    || textEl === target
    || textEl.contains(target)
    || (target instanceof HTMLElement && li.contains(target));
  if (!onItemRow) return false;

  ensureListTextEl(textEl);
  setListItemCaret(listRoot, itemIndex, 0);
  return true;
}

/** 删除列表内当前 DOM 选区（仅文本，不破坏 marker 结构） */
export function deleteListDomSelection(listRoot: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
  if (!listRoot.contains(sel.anchorNode) || !listRoot.contains(sel.focusNode)) return false;
  document.execCommand('delete');
  listRoot.querySelectorAll('[data-list-text]').forEach(el => {
    ensureListTextEl(el as HTMLElement);
  });
  return true;
}

export function extractListItemsFromDom(listRoot: HTMLElement, existingItems: ListItem[]): ListItem[] {
  const lis = listRoot.querySelectorAll(':scope > li[data-list-item]');
  return Array.from(lis).map((li, i) => {
    const el = li as HTMLElement;
    const level = clampListLevel(Number(el.dataset.listLevel ?? existingItems[i]?.level ?? 1));
    const textEl = getListTextEl(el);
    const extracted = extractContentFromEditable(textEl);
    const text = normalizeListItemPlainText(extracted.text);
    const marks = trimItemMarks(extracted.marks, text.length);
    const cb = el.querySelector('input[type="checkbox"][data-list-checkbox]') as HTMLInputElement | null;
    return {
      text,
      level,
      checked: cb ? cb.checked : existingItems[i]?.checked,
      marks,
      align: existingItems[i]?.align,
    };
  });
}

function listMarkerText(block: ListBlock, items: ListItem[], index: number): string {
  if (block.listType === 'ordered') {
    return orderedListMarker(items, index, block.orderedStyle ?? 'multiLevel');
  }
  if (block.listType === 'task') return '';
  return getBulletMarkerForLevel(items[index]?.level ?? 1);
}

function applyListItemLayoutStyle(li: HTMLElement): void {
  li.style.display = 'flex';
  li.style.alignItems = 'flex-start';
  li.style.gap = '8px';
  li.style.margin = '4px 0';
  const marker = li.querySelector('[data-list-marker]') as HTMLElement | null;
  if (marker) {
    marker.style.alignItems = 'flex-start';
    marker.style.alignSelf = 'flex-start';
  }
  const cb = li.querySelector('input[data-list-checkbox]') as HTMLInputElement | null;
  if (cb) {
    cb.style.alignSelf = 'flex-start';
    cb.style.marginTop = '3px';
  }
}

export function updateListMarkers(listRoot: HTMLElement, block: ListBlock): void {
  block.items.forEach((item, i) => {
    const li = listRoot.querySelector(`li[data-list-item="${i}"]`) as HTMLElement | null;
    if (!li) return;
    applyListItemLayoutStyle(li);
    li.dataset.listLevel = String(item.level);
    li.style.paddingLeft = `${(item.level - 1) * 24}px`;
    const marker = li.querySelector('[data-list-marker]');
    if (marker) marker.textContent = listMarkerText(block, block.items, i);
  });
}

export function updateListItemMeta(listRoot: HTMLElement, block: ListBlock): void {
  updateListMarkers(listRoot, block);
  block.items.forEach((item, i) => {
    const cb = listRoot.querySelector(`input[data-list-checkbox="${i}"]`) as HTMLInputElement | null;
    if (cb) cb.checked = !!item.checked;
    const textEl = getListItemTextEl(listRoot, i);
    if (textEl) {
      ensureListTextEl(textEl);
      textEl.style.textDecoration = item.checked ? 'line-through' : 'none';
      textEl.style.color = item.checked ? '#86909C' : '#1F2329';
    }
  });
}

export function syncListDom(
  listRoot: HTMLElement,
  block: ListBlock,
  options?: {
    restoreSelection?: boolean;
    caret?: { itemIndex: number; offset: number };
    /** itemIndex -> find highlights */
    findHighlightsByItem?: Map<number, FindHighlightRange[]> | Record<number, FindHighlightRange[]>;
  },
): void {
  const restoreSelection = options?.restoreSelection ?? !options?.caret;
  const saved = restoreSelection ? saveListSelection(listRoot) : null;
  while (listRoot.firstChild) listRoot.removeChild(listRoot.firstChild);

  const getItemHighlights = (itemIndex: number): FindHighlightRange[] | undefined => {
    const map = options?.findHighlightsByItem;
    if (!map) return undefined;
    if (map instanceof Map) return map.get(itemIndex);
    return map[itemIndex];
  };

  block.items.forEach((item, i) => {
    const li = document.createElement('li');
    li.dataset.listItem = String(i);
    li.dataset.listLevel = String(item.level);
    applyListItemLayoutStyle(li);
    li.style.paddingLeft = `${(item.level - 1) * 24}px`;

    if (block.listType === 'task') {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.listCheckbox = String(i);
      cb.checked = !!item.checked;
      cb.contentEditable = 'false';
      cb.style.width = '16px';
      cb.style.height = '16px';
      cb.style.margin = '0';
      cb.style.flexShrink = '0';
      cb.style.cursor = 'pointer';
      cb.style.alignSelf = 'flex-start';
      cb.style.marginTop = '3px';
      cb.addEventListener('mousedown', e => e.preventDefault());
      li.appendChild(cb);
    } else {
      const marker = document.createElement('span');
      marker.dataset.listMarker = '';
      marker.contentEditable = 'false';
      marker.textContent = listMarkerText(block, block.items, i);
      marker.style.width = '22px';
      marker.style.flexShrink = '0';
      marker.style.display = 'flex';
      marker.style.alignItems = 'flex-start';
      marker.style.alignSelf = 'flex-start';
      marker.style.justifyContent = 'flex-end';
      marker.style.color = '#86909C';
      marker.style.fontSize = '15px';
      marker.style.lineHeight = '1.7';
      marker.style.userSelect = 'none';
      marker.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.shiftKey) return;
        e.preventDefault();
        setListItemCaret(listRoot, i, 0);
      });
      li.appendChild(marker);
    }

    const textSpan = document.createElement('span');
    textSpan.dataset.listText = '';
    applyListTextElStyle(textSpan);
    textSpan.style.userSelect = 'text';
    const itemHighlights = getItemHighlights(i);
    writeListTextEl(
      textSpan,
      item.text || '',
      item.marks,
      itemHighlights?.length ? { findHighlights: itemHighlights } : undefined,
    );
    if (item.checked) {
      textSpan.style.textDecoration = 'line-through';
      textSpan.style.color = '#86909C';
    }
    li.appendChild(textSpan);
    listRoot.appendChild(li);
  });

  if (options?.caret) {
    listRoot.focus();
    setListItemCaret(listRoot, options.caret.itemIndex, options.caret.offset);
  } else if (saved) {
    restoreListSelection(listRoot, saved);
  } else {
    ensureEmptyListItemsFocusable(listRoot);
  }
}

function ensureEmptyListItemsFocusable(listRoot: HTMLElement): void {
  listRoot.querySelectorAll('[data-list-text]').forEach(el => {
    ensureListTextEl(el as HTMLElement);
  });
}

interface SavedListSelection {
  anchorItem: number;
  anchorOffset: number;
  focusItem: number;
  focusOffset: number;
}

function saveListSelection(listRoot: HTMLElement): SavedListSelection | null {
  const ctx = getListCaretContext(listRoot);
  if (!ctx) return null;
  return {
    anchorItem: ctx.anchorItemIndex,
    anchorOffset: ctx.anchorOffset,
    focusItem: ctx.focusItemIndex,
    focusOffset: ctx.focusOffset,
  };
}

function restoreListSelection(listRoot: HTMLElement, saved: SavedListSelection): void {
  const sel = window.getSelection();
  if (!sel) return;
  const anchorEl = getListItemTextEl(listRoot, saved.anchorItem);
  const focusEl = getListItemTextEl(listRoot, saved.focusItem);
  if (!anchorEl || !focusEl) return;

  try {
    const range = document.createRange();
    const [anchorNode, anchorOff] = getRangePoint(anchorEl, saved.anchorOffset);
    const [focusNode, focusOff] = getRangePoint(focusEl, saved.focusOffset);
    range.setStart(anchorNode, anchorOff);
    range.setEnd(focusNode, focusOff);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    setListItemCaret(listRoot, saved.focusItem, saved.focusOffset);
  }
}

function getRangePoint(el: HTMLElement, offset: number): [Node, number] {
  ensureListTextEl(el);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const raw = node.textContent ?? '';
    const visibleLen = normalizeListItemPlainText(raw).length;
    if (remaining <= visibleLen) {
      if (visibleLen === 0 && raw.length > 0) return [node, 0];
      return [node, remaining];
    }
    remaining -= visibleLen;
    node = walker.nextNode() as Text | null;
  }
  const firstText = el.firstChild;
  if (firstText?.nodeType === Node.TEXT_NODE) return [firstText, 0];
  return [el, 0];
}
