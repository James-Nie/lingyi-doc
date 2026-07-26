import type { MindmapElement, WhiteboardPoint } from '@lingyi-doc/core-whiteboard';
import { WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT } from '@lingyi-doc/core-mindmap';
import {
  getMindmapNodeImageScreenLayoutRect,
  getMindmapNodeRect,
  hitMindmapNode,
  MINDMAP_CONTENT_PADDING,
  type MindmapHitResult,
} from '@lingyi-doc/mind-map';

export function hitMindmapAtPoint(
  element: MindmapElement,
  pt: WhiteboardPoint,
): MindmapHitResult {
  const localX = pt.x - element.x;
  const localY = pt.y - element.y;
  return hitMindmapNode(
    element.root,
    element.layout,
    element.branchStyle ?? WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT,
    localX,
    localY,
    MINDMAP_CONTENT_PADDING,
    undefined,
    'whiteboard',
  );
}

export function hitMindmapNodeAtPoint(
  element: MindmapElement,
  pt: WhiteboardPoint,
): string | null {
  const hit = hitMindmapAtPoint(element, pt);
  return hit.kind === 'node' || hit.kind === 'nodeImage' ? hit.nodeId ?? null : null;
}

export function getMindmapNodeScreenBounds(
  element: MindmapElement,
  nodeId: string,
  viewport: { x: number; y: number; zoom: number },
): { x: number; y: number; w: number; h: number } | null {
  const rect = getMindmapNodeRect(
    element.root,
    element.layout,
    element.branchStyle ?? WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT,
    nodeId,
    MINDMAP_CONTENT_PADDING,
    undefined,
    'whiteboard',
  );
  if (!rect) return null;
  return {
    x: viewport.x + (element.x + rect.x) * viewport.zoom,
    y: viewport.y + (element.y + rect.y) * viewport.zoom,
    w: rect.width * viewport.zoom,
    h: rect.height * viewport.zoom,
  };
}

/** 节点内图片在屏幕上的包围盒（含画板视口变换） */
export function getMindmapNodeImageScreenBounds(
  element: MindmapElement,
  nodeId: string,
  viewport: { x: number; y: number; zoom: number },
): { x: number; y: number; w: number; h: number } | null {
  const rect = getMindmapNodeImageScreenLayoutRect(
    element.root,
    element.layout,
    element.branchStyle ?? WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT,
    nodeId,
    MINDMAP_CONTENT_PADDING,
    undefined,
    'whiteboard',
  );
  if (!rect) return null;
  return {
    x: viewport.x + (element.x + rect.x) * viewport.zoom,
    y: viewport.y + (element.y + rect.y) * viewport.zoom,
    w: rect.width * viewport.zoom,
    h: rect.height * viewport.zoom,
  };
}
