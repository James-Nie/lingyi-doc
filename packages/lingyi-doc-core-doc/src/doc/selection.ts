import type { ToolbarState } from './types';
import { extractPlainText, getCaretOffset } from './utils';

export interface DocSelectionContext {
  startBlock: number;
  endBlock: number;
  isMultiBlock: boolean;
  hasTextSelection: boolean;
  collapsed: boolean;
}

/** 从 DOM 节点向上查找块索引 */
export function findBlockIndexFromNode(node: Node | null): number {
  let el = node instanceof HTMLElement ? node : node?.parentElement;
  while (el) {
    const idx = el.getAttribute('data-block-index');
    if (idx != null) return Number(idx);
    el = el.parentElement;
  }
  return -1;
}

/** 查找可编辑根节点 */
export function findEditableRoot(node: Node | null): HTMLElement | null {
  let el = node instanceof HTMLElement ? node : node?.parentElement;
  while (el) {
    if (el.isContentEditable && el.dataset.docEditable !== undefined) return el;
    el = el.parentElement;
  }
  return null;
}

export type FocusedDocContextKind = 'title' | 'code' | 'mermaid' | 'table' | 'text' | 'list' | 'none';

export interface FocusedDocContext {
  blockIndex: number;
  kind: FocusedDocContextKind;
  editable: HTMLElement | null;
}

/** 判断光标在文档编辑器内的上下文（标题 / 代码块 / 表格 / 正文等） */
export function getFocusedDocContext(editorRoot: HTMLElement | null): FocusedDocContext {
  const active = document.activeElement;
  if (!editorRoot || !active || !editorRoot.contains(active)) {
    return { blockIndex: -1, kind: 'none', editable: null };
  }

  if (active instanceof HTMLElement && active.dataset.docTitle !== undefined) {
    return { blockIndex: -1, kind: 'title', editable: active };
  }

  const focusNode = window.getSelection()?.focusNode ?? active;
  const editable = findEditableRoot(focusNode);
  const blockIndex = findBlockIndexFromNode(focusNode);

  if (editable?.closest('[data-doc-code-ui]')) {
    return { blockIndex, kind: 'code', editable };
  }

  if (editable?.closest('[data-doc-mermaid-ui]')) {
    return { blockIndex, kind: 'mermaid', editable };
  }

  if (editable?.closest('[data-doc-table-ui]')) {
    return { blockIndex, kind: 'table', editable };
  }

  if (editable?.dataset.listRoot !== undefined) {
    return { blockIndex, kind: 'list', editable };
  }

  if (editable?.closest('[data-list-root]')) {
    const listRoot = editable.closest('[data-list-root]') as HTMLElement;
    return { blockIndex: findBlockIndexFromNode(listRoot), kind: 'list', editable: listRoot };
  }

  if (editable?.dataset.docEditable !== undefined) {
    return { blockIndex, kind: 'text', editable };
  }

  return { blockIndex, kind: 'none', editable };
}

/** 是否为文档正文类上下文（段落 / 标题 / 引用 / 列表） */
export function isDocumentBodyContext(kind: FocusedDocContextKind): boolean {
  return kind === 'text' || kind === 'list';
}

/** 读取当前选区涉及的块范围 */
export function getSelectionBlockRange(): DocSelectionContext | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  const startBlock = findBlockIndexFromNode(range.startContainer);
  const endBlock = findBlockIndexFromNode(range.endContainer);
  if (startBlock < 0 || endBlock < 0) return null;

  const start = Math.min(startBlock, endBlock);
  const end = Math.max(startBlock, endBlock);
  const collapsed = range.collapsed;
  const hasTextSelection = !collapsed;

  return {
    startBlock: start,
    endBlock: end,
    isMultiBlock: end > start,
    hasTextSelection,
    collapsed,
  };
}

/** 从浏览器选区读取行内格式状态 */
export function getInlineStateFromSelection(): Partial<ToolbarState> {
  try {
    return {
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikethrough: document.queryCommandState('strikeThrough'),
    };
  } catch {
    return {};
  }
}

/** 选中元素内全部内容 */
export function selectElementContents(el: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

/** 保存/恢复选区 */
export function saveSelection(): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  return sel.getRangeAt(0).cloneRange();
}

export function restoreSelection(range: Range | null): void {
  if (!range) return;
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

/** 当前是否存在非折叠文本选区 */
export function hasNonCollapsedTextSelection(): boolean {
  const sel = window.getSelection();
  return !!sel && !sel.isCollapsed && sel.toString().length > 0;
}

/** 光标是否在 contentEditable 开头 */
export function isCaretAtStart(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return false;
  return getCaretOffset(el) === 0;
}

/** 光标是否在 contentEditable 末尾 */
export function isCaretAtEnd(el: HTMLElement, textLength?: number): boolean {
  const len = textLength ?? extractPlainText(el).length;
  return getCaretOffset(el) >= len;
}
