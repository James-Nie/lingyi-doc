import type React from 'react';

export interface EditorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 单元格编辑器固定定位样式 */
export function getFixedCellStyle(rect: EditorRect): React.CSSProperties {
  return {
    position: 'fixed',
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    zIndex: 1000,
  };
}

/** 内联编辑器样式（详情抽屉等） */
export function getInlineEditorStyle(height?: number): React.CSSProperties {
  return {
    width: '100%',
    minHeight: height ?? 32,
  };
}

export function resolveEditorStyle(rect: EditorRect, inline?: boolean, height?: number): React.CSSProperties {
  return inline ? getInlineEditorStyle(height) : getFixedCellStyle(rect);
}

export function resolveBelowPopupStyle(rect: EditorRect, inline?: boolean, minWidth = 240): React.CSSProperties {
  if (inline) return getInlineEditorStyle();
  return getBelowCellPopupStyle(rect, minWidth);
}

/** 下拉面板宽度（相对单元格） */
export function getSelectPopupWidth(rect: EditorRect, minWidth = 160): number {
  return Math.max(rect.width, minWidth);
}

/** 下拉类编辑器面板定位 */
export function getDropdownPopupStyle(rect: EditorRect, minWidth = 160) {
  return {
    root: {
      width: getSelectPopupWidth(rect, minWidth),
      zIndex: 1001,
    },
  };
}

/** 单元格下方弹层定位 */
export function getBelowCellPopupStyle(rect: EditorRect, minWidth = 240) {
  return {
    position: 'fixed' as const,
    left: rect.x,
    top: rect.y + rect.height,
    width: Math.max(rect.width, minWidth),
    zIndex: 1000,
  };
}
