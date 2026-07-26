/**
 * 共享的 Canvas 基础图形绘制函数
 * 供 fieldTypeIcons.ts（列头图标）和 BaseCellRenderer.ts（单元格内容）复用
 */

/** 绘制五角星 */
export function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  filled: boolean,
  color: string,
): void {
  const innerR = outerR * 0.4;
  const points = 5;

  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  if (filled) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}

/** 绘制回形针/附件图标 */
export function drawPaperclip(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  const scale = size / 18;
  const ox = cx - 9 * scale;
  const oy = cy - 8 * scale;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(ox + 10.5 * scale, oy + 3.5 * scale);
  ctx.lineTo(ox + 6 * scale, oy + 8.5 * scale);
  ctx.arc(ox + 7.2 * scale, oy + 8.5 * scale, 2.2 * scale, Math.PI, 0, true);
  ctx.lineTo(ox + 9.5 * scale, oy + 11.5 * scale);
  ctx.lineTo(ox + 11 * scale, oy + 10 * scale);
  ctx.arc(ox + 12.2 * scale, oy + 10 * scale, 2.2 * scale, Math.PI, 0, true);
  ctx.lineTo(ox + 13.5 * scale, oy + 7.5 * scale);
  ctx.lineTo(ox + 9 * scale, oy + 3 * scale);
  ctx.stroke();

  ctx.restore();
}

/** 绘制进度条轨道 */
export function drawProgressRail(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  railColor: string,
): void {
  ctx.fillStyle = railColor;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.rect(x, y, width, height);
  }
  ctx.fill();
}

/** 绘制进度条填充 */
export function drawProgressFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillColor: string,
): void {
  if (width <= 0) return;
  const fillRadius = Math.min(radius, width / 2);
  ctx.fillStyle = fillColor;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, fillRadius);
  } else {
    ctx.rect(x, y, width, height);
  }
  ctx.fill();
}

/** 绘制圆形复选框 */
export function drawCircleCheckbox(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  checked: boolean,
  color: string,
): void {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  if (checked) {
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/** 绘制方框复选框 */
export function drawRectCheckbox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  checked: boolean,
  color: string,
): void {
  const r = 2;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, size, size, r);
  } else {
    ctx.rect(x, y, size, size);
  }
  if (checked) {
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  if (checked) {
    ctx.beginPath();
    ctx.moveTo(x + size * 0.22, y + size * 0.5);
    ctx.lineTo(x + size * 0.42, y + size * 0.7);
    ctx.lineTo(x + size * 0.78, y + size * 0.3);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}
