import type { ColumnType } from '@lingyi-doc/core-types';
import { drawStar, drawPaperclip } from './canvasShapes';

/** 在 canvas 上绘制字段类型图标（列头 / 分组列头） */
export function drawFieldTypeIcon(
  ctx: CanvasRenderingContext2D,
  type: ColumnType,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  const s = size;
  const x = cx - s / 2;
  const y = cy - s / 2;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (type) {
    case 'text': {
      ctx.font = `600 ${s * 0.55}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('A', cx, cy - s * 0.14);
      for (let i = 0; i < 3; i++) {
        const ly = cy + s * 0.08 + i * s * 0.16;
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.32, ly);
        ctx.lineTo(cx + s * 0.32, ly);
        ctx.stroke();
      }
      break;
    }
    case 'multilineText': {
      const rx = 1.5;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x + 1, y + 1, s - 2, s - 2, rx);
      } else {
        ctx.rect(x + 1, y + 1, s - 2, s - 2);
      }
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const ly = y + s * (0.32 + i * 0.2);
        ctx.beginPath();
        ctx.moveTo(x + s * 0.22, ly);
        ctx.lineTo(x + s * (i === 2 ? 0.62 : 0.78), ly);
        ctx.stroke();
      }
      break;
    }
    case 'select': {
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.14, cy - s * 0.02);
      ctx.lineTo(cx, cy + s * 0.16);
      ctx.lineTo(cx + s * 0.14, cy - s * 0.02);
      ctx.stroke();
      break;
    }
    case 'multiSelect': {
      for (let i = 0; i < 3; i++) {
        const rowY = y + s * 0.22 + i * s * 0.26;
        ctx.beginPath();
        ctx.arc(x + s * 0.18, rowY, s * 0.07, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + s * 0.32, rowY);
        ctx.lineTo(x + s * 0.82, rowY);
        ctx.stroke();
      }
      break;
    }
    case 'user':
    case 'createdBy':
    case 'updatedBy': {
      ctx.beginPath();
      ctx.arc(cx, y + s * 0.34, s * 0.18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, y + s * 0.92, s * 0.28, Math.PI, 0);
      ctx.stroke();
      if (type === 'createdBy') {
        ctx.beginPath();
        ctx.arc(x + s * 0.78, y + s * 0.78, s * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + s * 0.78, y + s * 0.66);
        ctx.lineTo(x + s * 0.78, y + s * 0.9);
        ctx.moveTo(x + s * 0.66, y + s * 0.78);
        ctx.lineTo(x + s * 0.9, y + s * 0.78);
        ctx.stroke();
      } else if (type === 'updatedBy') {
        ctx.beginPath();
        ctx.moveTo(x + s * 0.62, y + s * 0.88);
        ctx.lineTo(x + s * 0.88, y + s * 0.62);
        ctx.lineTo(x + s * 0.96, y + s * 0.7);
        ctx.lineTo(x + s * 0.7, y + s * 0.96);
        ctx.lineTo(x + s * 0.58, y + s * 0.98);
        ctx.closePath();
        ctx.stroke();
      }
      break;
    }
    case 'date':
    case 'datetime':
    case 'createdTime':
    case 'updatedTime': {
      const rx = 1.5;
      const inset = (type === 'createdTime' || type === 'updatedTime') ? s * 0.12 : 0;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x + 1 + inset * 0.2, y + 1 + inset * 0.2, s - 2 - inset, s - 2 - inset, rx);
      } else {
        ctx.rect(x + 1 + inset * 0.2, y + 1 + inset * 0.2, s - 2 - inset, s - 2 - inset);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 1 + inset * 0.2, y + s * 0.32);
      ctx.lineTo(x + s - 1 - inset * 0.8, y + s * 0.32);
      ctx.stroke();
      const dotR = s * 0.055;
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          ctx.beginPath();
          ctx.arc(
            x + s * (0.28 + col * 0.22),
            y + s * (0.48 + row * 0.22),
            dotR, 0, Math.PI * 2,
          );
          ctx.fill();
        }
      }
      if (type === 'createdTime') {
        ctx.beginPath();
        ctx.arc(x + s * 0.78, y + s * 0.78, s * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + s * 0.78, y + s * 0.66);
        ctx.lineTo(x + s * 0.78, y + s * 0.9);
        ctx.moveTo(x + s * 0.66, y + s * 0.78);
        ctx.lineTo(x + s * 0.9, y + s * 0.78);
        ctx.stroke();
      } else if (type === 'updatedTime') {
        ctx.beginPath();
        ctx.moveTo(x + s * 0.62, y + s * 0.88);
        ctx.lineTo(x + s * 0.88, y + s * 0.62);
        ctx.lineTo(x + s * 0.96, y + s * 0.7);
        ctx.lineTo(x + s * 0.7, y + s * 0.96);
        ctx.lineTo(x + s * 0.58, y + s * 0.98);
        ctx.closePath();
        ctx.stroke();
      }
      break;
    }
    case 'attachment': {
      drawPaperclip(ctx, cx, cy, s, color);
      break;
    }
    case 'number':
    case 'percent': {
      ctx.font = `600 ${s * 0.72}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(type === 'percent' ? '%' : '#', cx, cy + 0.5);
      break;
    }
    case 'boolean': {
      const bx = x + 1;
      const by = y + 1;
      const bs = s - 2;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(bx, by, bs, bs, 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(bx, by, bs, bs);
      }
      ctx.beginPath();
      ctx.moveTo(bx + bs * 0.22, cy);
      ctx.lineTo(bx + bs * 0.42, cy + bs * 0.22);
      ctx.lineTo(bx + bs * 0.78, cy - bs * 0.18);
      ctx.stroke();
      break;
    }
    case 'link': {
      const r = s * 0.2;
      ctx.beginPath();
      ctx.arc(x + s * 0.35, y + s * 0.62, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + s * 0.65, y + s * 0.38, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + s * 0.48, y + s * 0.48);
      ctx.lineTo(x + s * 0.52, y + s * 0.52);
      ctx.stroke();
      break;
    }
    case 'formula': {
      ctx.font = `600 ${s * 0.42}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('fx', cx, cy + 0.5);
      break;
    }
    case 'autoNumber': {
      for (let i = 0; i < 3; i++) {
        const rowY = y + s * 0.24 + i * s * 0.26;
        ctx.font = `500 ${s * 0.28}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), x + 1, rowY);
        ctx.beginPath();
        ctx.moveTo(x + s * 0.3, rowY);
        ctx.lineTo(x + s * 0.88, rowY);
        ctx.stroke();
      }
      break;
    }
    case 'phone': {
      ctx.beginPath();
      ctx.moveTo(x + s * 0.62, y + s * 0.12);
      ctx.lineTo(x + s * 0.62, y + s * 0.88);
      ctx.quadraticCurveTo(x + s * 0.62, y + s, x + s * 0.5, y + s);
      ctx.lineTo(x + s * 0.38, y + s);
      ctx.quadraticCurveTo(x + s * 0.26, y + s, x + s * 0.26, y + s * 0.88);
      ctx.lineTo(x + s * 0.26, y + s * 0.22);
      ctx.quadraticCurveTo(x + s * 0.26, y + s * 0.1, x + s * 0.38, y + s * 0.1);
      ctx.lineTo(x + s * 0.5, y + s * 0.1);
      ctx.quadraticCurveTo(x + s * 0.62, y + s * 0.1, x + s * 0.62, y + s * 0.22);
      ctx.stroke();
      break;
    }
    case 'email': {
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x + 1, y + s * 0.22, s - 2, s * 0.58, 1.5);
      } else {
        ctx.rect(x + 1, y + s * 0.22, s - 2, s * 0.58);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 1, y + s * 0.22);
      ctx.lineTo(cx, y + s * 0.52);
      ctx.lineTo(x + s - 1, y + s * 0.22);
      ctx.stroke();
      break;
    }
    case 'progress': {
      const pw = s * 0.88;
      const ph = s * 0.42;
      const px = cx - pw / 2;
      const py = cy - ph / 2;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(px, py, pw, ph, ph / 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(px, py, pw, ph);
      }
      ctx.save();
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(px, py, pw, ph, ph / 2);
      } else {
        ctx.rect(px, py, pw, ph);
      }
      ctx.clip();
      for (let i = -2; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(px + i * s * 0.18, py + ph);
        ctx.lineTo(px + i * s * 0.18 + s * 0.28, py);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'currency': {
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = `600 ${s * 0.48}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('¥', cx, cy + 0.5);
      break;
    }
    case 'rating': {
      const outerR = s * 0.42;
      drawStar(ctx, cx, cy, outerR, false, color);
      break;
    }
    default: {
      ctx.font = `${s * 0.6}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', cx, cy);
    }
  }

  ctx.restore();
}
