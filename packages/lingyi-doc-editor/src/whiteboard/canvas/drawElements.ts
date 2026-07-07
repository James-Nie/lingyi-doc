import type {
  ConnectorElement,
  PenElement,
  SectionElement,
  ShapeElement,
  StickyElement,
  TableElement,
  TextElement,
  WhiteboardElement,
  WhiteboardPoint,
} from '@lingyi-doc/core';
import { connectorPathD } from '@lingyi-doc/core';
import { getBoardConnectorEndpoints, getBoardConnectorRoute } from '../boardConnector';
import { WB_COLORS } from '../styles';
import { getCachedImage } from './imageCache';
import { drawShapeBody, getShapeTextBounds, getShapeVisualBounds } from './shapePaths';
import {
  computeShapeTextStartY,
  drawShapeTextDecorations,
  lineOriginX,
  shapeCanvasFont,
  textCanvasFont,
} from './shapeTextStyle';

export interface DrawElementOptions {
  selected?: boolean;
  hovered?: boolean;
  allElements?: WhiteboardElement[];
  hideShapeText?: boolean;
}

export function drawElement(
  ctx: CanvasRenderingContext2D,
  element: WhiteboardElement,
  opts: DrawElementOptions = {},
): void {
  const { selected = false, hovered = false, allElements = [], hideShapeText = false } = opts;

  if (element.type === 'mindmap') {
    return;
  }

  if (element.type === 'connector') {
    drawConnector(ctx, element as ConnectorElement, allElements, selected, hovered);
    return;
  }

  if (element.type === 'pen') {
    drawPen(ctx, element as PenElement, selected, hovered);
    return;
  }

  ctx.save();
  applyElementTransform(ctx, element);

  const isShape = element.type === 'shape';
  if (hovered && !selected && !isShape) {
    ctx.shadowColor = `${WB_COLORS.accent}55`;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `${WB_COLORS.accent}55`;
    ctx.lineWidth = 2;
    ctx.strokeRect(element.x - 1, element.y - 1, element.width + 2, element.height + 2);
  }
  if (selected && !isShape && !hideShapeText) {
    ctx.strokeStyle = WB_COLORS.selectBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(element.x - 1, element.y - 1, element.width + 2, element.height + 2);
  }

  switch (element.type) {
    case 'shape':
      drawShape(ctx, element as ShapeElement, hideShapeText);
      break;
    case 'text':
      if (!hideShapeText) drawText(ctx, element as TextElement);
      break;
    case 'sticky':
      drawSticky(ctx, element as StickyElement);
      break;
    case 'section':
      drawSection(ctx, element as SectionElement);
      break;
    case 'table':
      drawTable(ctx, element as TableElement);
      break;
    case 'image':
      drawImageEl(ctx, element as { x: number; y: number; width: number; height: number; src: string });
      break;
    default:
      break;
  }
  ctx.restore();
}

function applyElementTransform(
  ctx: CanvasRenderingContext2D,
  el: WhiteboardElement,
): void {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  ctx.translate(cx, cy);
  if (el.rotation) ctx.rotate((el.rotation * Math.PI) / 180);
  const sx = el.flipX ? -1 : 1;
  const sy = el.flipY ? -1 : 1;
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.translate(-cx, -cy);
}

function drawShape(ctx: CanvasRenderingContext2D, el: ShapeElement, hideText = false) {
  const { x, y, width: w, height: h } = el;
  drawShapeBody(ctx, el.shapeKind, x, y, w, h, el.fill, el.stroke, el.strokeWidth);

  if (el.text && !hideText) {
    const tb = getShapeTextBounds(el.shapeKind, x, y, w, h);
    drawShapeText(ctx, el, tb);
  }
}

