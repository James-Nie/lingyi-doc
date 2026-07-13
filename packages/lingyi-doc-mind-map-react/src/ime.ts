import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/** 是否处于中文/日文等 IME 组字过程中 */
export function isImeComposing(e: ReactKeyboardEvent | KeyboardEvent): boolean {
  if ('nativeEvent' in e) {
    const ne = e.nativeEvent;
    if (ne instanceof KeyboardEvent && (ne.isComposing || ne.keyCode === 229)) return true;
  }
  const ke = e as KeyboardEvent;
  return ke.isComposing === true || ke.keyCode === 229;
}

export const MINDMAP_TEXT_PLACEHOLDER = '输入文本';

export function normalizeMindmapNodeText(text: string): string {
  const trimmed = text.trim();
  return trimmed || MINDMAP_TEXT_PLACEHOLDER;
}
