export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
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

/** 椭圆/胶囊形节点 */
export function ellipsePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.closePath();
}

export function drawNodeShape(
  ctx: CanvasRenderingContext2D,
  shapeKind: string,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 8,
): void {
  if (shapeKind === 'ellipse') {
    ellipsePath(ctx, x, y, w, h);
    return;
  }
  roundRectPath(ctx, x, y, w, h, radius);
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (!text) return [''];
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

export function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const lines = wrapTextLines(ctx, text, maxWidth);
  const totalH = lines.length * lineHeight;
  let y = cy - totalH / 2 + lineHeight / 2;
  for (const ln of lines) {
    ctx.fillText(ln, cx, y);
    y += lineHeight;
  }
}

export function drawAlignedNodeText(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: { x: number; y: number; width: number; height: number },
  opts: {
    lineHeight: number;
    padTop: number;
    padBottom: number;
    padLeft: number;
    padRight: number;
    textAlign: CanvasTextAlign;
    textVerticalAlign: 'top' | 'center' | 'bottom';
    lineThrough?: boolean;
  },
): void {
  const contentW = Math.max(1, box.width - opts.padLeft - opts.padRight);
  const lines = wrapTextLines(ctx, text, contentW);
  const totalH = lines.length * opts.lineHeight;
  const innerH = Math.max(0, box.height - opts.padTop - opts.padBottom);

  let startY = box.y + opts.padTop;
  if (opts.textVerticalAlign === 'center') {
    startY += Math.max(0, (innerH - totalH) / 2);
  } else if (opts.textVerticalAlign === 'bottom') {
    startY += Math.max(0, innerH - totalH);
  }

  ctx.textBaseline = 'middle';
  let y = startY + opts.lineHeight / 2;
  for (const line of lines) {
    let x = box.x + opts.padLeft;
    if (opts.textAlign === 'center') {
      x = box.x + box.width / 2;
    } else if (opts.textAlign === 'right') {
      x = box.x + box.width - opts.padRight;
    }
    ctx.fillText(line, x, y, contentW);
    if (opts.lineThrough) {
      drawLineThrough(ctx, line, x, y, opts.textAlign, contentW);
    }
    y += opts.lineHeight;
  }
}

/** 在已绘制的单行文字上画中划线 */
export function drawLineThrough(
  ctx: CanvasRenderingContext2D,
  text: string,
  anchorX: number,
  midY: number,
  textAlign: CanvasTextAlign,
  maxWidth: number,
): void {
  const w = Math.min(ctx.measureText(text).width, maxWidth);
  if (w <= 0) return;
  let left = anchorX;
  if (textAlign === 'center') left = anchorX - w / 2;
  else if (textAlign === 'right') left = anchorX - w;
  ctx.save();
  ctx.strokeStyle = typeof ctx.fillStyle === 'string' ? ctx.fillStyle : '#8F959E';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(left, midY);
  ctx.lineTo(left + w, midY);
  ctx.stroke();
  ctx.restore();
}