function drawShapeText(
  ctx: CanvasRenderingContext2D,
  el: ShapeElement,
  bounds: { x: number; y: number; w: number; h: number },
) {
  const { x, y, w, h } = bounds;
  const fontSize = el.fontSize ?? 14;
  const lineHeight = fontSize * 1.35;
  const textColor = el.textColor ?? '#1f2329';
  const align = el.textAlign ?? 'center';
  const vAlign = el.textVerticalAlign ?? 'center';
  const pad = 12;

  ctx.font = shapeCanvasFont(el, fontSize);
  ctx.textBaseline = 'middle';

  const lines = el.text!.split('\n');
  const totalH = lines.length * lineHeight;
  let cy = computeShapeTextStartY(y, h, totalH, lineHeight, vAlign, pad);

  for (const ln of lines) {
    ctx.textAlign = align;
    const tx = align === 'left' ? x + pad : align === 'right' ? x + w - pad : x + w / 2;
    const metrics = ctx.measureText(ln);
    const textW = Math.min(metrics.width, w - pad * 2);
    const lineX = lineOriginX(align, x, w, pad, textW, tx);

    if (el.textHighlight && ln.trim()) {
      const lineIdx = lines.indexOf(ln);
      const hl = el.textLineHighlights?.[lineIdx] ?? el.textHighlight;
      ctx.fillStyle = hl;
      ctx.fillRect(lineX - 2, cy - fontSize * 0.65, textW + 4, fontSize * 1.25);
    }

    ctx.fillStyle = textColor;
    ctx.fillText(ln, tx, cy, w - pad * 2);
    drawShapeTextDecorations(ctx, el, {
      lineX,
      textWidth: textW,
      cy,
      fontSize,
      textColor,
    });
    cy += lineHeight;
  }
}

function drawText(ctx: CanvasRenderingContext2D, el: TextElement) {
  const { x, y, width: w, height: h } = el;
  const fontSize = el.fontSize;
  const lineHeight = fontSize * 1.35;
  const textColor = el.color ?? '#1f2329';
  const align = el.textAlign ?? 'left';
  const vAlign = el.textVerticalAlign ?? 'top';
  const pad = 4;

  ctx.font = textCanvasFont(el);
  ctx.textBaseline = 'middle';

  const rawLines = el.text.split('\n');
  const lines: string[] = [];
  for (const ln of rawLines) {
    lines.push(...wrapLines(ctx, ln, w - pad * 2));
  }
  if (!lines.length) lines.push('');

  const totalH = lines.length * lineHeight;
  let cy = computeShapeTextStartY(y, h, totalH, lineHeight, vAlign, pad);

  for (const ln of lines) {
    ctx.textAlign = align;
    const tx = align === 'left' ? x + pad : align === 'right' ? x + w - pad : x + w / 2;
    const metrics = ctx.measureText(ln);
    const textW = Math.min(metrics.width, w - pad * 2);
    const lineX = lineOriginX(align, x, w, pad, textW, tx);

    if (el.textHighlight && ln.trim()) {
      ctx.fillStyle = el.textHighlight;
      ctx.fillRect(lineX - 2, cy - fontSize * 0.65, textW + 4, fontSize * 1.25);
    }

    ctx.fillStyle = textColor;
    ctx.fillText(ln, tx, cy, w - pad * 2);
    drawShapeTextDecorations(ctx, el, {
      lineX,
      textWidth: textW,
      cy,
      fontSize,
      textColor,
    });
    cy += lineHeight;
  }
}

function drawSticky(ctx: CanvasRenderingContext2D, el: StickyElement) {
  ctx.fillStyle = el.color;
  roundRectPath(ctx, el.x, el.y, el.width, el.height, 4);
  ctx.fill();
  ctx.fillStyle = '#1f2329';
  ctx.font = '14px -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  drawMultilineText(ctx, el.text || '便签', el.x + 12, el.y + 12, el.width - 24, 18);
}

function drawSection(ctx: CanvasRenderingContext2D, el: SectionElement) {
  ctx.fillStyle = el.fill;
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = el.stroke;
  ctx.lineWidth = 2;
  roundRectPath(ctx, el.x, el.y, el.width, el.height, 4);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = WB_COLORS.muted;
  ctx.font = '500 12px -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(el.title, el.x + 12, el.y + 8);
}

function drawTable(ctx: CanvasRenderingContext2D, el: TableElement) {
  const rows = el.cells.length;
  const cols = el.cells[0]?.length ?? 1;
  const cellH = el.height / rows;
  const cellW = el.width / cols;
  ctx.strokeStyle = '#dee0e3';
  ctx.lineWidth = 1;
  ctx.font = '12px -apple-system, sans-serif';
  ctx.fillStyle = '#1f2329';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let ri = 0; ri < rows; ri++) {
    for (let ci = 0; ci < cols; ci++) {
      const cx = el.x + ci * cellW;
      const cy = el.y + ri * cellH;
      ctx.strokeRect(cx, cy, cellW, cellH);
      const cell = el.cells[ri][ci];
      if (cell) ctx.fillText(cell, cx + 6, cy + cellH / 2, cellW - 12);
    }
  }
}

