import type { MindMapLayoutNode, MindNoteStructure } from '@lingyi-doc/core-mindmap';
import {
  COLLAPSE_BTN_GAP,
  COLLAPSE_BTN_SIZE,
  getMindmapCollapseRect,
  resolveMindmapGrowDirection,
} from './mindmapNodeChrome';

export { COLLAPSE_BTN_GAP, COLLAPSE_BTN_SIZE } from './mindmapNodeChrome';

/** 折叠按钮位置（布局坐标系） */
export function getCollapseButtonRect(
  ln: MindMapLayoutNode,
  structure: MindNoteStructure,
): { x: number; y: number; width: number; height: number } | null {
  return getMindmapCollapseRect(ln, structure);
}

export function drawCollapseButton(
  ctx: CanvasRenderingContext2D,
  ln: MindMapLayoutNode,
  structure: MindNoteStructure,
  accent: string,
  hovered = false,
): void {
  const rect = getCollapseButtonRect(ln, structure);
  if (!rect) return;

  const { x, y, width, height } = rect;
  const collapsed = !!ln.collapsed;
  const count = ln.childCount ?? 0;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const r = width / 2 - 1;
  const dir = resolveMindmapGrowDirection(ln, structure);

  ctx.save();
  ctx.shadowColor = 'rgba(31, 35, 41, 0.12)';
  ctx.shadowBlur = hovered ? 6 : 3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = hovered ? '#F0F4FF' : '#FFFFFF';
  ctx.strokeStyle = hovered ? accent : accent;
  ctx.lineWidth = hovered ? 2 : 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = 'transparent';

  ctx.fillStyle = accent;
  ctx.font = `600 ${collapsed && count > 9 ? 9 : 11}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (collapsed) {
    ctx.fillText(String(Math.min(count, 99)), cx, cy + 0.5);
  } else if (dir === 'down') {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 3.5, cy + 1.5);
    ctx.lineTo(cx, cy - 2.5);
    ctx.lineTo(cx + 3.5, cy + 1.5);
    ctx.stroke();
  } else if (dir === 'up') {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 3.5, cy - 1.5);
    ctx.lineTo(cx, cy + 2.5);
    ctx.lineTo(cx + 3.5, cy - 1.5);
    ctx.stroke();
  } else if (dir === 'left') {
    ctx.beginPath();
    ctx.moveTo(cx - 2, cy);
    ctx.lineTo(cx + 2.5, cy - 3.5);
    ctx.lineTo(cx + 2.5, cy + 3.5);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx + 2, cy);
    ctx.lineTo(cx - 2.5, cy - 3.5);
    ctx.lineTo(cx - 2.5, cy + 3.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function hitCollapseButton(
  lx: number,
  ly: number,
  nodes: MindMapLayoutNode[],
  structure: MindNoteStructure,
): string | null {
  const sorted = [...nodes].sort((a, b) => b.depth - a.depth);
  for (const ln of sorted) {
    const rect = getCollapseButtonRect(ln, structure);
    if (!rect) continue;
    if (lx >= rect.x && lx <= rect.x + rect.width && ly >= rect.y && ly <= rect.y + rect.height) {
      return ln.id;
    }
  }
  return null;
}
