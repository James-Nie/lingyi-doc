import type { WhiteboardElement, WhiteboardViewport } from '@lingyi-doc/core-whiteboard';
import type { MindmapElement } from '@lingyi-doc/core-whiteboard';
import { WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT } from '@lingyi-doc/core-mindmap';
import {
  collectMindmapImageSrcs,
  MINDMAP_CONTENT_PADDING,
  paintMindmap,
  preloadMindmapImages,
} from '@lingyi-doc/mind-map';
import { drawElement } from './drawElements';
import { drawOverlay, type OverlayState } from './drawOverlay';
import { preloadImages } from './imageCache';

const CANVAS_W = 8000;
const CANVAS_H = 6000;

export interface PaintOptions {
  elements: WhiteboardElement[];
  viewport: WhiteboardViewport;
  overlay: OverlayState;
  hideShapeTextIds?: Set<string>;
  hideConnectorLabelIds?: Set<string>;
  /** tableId -> { row, col } 内联编辑中隐藏的单元格 */
  hideTableCells?: Map<string, { row: number; col: number }>;
  hoveredId?: string | null;
  /** 画板思维导图编辑态：elementId -> activeNodeId */
  mindmapActiveNodes?: Map<string, string | null>;
  /** 画板思维导图：elementId -> 隐藏文本的节点（内联编辑中） */
  mindmapHideTextNodes?: Map<string, string | null>;
  /** 画板思维导图：elementId -> hover 中的折叠按钮节点 */
  mindmapHoveredCollapse?: Map<string, string | null>;
}

export function paintWhiteboard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  opts: PaintOptions,
): void {
  const {
    elements,
    viewport,
    overlay,
    hideShapeTextIds,
    hideConnectorLabelIds,
    hideTableCells,
    hoveredId,
    mindmapActiveNodes,
    mindmapHideTextNodes,
    mindmapHoveredCollapse,
  } = opts;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(viewport.x, viewport.y);
  ctx.scale(viewport.zoom, viewport.zoom);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);
  for (const el of sorted) {
    if (el.type === 'mindmap') {
      const mm = el as MindmapElement;
      ctx.save();
      ctx.translate(mm.x, mm.y);
      paintMindmap(ctx, {
        root: mm.root,
        options: {
          structure: mm.layout,
          branchStyle: mm.branchStyle ?? WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT,
          themeId: 'whiteboard',
          contentPadding: MINDMAP_CONTENT_PADDING,
        },
      }, {
        selected: overlay.selectedIds.includes(mm.id),
        hovered: mm.id === hoveredId,
        activeNodeId: mindmapActiveNodes?.get(mm.id) ?? null,
        hideNodeTextId: mindmapHideTextNodes?.get(mm.id) ?? null,
        hoveredCollapseNodeId: mindmapHoveredCollapse?.get(mm.id) ?? null,
      });
      ctx.restore();
      continue;
    }
    drawElement(ctx, el, {
      selected: overlay.selectedIds.includes(el.id),
      hovered: el.id === hoveredId,
      allElements: elements,
      hideShapeText: hideShapeTextIds?.has(el.id),
      hideConnectorLabel: hideConnectorLabelIds?.has(el.id),
      hideTableCell: hideTableCells?.get(el.id) ?? null,
    });
  }

  drawOverlay(ctx, elements, { ...overlay, hoveredId });
  ctx.restore();
}

export function collectImageSrcs(elements: WhiteboardElement[]): string[] {
  return elements.filter(e => e.type === 'image').map(e => (e as { src: string }).src);
}

export function preloadElementImages(elements: WhiteboardElement[], onDone: () => void): void {
  let pending = 0;
  const done = () => {
    pending--;
    if (pending <= 0) onDone();
  };

  const imageSrcs = collectImageSrcs(elements);
  if (imageSrcs.length) {
    pending++;
    preloadImages(imageSrcs, done);
  }
  for (const el of elements) {
    if (el.type !== 'mindmap') continue;
    pending++;
    preloadMindmapImages(collectMindmapImageSrcs((el as MindmapElement).root), done);
  }
  if (pending === 0) onDone();
}

export { CANVAS_W, CANVAS_H };
