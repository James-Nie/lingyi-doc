import type { MindmapElement } from '@lingyi-doc/core';
import { computeMindMapLayout, createWhiteboardMeasureOptions, findMindNode, WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT } from '@lingyi-doc/core';
import { WB_MM_THEME } from '../mindmap/wbMindmapTheme';
import { resolveNodeAppearance } from './nodeStyle';
import { fullRoundRectPath } from './shapePaths';

/** 画板 Canvas 上绘制思维导图 */
export function drawMindmapElement(
  ctx: CanvasRenderingContext2D,
  element: MindmapElement,
  hovered: boolean,
  selected: boolean,
  activeNodeId?: string | null,
): { width: number; height: number } {
  const branchStyle = element.branchStyle ?? WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT;
  const layout = computeMindMapLayout(element.root, element.layout, branchStyle, createWhiteboardMeasureOptions());
  const lineColor = element.lineColor ?? WB_MM_THEME.line;

  ctx.save();
  ctx.translate(element.x, element.y);

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const path of layout.paths) {
    const p = new Path2D(path.d);
    ctx.stroke(p);
  }

  for (const ln of layout.nodes) {
    const node = findMindNode(element.root, ln.id)?.node;
    if (!node) continue;
    const appearance = resolveNodeAppearance(node, ln);
    const isActive = activeNodeId === ln.id;

    if (isActive) {
      ctx.strokeStyle = WB_MM_THEME.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (appearance.shapeKind === 'ellipse') {
        const pad = 2;
        fullRoundRectPath(ctx, ln.x - pad, ln.y - pad, ln.width + pad * 2, ln.height + pad * 2);
      } else {
        roundRect(ctx, ln.x - 2, ln.y - 2, ln.width + 4, ln.height + 4, 10);
      }
      ctx.stroke();
    }

    if (appearance.showBox && appearance.fillColor) {
      ctx.fillStyle = appearance.fillColor;
      ctx.strokeStyle = appearance.borderColor ?? WB_MM_THEME.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (appearance.shapeKind === 'ellipse') {
        fullRoundRectPath(ctx, ln.x, ln.y, ln.width, ln.height);
      } else {
        roundRect(ctx, ln.x, ln.y, ln.width, ln.height, 8);
      }
      ctx.fill();
      if (appearance.borderColor) ctx.stroke();
    }

    ctx.fillStyle = appearance.textColor;
    ctx.font = `${appearance.fontWeight} ${appearance.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = appearance.showBox ? 'center' : 'left';
    ctx.textBaseline = 'middle';
    const text = node.text || '输入文本';
    if (appearance.showBox) {
      wrapText(ctx, text, ln.x + ln.width / 2, ln.y + ln.height / 2, ln.width - 16, appearance.fontSize);
    } else {
      ctx.fillText(text, ln.x, ln.y + ln.height / 2, ln.width);
    }
  }

  ctx.restore();
  return { width: layout.width, height: layout.height };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxWidth: number,
  lineHeight: number,
) {
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    const test = line + ch;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const totalH = lines.length * lineHeight;
  let y = cy - totalH / 2 + lineHeight / 2;
  for (const ln of lines) {
    ctx.fillText(ln, cx, y);
    y += lineHeight;
  }
}
