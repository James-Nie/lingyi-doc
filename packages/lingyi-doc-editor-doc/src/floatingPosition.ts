export interface FloatingPosition {
  top: number;
  left: number;
}

export interface FloatingSize {
  width: number;
  height: number;
}

/** 计算浮层位置，避免超出视口 */
export function computeFloatingPosition(
  anchorRect: DOMRect,
  panelSize: FloatingSize,
  options?: {
    gap?: number;
    margin?: number;
    /** 默认在锚点右侧展开；空间不足时翻到左侧 */
    placement?: 'right' | 'bottom';
  },
): FloatingPosition {
  const gap = options?.gap ?? 4;
  const margin = options?.margin ?? 8;
  const placement = options?.placement ?? 'right';
  const { width: pw, height: ph } = panelSize;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left: number;
  let top: number;

  if (placement === 'bottom') {
    left = anchorRect.left;
    top = anchorRect.bottom + gap;
    if (left + pw > vw - margin) {
      left = Math.max(margin, vw - pw - margin);
    }
    if (top + ph > vh - margin) {
      top = anchorRect.top - ph - gap;
    }
  } else {
    left = anchorRect.right + gap;
    top = anchorRect.top;
    if (left + pw > vw - margin) {
      const leftSide = anchorRect.left - pw - gap;
      left = leftSide >= margin ? leftSide : Math.max(margin, vw - pw - margin);
    }
    if (top + ph > vh - margin) {
      top = Math.max(margin, vh - ph - margin);
    }
  }

  left = Math.max(margin, Math.min(left, vw - pw - margin));
  top = Math.max(margin, Math.min(top, vh - ph - margin));

  return { top, left };
}
