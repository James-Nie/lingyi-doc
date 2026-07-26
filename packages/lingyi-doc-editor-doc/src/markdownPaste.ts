import { flushSync } from 'react-dom';
import { getClipboardPlainText, getClipboardTextFromDataTransfer, looksLikeMarkdown, normalizePasteText, parseTableCellCoords } from '@lingyi-doc/core-doc';

export { parseTableCellCoords };

let lastPasteHandledAt = 0;

export type MarkdownPasteContext = {
  blockIndex: number;
  offset: number;
  currentText: string;
  currentMarks: import('@lingyi-doc/core').TextMark[];
  tableCell?: { row: number; col: number };
  listItemIndex?: number;
};

export type DocPasteInsertPlain = (text: string, editable: HTMLElement) => void;

/** 在用户手势期间同步读取剪贴板（VS Code / Electron 下 clipboardData 常为空） */
function readClipboardSyncDuringGesture(): string {
  try {
    const ta = document.createElement('textarea');
    ta.setAttribute('aria-hidden', 'true');
    ta.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:none;outline:none;opacity:0.01';
    document.body.appendChild(ta);
    ta.focus({ preventScroll: true });
    const ok = document.execCommand('paste');
    const text = normalizePasteText(ta.value);
    document.body.removeChild(ta);
    if (ok && text.trim()) return text;
  } catch {
    // execCommand paste 不可用
  }
  return '';
}

/** 从粘贴事件同步读取文本 */
export function readPasteEventText(e: ClipboardEvent | React.ClipboardEvent): string {
  const dt = 'clipboardData' in e && e.clipboardData
    ? e.clipboardData
    : (e as ClipboardEvent).clipboardData;
  if (dt) {
    const text = getClipboardTextFromDataTransfer(dt);
    if (text.trim()) return text;
  }
  if ('nativeEvent' in e && e.nativeEvent instanceof ClipboardEvent) {
    return getClipboardPlainText(e.nativeEvent);
  }
  return '';
}

/** 同步 + 异步读取剪贴板（VS Code / Electron 下 sync 可能为空，需 readText 兜底） */
export async function resolveClipboardText(e?: ClipboardEvent | null): Promise<string> {
  if (e) {
    const sync = readPasteEventText(e);
    if (sync.trim()) return sync;
  }

  const syncGesture = readClipboardSyncDuringGesture();
  if (syncGesture.trim()) return syncGesture;

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      const asyncText = normalizePasteText(await navigator.clipboard.readText());
      if (asyncText.trim()) return asyncText;
    }
  } catch {
    // 权限或环境不支持
  }
  return '';
}

/** 是否应弹出 Markdown 转换框 */
export function shouldOfferMarkdownConversion(text: string): boolean {
  return !!text.trim() && looksLikeMarkdown(text);
}

function markHandled(): boolean {
  const now = Date.now();
  if (now - lastPasteHandledAt < 100) return false;
  lastPasteHandledAt = now;
  return true;
}

export function openMarkdownPasteDialog(
  text: string,
  captureContext: (text: string) => void,
): void {
  flushSync(() => {
    captureContext(text);
  });
}

function insertPlainAtEditable(el: HTMLElement, text: string): void {
  el.focus();
  document.execCommand('insertText', false, text);
  el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
}

/** 分发粘贴结果：Markdown 弹窗 or 纯文本插入 */
export async function dispatchDocPaste(
  text: string,
  editable: HTMLElement | null,
  captureContext: (text: string) => void,
  insertPlain?: DocPasteInsertPlain,
): Promise<'markdown' | 'plain' | 'none'> {
  if (!text.trim()) return 'none';

  if (shouldOfferMarkdownConversion(text)) {
    if (!markHandled()) return 'none';
    openMarkdownPasteDialog(text, captureContext);
    return 'markdown';
  }

  if (editable) {
    if (insertPlain) {
      insertPlain(text, editable);
    } else {
      if (!markHandled()) return 'none';
      insertPlainAtEditable(editable, text);
    }
    return 'plain';
  }
  return 'none';
}

/** 判断节点是否为文档可编辑区（排除标题/代码块） */
export function findDocPasteEditable(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  if (target.closest('[data-doc-title]')) return null;
  if (target.closest('[data-doc-code-ui]')) return null;
  if (target.closest('[data-doc-mermaid-ui]')) return null;

  const el = target instanceof HTMLElement && target.isContentEditable && target.hasAttribute('data-doc-editable')
    ? target
    : target.closest('[data-doc-editable]') as HTMLElement | null;

  if (!el?.isContentEditable) return null;
  return el;
}

/** contentEditable 上的 paste 事件处理 */
export function handleEditablePasteEvent(
  e: ClipboardEvent,
  editable: HTMLElement,
  captureContext: (text: string) => void,
  insertPlain?: DocPasteInsertPlain,
): void {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation?.();

  const sync = readPasteEventText(e);
  if (sync.trim()) {
    void dispatchDocPaste(sync, editable, captureContext, insertPlain);
    return;
  }

  const syncGesture = readClipboardSyncDuringGesture();
  if (syncGesture.trim()) {
    void dispatchDocPaste(syncGesture, editable, captureContext, insertPlain);
    return;
  }

  void (async () => {
    const text = await resolveClipboardText(null);
    await dispatchDocPaste(text, editable, captureContext, insertPlain);
  })();
}

/** Cmd/Ctrl+V 键盘粘贴（VS Code 来源时 paste 事件常不可靠） */
export function handlePasteKeyboardEvent(
  e: KeyboardEvent,
  editorRoot: HTMLElement,
  captureContext: (text: string) => void,
  insertPlain?: DocPasteInsertPlain,
  getFallbackEditable?: () => HTMLElement | null,
): void {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'v') return;
  if (e.isComposing) return;

  const active = document.activeElement;
  let editable = active ? findDocPasteEditable(active) : null;
  if (!editable && getFallbackEditable) {
    editable = getFallbackEditable();
  }
  if (!editable || !editorRoot.contains(editable)) return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation?.();

  const syncGesture = readClipboardSyncDuringGesture();
  if (syncGesture.trim()) {
    void dispatchDocPaste(syncGesture, editable, captureContext, insertPlain);
    return;
  }

  void (async () => {
    const text = await resolveClipboardText(null);
    await dispatchDocPaste(text, editable, captureContext, insertPlain);
  })();
}

/** @deprecated 使用 handleEditablePasteEvent / handlePasteKeyboardEvent */
export function handleDocMarkdownPasteEvent(
  e: ClipboardEvent | React.ClipboardEvent,
  captureContext: (text: string) => void,
): boolean {
  const target = ('target' in e ? e.target : null) as EventTarget | null;
  const editable = findDocPasteEditable(target);
  if (!editable) return false;

  if ('nativeEvent' in e) {
    handleEditablePasteEvent(e.nativeEvent, editable, captureContext);
  } else {
    handleEditablePasteEvent(e as ClipboardEvent, editable, captureContext);
  }
  return true;
}