function drawImageEl(
  ctx: CanvasRenderingContext2D,
  el: { x: number; y: number; width: number; height: number; src: string },
) {
  const img = getCachedImage(el.src);
  if (img) {
    ctx.drawImage(img, el.x, el.y, el.width, el.height);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(el.x, el.y, el.width, el.height);
    ctx.strokeStyle = '#dee0e3';
    ctx.strokeRect(el.x, el.y, el.width, el.height);
  }
}

function drawConnector(
  ctx: CanvasRenderingContext2D,
  conn: ConnectorElement,
  allElements: WhiteboardElement[],
  selected: boolean,
  hovered: boolean,
) {
  const [a, b] = getBoardConnectorEndpoints(conn, allElements);
  if (!a || !b) return;
  const route = getBoardConnectorRoute(conn, allElements);
  const pathD = connectorPathD(conn.style, a, b, route);
  const p = new Path2D(pathD);

  if (selected) {
    ctx.strokeStyle = `${WB_COLORS.selectBorder}55`;
    ctx.lineWidth = conn.strokeWidth + 6;
    ctx.lineJoin = conn.style === 'elbow' ? 'round' : 'miter';
    ctx.stroke(p);
  }
  ctx.strokeStyle = hovered ? WB_COLORS.accent : conn.stroke;
  ctx.lineWidth = conn.strokeWidth;
  ctx.lineJoin = conn.style === 'elbow' ? 'round' : 'miter';
  ctx.stroke(p);

  if (conn.arrowEnd) {
    const tipDir = connectorTipDirection(conn, route);
    drawArrowHead(ctx, tipDir.from, tipDir.to, conn.stroke, conn.strokeWidth);
  }
}

/** 连接线箭头方向：折线/曲线取末段切线方向 */
function connectorTipDirection(
  conn: ConnectorElement,
  route: WhiteboardPoint[],
): { from: WhiteboardPoint; to: WhiteboardPoint } {
  const end = route[route.length - 1];
  if (conn.style === 'elbow' && route.length >= 2) {
    const prev = route[route.length - 2];
    return { from: prev, to: end };
  }
  if (conn.style === 'curve') {
    const a = route[0];
    const b = end;
    const cx = (a.x + b.x) / 2;
    const t = 0.92;
    const u = 1 - t;
    const near = {
      x: u * u * a.x + 2 * u * t * cx + t * t * b.x,
      y: u * u * a.y + 2 * u * t * a.y + t * t * b.y,
    };
    return { from: near, to: b };
  }
  return { from: route[0], to: end };
}

function drawPen(
  ctx: CanvasRenderingContext2D,
  pen: PenElement,
  selected: boolean,
  hovered: boolean,
) {
  if (pen.points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pen.points[0].x, pen.points[0].y);
  for (let i = 1; i < pen.points.length; i++) {
    ctx.lineTo(pen.points[i].x, pen.points[i].y);
  }
  if (selected || hovered) {
    ctx.strokeStyle = `${WB_COLORS.selectBorder}55`;
    ctx.lineWidth = pen.strokeWidth + 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  ctx.strokeStyle = pen.mode === 'highlighter' ? `${pen.color}88` : pen.color;
  ctx.lineWidth = pen.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = pen.mode === 'highlighter' ? 0.5 : 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  from: WhiteboardPoint,
  to: WhiteboardPoint,
  color: string,
  size: number,
) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const len = Math.max(10, size * 3.2);
  const wing = 0.42;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.5, size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(to.x - len * Math.cos(angle - wing), to.y - len * Math.sin(angle - wing));
  ctx.lineTo(to.x, to.y);
  ctx.lineTo(to.x - len * Math.cos(angle + wing), to.y - len * Math.sin(angle + wing));
  ctx.stroke();
}

function roundRectPath(
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

function wrapTextCenter(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxWidth: number,
  lineHeight: number,
) {
  const lines = wrapLines(ctx, text, maxWidth);
  const totalH = lines.length * lineHeight;
  let y = cy - totalH / 2 + lineHeight / 2;
  for (const ln of lines) {
    ctx.fillText(ln, cx, y);
    y += lineHeight;
  }
}

function drawMultilineText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const lines = text.split('\n');
  let cy = y;
  for (const ln of lines) {
    const wrapped = wrapLines(ctx, ln, maxWidth);
    for (const w of wrapped) {
      ctx.fillText(w, x, cy);
      cy += lineHeight;
    }
  }
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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
  return lines.length ? lines : [''];
}

export { roundRectPath, wrapLines };
