import type { MindmapElement, WhiteboardElement, WhiteboardViewport } from '@lingyi-doc/core-whiteboard';
import type { DocCommentAnchor, DocCommentThread } from '@lingyi-doc/core-doc';
import { findMindNode, WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT } from '@lingyi-doc/core-mindmap';
import { getWhiteboardCommentPin, truncateCommentQuote } from '@lingyi-doc/core-doc';
import { computeThemedMindMapLayout } from '@lingyi-doc/mind-map';
import { getShapeVisualBounds } from '../canvas/shapePaths';
import { hitElementAtPoint } from '../canvas/hitTest';
import { hitMindmapAtPoint } from '../canvas/mindmapHitTest';
import { elementBounds } from '../viewportUtils';
import { WB_COMMENT_PIN_SCREEN_SIZE } from './WbCommentPinIcon';

export { WB_COMMENT_PIN_SCREEN_SIZE };

const COMMENT_BINDABLE_TYPES = new Set([
  'shape',
  'image',
  'sticky',
  'text',
  'table',
  'section',
  'mindmap',
]);

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
  if (el.type === 'table') return '表格';
  if (el.type === 'section') return truncateCommentQuote(el.title?.trim() || '分区');
  return '画板元素';
}

export function resolveMindmapNodeQuote(node: { text?: string }): string {
  return truncateCommentQuote(node.text?.trim() || '节点');
}

export function getMindmapNodeWorldOrigin(
  el: MindmapElement,
  mindNodeId: string,
): { x: number; y: number } | null {
  const layout = computeThemedMindMapLayout(
    el.root,
    el.layout,
    el.branchStyle ?? WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT,
    'whiteboard',
  );
  const node = layout.nodes.find(n => n.id === mindNodeId);
  if (!node) return null;
  return { x: el.x + node.x, y: el.y + node.y };
}

export function resolveCommentBindOrigin(
  elements: WhiteboardElement[],
  elementId: string,
  mindNodeId?: string,
): { x: number; y: number } | null {
  const el = elements.find(item => item.id === elementId);
  if (!el) return null;
  if (el.type === 'mindmap' && mindNodeId) {
    return getMindmapNodeWorldOrigin(el as MindmapElement, mindNodeId) ?? { x: el.x, y: el.y };
  }
  return { x: el.x, y: el.y };
}

/** 有绑定偏移时按当前图形位置计算 pin，实现跟随移动 */
export function resolveLiveWhiteboardCommentPin(
  anchor: DocCommentAnchor,
  elements: WhiteboardElement[],
): { x: number; y: number } {
  if (
    anchor.elementId
    && typeof anchor.pinOffsetX === 'number'
    && typeof anchor.pinOffsetY === 'number'
  ) {
    const origin = resolveCommentBindOrigin(elements, anchor.elementId, anchor.mindNodeId);
    if (origin) {
      return {
        x: origin.x + anchor.pinOffsetX,
        y: origin.y + anchor.pinOffsetY,
      };
    }
  }
  return getWhiteboardCommentPin(anchor);
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

export interface CommentBindResult {
  elementId: string;
  mindNodeId?: string;
  quote: string;
  pinOffsetX: number;
  pinOffsetY: number;
}

/** 将评论点落到可绑定图形上 */
export function resolveCommentBindAtPoint(
  elements: WhiteboardElement[],
  pin: { x: number; y: number },
): CommentBindResult | null {
  const hit = hitElementAtPoint(elements, pin);
  if (!hit || !COMMENT_BINDABLE_TYPES.has(hit.type)) return null;

  if (hit.type === 'mindmap') {
    const mm = hit as MindmapElement;
    const mmHit = hitMindmapAtPoint(mm, pin);
    if (mmHit.kind === 'node' && mmHit.nodeId) {
      const origin = getMindmapNodeWorldOrigin(mm, mmHit.nodeId) ?? { x: mm.x, y: mm.y };
      const node = findMindNode(mm.root, mmHit.nodeId)?.node;
      return {
        elementId: mm.id,
        mindNodeId: mmHit.nodeId,
        quote: node ? resolveMindmapNodeQuote(node) : resolveWhiteboardElementQuote(mm),
        pinOffsetX: pin.x - origin.x,
        pinOffsetY: pin.y - origin.y,
      };
    }
    return {
      elementId: mm.id,
      quote: resolveWhiteboardElementQuote(mm),
      pinOffsetX: pin.x - mm.x,
      pinOffsetY: pin.y - mm.y,
    };
  }

  return {
    elementId: hit.id,
    quote: resolveWhiteboardElementQuote(hit),
    pinOffsetX: pin.x - hit.x,
    pinOffsetY: pin.y - hit.y,
  };
}

export function syncWhiteboardCommentPinsWithElements(
  threads: DocCommentThread[],
  elements: WhiteboardElement[],
): { threads: DocCommentThread[]; changedIds: string[] } {
  const changedIds: string[] = [];
  const next = threads.map(thread => {
    let anchor = thread.anchor;
    // 兼容旧数据：已绑定但无偏移时，按当前绝对坐标推算偏移
    if (
      anchor.elementId
      && (typeof anchor.pinOffsetX !== 'number' || typeof anchor.pinOffsetY !== 'number')
    ) {
      const origin = resolveCommentBindOrigin(elements, anchor.elementId, anchor.mindNodeId);
      if (origin) {
        anchor = {
          ...anchor,
          pinOffsetX: Math.round(anchor.start - origin.x),
          pinOffsetY: Math.round(anchor.end - origin.y),
        };
      }
    }
    if (!anchor.elementId) {
      return anchor === thread.anchor ? thread : { ...thread, anchor };
    }
    if (typeof anchor.pinOffsetX !== 'number' || typeof anchor.pinOffsetY !== 'number') {
      return anchor === thread.anchor ? thread : { ...thread, anchor };
    }
    const live = resolveLiveWhiteboardCommentPin(anchor, elements);
    const nextX = Math.round(live.x);
    const nextY = Math.round(live.y);
    if (
      nextX === thread.anchor.start
      && nextY === thread.anchor.end
      && anchor.pinOffsetX === thread.anchor.pinOffsetX
      && anchor.pinOffsetY === thread.anchor.pinOffsetY
    ) {
      return thread;
    }
    changedIds.push(thread.id);
    return {
      ...thread,
      anchor: {
        ...anchor,
        start: nextX,
        end: nextY,
      },
    };
  });
  return { threads: next, changedIds };
}

export function hitCommentPinThreadAtScreenPoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  viewport: WhiteboardViewport,
  threads: DocCommentThread[],
  elements: WhiteboardElement[] = [],
): string | null {
  const half = WB_COMMENT_PIN_SCREEN_SIZE / 2 + 4;
  for (let i = threads.length - 1; i >= 0; i -= 1) {
    const thread = threads[i];
    if (thread.resolved) continue;
    const pin = resolveLiveWhiteboardCommentPin(thread.anchor, elements);
    const screenX = rect.left + viewport.x + pin.x * viewport.zoom;
    const screenY = rect.top + viewport.y + pin.y * viewport.zoom;
    if (Math.abs(clientX - screenX) <= half && Math.abs(clientY - screenY) <= half) {
      return thread.id;
    }
  }
  return null;
}
