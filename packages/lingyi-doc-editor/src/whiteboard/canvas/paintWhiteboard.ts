import type { WhiteboardElement, WhiteboardViewport } from '@lingyi-doc/core';
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
  hoveredId?: string | null;
}

export function paintWhiteboard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  opts: PaintOptions,
): void {
  const { elements, viewport, overlay, hideShapeTextIds, hoveredId } = opts;

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
    if (el.type === 'mindmap') continue;
    drawElement(ctx, el, {
      selected: overlay.selectedIds.includes(el.id),
      hovered: el.id === hoveredId,
      allElements: elements,
      hideShapeText: hideShapeTextIds?.has(el.id),
    });
  }

  drawOverlay(ctx, elements, { ...overlay, hoveredId });
  ctx.restore();
}

export function collectImageSrcs(elements: WhiteboardElement[]): string[] {
  return elements.filter(e => e.type === 'image').map(e => (e as { src: string }).src);
}

export function preloadElementImages(elements: WhiteboardElement[], onDone: () => void): void {
  preloadImages(collectImageSrcs(elements), onDone);
}

export { CANVAS_W, CANVAS_H };
