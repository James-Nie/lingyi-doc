import { extractContentFromEditable, setCaretOffset } from './utils';

/** 光标视觉几何：跨块 ↑↓ 保列、点击落点等 */

/** 折叠选区的客户端 X（失败返回 null） */
export function getCollapsedCaretClientX(): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const rects = range.getClientRects();
  if (rects.length > 0) return rects[0].left;
  const rect = range.getBoundingClientRect();
  if (rect.width || rect.height || rect.left || rect.top) return rect.left;
  return null;
}

/**
 * 从客户端坐标获取光标范围。
 * @param x 客户端 X 坐标
 * @param y 客户端 Y 坐标
 * @returns 光标范围
 */
function caretRangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof doc.caretRangeFromPoint === 'function') {
    return doc.caretRangeFromPoint(x, y);
  }
  if (typeof doc.caretPositionFromPoint === 'function') {
    const pos = doc.caretPositionFromPoint(x, y);
    if (!pos) return null;
    const range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.collapse(true);
    return range;
  }
  return null;
}

/**
 * 在可编辑根内按 visual X 放置光标。
 * @param preferBottom true = 落在块底部附近（从上方进入），false = 顶部（从下方进入）
 */
export function setCaretFromClientX(
  el: HTMLElement,
  clientX: number,
  preferBottom: boolean,
): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.height <= 0) return false;
  const y = preferBottom
    ? Math.min(rect.bottom - 2, rect.top + rect.height - 2)
    : Math.max(rect.top + 2, rect.top);
  const x = Math.max(rect.left + 1, Math.min(clientX, rect.right - 1));

  const range = caretRangeFromPoint(x, y);
  if (!range || !el.contains(range.startContainer)) return false;

  el.focus({ preventScroll: true });
  const sel = window.getSelection();
  if (!sel) return false;
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

/** 中日韩汉字 / 假名 / 韩文 */
const CJK_CHAR = /[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/;

/** 英文单词字符 */
const WORD_CHAR = /[A-Za-z0-9_]/;

function isWordLike(ch: string): boolean {
  return CJK_CHAR.test(ch) || WORD_CHAR.test(ch);
}

/**
 * 按偏移扩展「词」边界（CJK 连续汉字为一词；英文按 [A-Za-z0-9_]）。
 * 用于双击选词，避免卡在 mark 节点边界。
 */
export function expandWordRange(text: string, offset: number): { start: number; end: number } {
  if (!text.length) return { start: 0, end: 0 };
  let i = Math.max(0, Math.min(offset, text.length));
  if (i >= text.length) i = text.length - 1;
  if (i > 0 && !isWordLike(text[i]!) && isWordLike(text[i - 1]!)) i -= 1;
  if (!isWordLike(text[i]!)) return { start: i, end: i };

  const cjk = CJK_CHAR.test(text[i]!);
  let start = i;
  let end = i + 1;
  while (start > 0) {
    const ch = text[start - 1]!;
    if (cjk ? CJK_CHAR.test(ch) : WORD_CHAR.test(ch)) start -= 1;
    else break;
  }
  while (end < text.length) {
    const ch = text[end]!;
    if (cjk ? CJK_CHAR.test(ch) : WORD_CHAR.test(ch)) end += 1;
    else break;
  }
  return { start, end };
}

/** 在 contentEditable 内选中 [start, end) 字符区间（与 getCaretOffset 计数一致） */
export function selectTextOffsetsInEditable(el: HTMLElement, start: number, end: number): void {
  const lo = Math.max(0, Math.min(start, end));
  const hi = Math.max(0, Math.max(start, end));
  setCaretOffset(el, lo);
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const startRange = sel.getRangeAt(0).cloneRange();
  setCaretOffset(el, hi);
  if (!sel.rangeCount) return;
  const endRange = sel.getRangeAt(0);
  const range = document.createRange();
  range.setStart(startRange.startContainer, startRange.startOffset);
  range.setEnd(endRange.startContainer, endRange.startOffset);
  sel.removeAllRanges();
  sel.addRange(range);
  el.focus({ preventScroll: true });
}
