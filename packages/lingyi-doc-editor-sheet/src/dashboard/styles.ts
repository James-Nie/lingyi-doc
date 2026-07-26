import type { CSSProperties } from 'react';

/** 选中态四角 L 形角标（对齐产品图：加粗 L，贴合蓝边框） */
export function cornerBracketStyle(pos: 'tl' | 'tr' | 'bl' | 'br'): CSSProperties {
  const size = 16;
  const thick = 3;
  const color = '#1677ff';
  const base: CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    zIndex: 8,
    pointerEvents: 'none',
    borderColor: color,
    borderStyle: 'solid',
    boxSizing: 'border-box',
  };
  if (pos === 'tl') {
    return {
      ...base,
      top: -1,
      left: -1,
      borderWidth: `${thick}px 0 0 ${thick}px`,
      borderTopLeftRadius: 4,
    };
  }
  if (pos === 'tr') {
    return {
      ...base,
      top: -1,
      right: -1,
      borderWidth: `${thick}px ${thick}px 0 0`,
      borderTopRightRadius: 4,
    };
  }
  if (pos === 'bl') {
    return {
      ...base,
      bottom: -1,
      left: -1,
      borderWidth: `0 0 ${thick}px ${thick}px`,
      borderBottomLeftRadius: 4,
    };
  }
  return {
    ...base,
    bottom: -1,
    right: -1,
    borderWidth: `0 ${thick}px ${thick}px 0`,
    borderBottomRightRadius: 4,
  };
}

export const WIDGET_CARD_RADIUS = 10;
export const WIDGET_SELECT_BORDER = '1.5px solid #1677ff';
export const WIDGET_IDLE_BORDER = '1px solid #e8e8e8';
