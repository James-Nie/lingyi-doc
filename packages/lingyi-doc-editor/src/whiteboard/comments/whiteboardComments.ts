import type {
  DocCommentThread,
  MindmapElement,
  WhiteboardElement,
  WhiteboardViewport,
} from '@lingyi-doc/core';
import {
  findMindNode,
  getWhiteboardCommentPin,
  truncateCommentQuote,
  WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT,
} from '@lingyi-doc/core';
import { computeThemedMindMapLayout } from '@lingyi-doc/mind-map';
import { getShapeVisualBounds } from '../canvas/shapePaths';
import { elementBounds } from '../viewportUtils';
import { WB_COMMENT_PIN_SCREEN_SIZE } from './WbCommentPinIcon';

export { WB_COMMENT_PIN_SCREEN_SIZE };

export function defaultPinForBounds(bounds: { x: number; y: number; w: number; h: number }): {
  x: number;
  y: number;
} {
  // 水平居中，垂直位于图形上段（文本上方区域）
  return {
    x: bounds.x + bounds.w / 2,
    y: bounds.y + Math.max(14, bounds.h * 0.28),
  };
}

export function resolveWhiteboardElementQuote(el: WhiteboardElement): string {
  if (el.type === 'shape' || el.type === 'text' || el.type === 'sticky') {
    return truncateCommentQuote(el.text?.trim() || '图形');
  }
  if (el.type === 'image') return '图片';
  if (el.type === 'mindmap') {
    return truncateCommentQuote(el.root.text?.trim() || '思维导图');
  }
  return '画板元素';
}

export function resolveMindmapNodeQuote(node: { text?: string }): string {
  return truncateCommentQuote(node.text?.trim() || '节点');
}

export function defaultPinForElement(
  el: WhiteboardElement,
  mindNodeId?: string,
): { x: number; y: number } {
  if (el.type === 'mindmap' && mindNodeId) {
    const mm = el as MindmapElement;
    const layout = computeThemedMindMapLayout(
      mm.root,
      mm.layout,
      mm.branchStyle ?? WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT,
      'whiteboard',
    );
    const node = layout.nodes.find(n => n.id === mindNodeId);
    if (node) {
      return defaultPinForBounds({
        x: mm.x + node.x,
        y: mm.y + node.y,
        w: node.width,
        h: node.height,
      });
    }
    const found = findMindNode(mm.root, mindNodeId);
    if (found) {
      return defaultPinForBounds({ x: mm.x, y: mm.y, w: mm.width, h: mm.height });
    }
  }
  if (el.type === 'shape') {
    const vb = getShapeVisualBounds(el.shapeKind, el.x, el.y, el.width, el.height);
    return defaultPinForBounds(vb);
  }
  return defaultPinForBounds(elementBounds(el));
}

export function hitCommentPinThreadAtScreenPoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  viewport: WhiteboardViewport,
  threads: DocCommentThread[],
): string | null {
  const half = WB_COMMENT_PIN_SCREEN_SIZE / 2 + 4;
  for (let i = threads.length - 1; i >= 0; i -= 1) {
    const thread = threads[i];
    if (thread.resolved) continue;
    const pin = getWhiteboardCommentPin(thread.anchor);
    const screenX = rect.left + viewport.x + pin.x * viewport.zoom;
    const screenY = rect.top + viewport.y + pin.y * viewport.zoom;
    if (Math.abs(clientX - screenX) <= half && Math.abs(clientY - screenY) <= half) {
      return thread.id;
    }
  }
  return null;
}
