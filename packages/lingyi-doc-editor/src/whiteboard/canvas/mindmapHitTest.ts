import type { MindmapElement, WhiteboardPoint } from '@lingyi-doc/core';
import { computeMindMapLayout } from '@lingyi-doc/core';
import { SMM_EMBED_PADDING } from '../mindmap/syncMindmapBounds';

export function hitMindmapNodeAtPoint(
  element: MindmapElement,
  pt: WhiteboardPoint,
): string | null {
  const layout = computeMindMapLayout(
    element.root,
    element.layout,
    element.branchStyle ?? 'straight',
  );
  const lx = pt.x - element.x - SMM_EMBED_PADDING;
  const ly = pt.y - element.y - SMM_EMBED_PADDING;
  const sorted = [...layout.nodes].sort((a, b) => b.depth - a.depth);
  for (const n of sorted) {
    if (lx >= n.x && lx <= n.x + n.width && ly >= n.y && ly <= n.y + n.height) {
      return n.id;
    }
  }
  return null;
}

export function getMindmapNodeScreenBounds(
  element: MindmapElement,
  nodeId: string,
  viewport: { x: number; y: number; zoom: number },
): { x: number; y: number; w: number; h: number } | null {
  const layout = computeMindMapLayout(
    element.root,
    element.layout,
    element.branchStyle ?? 'straight',
  );
  const node = layout.nodes.find(n => n.id === nodeId);
  if (!node) return null;
  return {
    x: viewport.x + (element.x + SMM_EMBED_PADDING + node.x) * viewport.zoom,
    y: viewport.y + (element.y + SMM_EMBED_PADDING + node.y) * viewport.zoom,
    w: node.width * viewport.zoom,
    h: node.height * viewport.zoom,
  };
}
