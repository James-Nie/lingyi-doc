import {
  GROUP_BOX_RADIUS,
  GROUP_INDENT_STEP,
  type GroupBoxRange,
} from '../utils/recordGrouping';

export interface DrawGroupBoxesOptions {
  /** 卡片左缘（屏幕 px），与 corner 复选框列头左边界对齐（x=0） */
  cardLeft: number;
  gridRight: number;
  rowHeights: Map<number, number>;
  defaultRowHeight: number;
  zoom: number;
  getRowScreenTop: (row: number, rowHeights: Map<number, number>) => number;
  /** 与 visibleRange 相交才绘制；缺省画全部 */
  visibleStartRow?: number;
  visibleEndRow?: number;
  /** 画布高度，用于屏幕外快速剔除 */
  canvasHeight?: number;
}

export class GroupBoxRenderer {
  /**
   * 计算分组卡片屏幕几何（填充与描边共用）。
   * 高度用相邻行屏幕顶差 O(1)；group-gap 不会落在 box range 内（布局保证）。
   * 卡片边界与内容行严格重合（顶=分组头顶，底=最后一行底），边框与填充同源。
   */
  resolveBoxRect(
    range: GroupBoxRange,
    options: DrawGroupBoxesOptions,
  ): { x: number; y: number; w: number; h: number; radius: number; level: number } | null {
    const { cardLeft, gridRight, rowHeights, getRowScreenTop } = options;
    if (range.endRow < range.startRow) return null;

    const top = getRowScreenTop(range.startRow, rowHeights);
    // endRow+1 的顶边 = endRow 底边（前缀和），避免逐行累加
    const bottom = getRowScreenTop(range.endRow + 1, rowHeights);

    const levelIndent = range.level * GROUP_INDENT_STEP * options.zoom;
    const x = cardLeft + levelIndent;
    const y = top;
    const yBottom = bottom;
    const w = Math.max(0, gridRight - x);
    const h = Math.max(0, yBottom - y);
    if (w <= 4 || h <= 4) return null;

    const radius = (range.level === 0 ? GROUP_BOX_RADIUS : 4) * options.zoom;
    return { x, y, w, h, radius, level: range.level };
  }

  /** 圆角路径：右侧圆角、左侧直角（border 与 fill 共用同一路径） */
  private roundRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
  ): void {
    const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  }

  private forVisibleBoxes(
    ranges: GroupBoxRange[],
    options: DrawGroupBoxesOptions,
    visit: (box: { x: number; y: number; w: number; h: number; radius: number; level: number }) => void,
  ): void {
    const { visibleStartRow, visibleEndRow, canvasHeight } = options;
    const hasRowClip = visibleStartRow != null && visibleEndRow != null;

    // ranges 在布局阶段已按 level 升序；不再每帧 sort
    for (const range of ranges) {
      if (hasRowClip && (range.endRow < visibleStartRow! || range.startRow > visibleEndRow!)) {
        continue;
      }
      const box = this.resolveBoxRect(range, options);
      if (!box) continue;
      if (canvasHeight != null && (box.y + box.h < 0 || box.y > canvasHeight)) {
        continue;
      }
      visit(box);
    }
  }

  drawGroupBoxes(
    ctx: CanvasRenderingContext2D,
    ranges: GroupBoxRange[],
    options: DrawGroupBoxesOptions,
  ): void {
    this.forVisibleBoxes(ranges, options, (box) => {
      const { x, y, w, h, radius, level } = box;

      ctx.save();
      if (level === 0) {
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#DEE0E3';
        ctx.lineWidth = 1;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.06)';
        ctx.shadowBlur = 8 * options.zoom;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 1 * options.zoom;
      } else {
        ctx.fillStyle = '#FAFBFC';
        ctx.strokeStyle = '#EBEDF0';
        ctx.lineWidth = 1;
      }

      this.roundRectPath(ctx, x, y, w, h, radius);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.stroke();
      ctx.restore();
    });
  }

  /** 在内容层之后重描边框，避免被添加记录行白底覆盖底边 */
  strokeGroupBoxes(
    ctx: CanvasRenderingContext2D,
    ranges: GroupBoxRange[],
    options: DrawGroupBoxesOptions,
  ): void {
    this.forVisibleBoxes(ranges, options, (box) => {
      const { x, y, w, h, radius, level } = box;

      ctx.save();
      ctx.strokeStyle = level === 0 ? '#DEE0E3' : '#EBEDF0';
      ctx.lineWidth = 1;
      this.roundRectPath(ctx, x, y, w, h, radius);
      ctx.stroke();
      ctx.restore();
    });
  }
}

export const groupBoxRenderer = new GroupBoxRenderer();
