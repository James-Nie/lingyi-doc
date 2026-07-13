import {
  GROUP_BOX_GAP,
  GROUP_BOX_RADIUS,
  GROUP_INDENT_STEP,
  type GroupBoxRange,
  type GroupLayoutItem,
} from '../utils/recordGrouping';

export interface DrawGroupBoxesOptions {
  /** 卡片左缘（屏幕 px），与 corner 复选框列头左边界对齐（x=0） */
  cardLeft: number;
  gridRight: number;
  rowHeights: Map<number, number>;
  defaultRowHeight: number;
  zoom: number;
  getRowScreenTop: (row: number, rowHeights: Map<number, number>) => number;
  items?: GroupLayoutItem[];
}

export class GroupBoxRenderer {
  drawGroupBoxes(
    ctx: CanvasRenderingContext2D,
    ranges: GroupBoxRange[],
    options: DrawGroupBoxesOptions,
  ): void {
    const { cardLeft, gridRight, rowHeights, defaultRowHeight, zoom, getRowScreenTop, items } = options;

    const sortedRanges = [...ranges].sort((a, b) => a.level - b.level);

    for (const range of sortedRanges) {
      if (range.endRow < range.startRow) continue;

      const top = getRowScreenTop(range.startRow, rowHeights);
      let bottom = top;
      for (let r = range.startRow; r <= range.endRow; r++) {
        if (items?.[r]?.type === 'group-gap') continue;
        const h = rowHeights.get(r) ?? defaultRowHeight;
        bottom += h * zoom;
      }

      const gap = GROUP_BOX_GAP * zoom;
      const levelIndent = range.level * GROUP_INDENT_STEP * zoom;
      const x = cardLeft + levelIndent;
      const y = top + (range.level === 0 ? gap * 0.5 : 0);
      const w = Math.max(0, gridRight - x);
      const h = Math.max(0, bottom - top - (range.level === 0 ? gap : 0));

      if (w <= 4 || h <= 4) continue;

      ctx.save();
      if (range.level === 0) {
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#DEE0E3';
        ctx.lineWidth = 1;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.06)';
        ctx.shadowBlur = 8 * zoom;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 1 * zoom;
      } else {
        ctx.fillStyle = '#FAFBFC';
        ctx.strokeStyle = '#EBEDF0';
        ctx.lineWidth = 1;
      }

      const radius = (range.level === 0 ? GROUP_BOX_RADIUS : 4) * zoom;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, radius);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.stroke();
      } else {
        ctx.fillRect(x, y, w, h);
        ctx.shadowColor = 'transparent';
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
      ctx.restore();
    }
  }
}

export const groupBoxRenderer = new GroupBoxRenderer();
