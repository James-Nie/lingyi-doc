import type { WhiteboardElement } from '@lingyi-doc/core';
import { drawElement } from './canvas/drawElements';
import { selectionBounds } from './elementActions';

const EXPORT_PADDING = 16;

export async function copyElementsAsImage(
  elements: WhiteboardElement[],
  ids: string[],
): Promise<boolean> {
  const bounds = selectionBounds(elements, ids);
  if (!bounds || bounds.w < 1 || bounds.h < 1) return false;

  const selected = new Set(ids);
  const sorted = [...elements]
    .filter(e => selected.has(e.id) && e.type !== 'mindmap' && e.type !== 'connector')
    .sort((a, b) => a.zIndex - b.zIndex);

  if (!sorted.length) return false;

  const w = Math.ceil(bounds.w + EXPORT_PADDING * 2);
  const h = Math.ceil(bounds.h + EXPORT_PADDING * 2);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.translate(EXPORT_PADDING - bounds.x, EXPORT_PADDING - bounds.y);

  for (const el of sorted) {
    drawElement(ctx, el, { allElements: elements });
  }

  const blob = await new Promise<Blob | null>(resolve => {
    canvas.toBlob(resolve, 'image/png');
  });
  if (!blob) return false;

  if (!navigator.clipboard?.write) return false;
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  return true;
}
