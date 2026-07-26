import type { ShapeElement, TextElement } from '@lingyi-doc/core-whiteboard';

export type ShapeTextVerticalAlign = 'top' | 'center' | 'bottom';

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export function shapeCanvasFont(el: ShapeElement, fontSize?: number): string {
  const fs = fontSize ?? el.fontSize ?? 14;
  const style = el.fontStyle ?? 'normal';
  const weight = el.fontWeight ?? 400;
  return `${style} ${weight} ${fs}px ${FONT_FAMILY}`;
}

export interface TextDecorationFields {
  textUnderline?: boolean;
  textLineThrough?: boolean;
}

export function textDecorationCss(el: TextDecorationFields): string | undefined {
  const parts: string[] = [];
  if (el.textUnderline) parts.push('underline');
  if (el.textLineThrough) parts.push('line-through');
  return parts.length ? parts.join(' ') : undefined;
}

export function shapeTextDecorationCss(el: ShapeElement): string | undefined {
  return textDecorationCss(el);
}

export function textCanvasFont(el: TextElement): string {
  const style = el.fontStyle ?? 'normal';
  const weight = el.fontWeight ?? 400;
  return `${style} ${weight} ${el.fontSize}px ${FONT_FAMILY}`;
}

export function computeShapeTextStartY(
  y: number,
  h: number,
  totalH: number,
  lineHeight: number,
  vAlign: ShapeTextVerticalAlign,
  pad: number,
): number {
  if (vAlign === 'top') return y + pad + lineHeight / 2;
  if (vAlign === 'bottom') return y + h - pad - totalH + lineHeight / 2;
  return y + h / 2 - totalH / 2 + lineHeight / 2;
}

/** 与 canvas drawShapeText 一致的内边距（相对 bounds 顶部，世界坐标） */
export function computeShapeEditorPaddingTop(
  h: number,
  totalH: number,
  vAlign: ShapeTextVerticalAlign,
  pad: number,
): number {
  if (vAlign === 'top') return pad;
  if (vAlign === 'bottom') return h - pad - totalH;
  return h / 2 - totalH / 2;
}

export function lineOriginX(
  align: 'left' | 'center' | 'right',
  x: number,
  w: number,
  pad: number,
  textWidth: number,
  tx: number,
): number {
  if (align === 'center') return tx - textWidth / 2;
  if (align === 'right') return tx - textWidth;
  return tx;
}

export function drawShapeTextDecorations(
  ctx: CanvasRenderingContext2D,
  el: TextDecorationFields,
  opts: {
    lineX: number;
    textWidth: number;
    cy: number;
    fontSize: number;
    textColor: string;
  },
): void {
  const { lineX, textWidth, cy, fontSize, textColor } = opts;
  if (!el.textUnderline && !el.textLineThrough) return;
  ctx.save();
  ctx.strokeStyle = textColor;
  ctx.lineWidth = Math.max(1, fontSize * 0.06);
  ctx.beginPath();
  if (el.textUnderline) {
    const uy = cy + fontSize * 0.35;
    ctx.moveTo(lineX, uy);
    ctx.lineTo(lineX + textWidth, uy);
  }
  if (el.textLineThrough) {
    ctx.moveTo(lineX, cy);
    ctx.lineTo(lineX + textWidth, cy);
  }
  ctx.stroke();
  ctx.restore();
}
