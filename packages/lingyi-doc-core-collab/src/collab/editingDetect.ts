/** 富文本：块内 contenteditable 正在输入 */
export function isRichTextComposing(): boolean {
  const el = document.activeElement;
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  return !!el.closest('[contenteditable="true"]');
}

/** 画板：文本/思维导图内联编辑中 */
export function isWhiteboardComposing(): boolean {
  const el = document.activeElement;
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
  if (el.isContentEditable) return true;
  return !!el.closest('[data-wb-inline-editor], [data-wb-mindmap-text-edit]');
}

/** 思维笔记：节点 contenteditable 正在输入 */
export function isMindNoteComposing(): boolean {
  const el = document.activeElement;
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable && el.closest('[data-node-id]')) return true;
  return !!el.closest('[data-mind-node-text-edit]');
}
