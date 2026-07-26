import {
  GROUP_BOX_GAP,
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
   */
  resolveBoxRect(
    range: GroupBoxRange,
    options: DrawGroupBoxesOptions,
  ): { x: number; y: number; w: number; h: number; radius: number; level: number } | null {
    const { cardLeft, gridRight, rowHeights, zoom, getRowScreenTop } = options;
    if (range.endRow < range.startRow) return null;

    const top = getRowScreenTop(range.startRow, rowHeights);
    // endRow+1 的顶边 = endRow 底边（前缀和），避免逐行累加
    const bottom = getRowScreenTop(range.endRow + 1, rowHeights);

    const gap = GROUP_BOX_GAP * zoom;
    const levelIndent = range.level * GROUP_INDENT_STEP * zoom;
    const x = cardLeft + levelIndent;
    // 顶部略内缩；底部贴齐内容底边再向下探入半个 gap，避免底边被内容层盖住
    const y = top + (range.level === 0 ? gap * 0.5 : 0);
    const yBottom = bottom + (range.level === 0 ? gap * 0.5 : 0);
    const w = Math.max(0, gridRight - x);
    const h = Math.max(0, yBottom - y);
    if (w <= 4 || h <= 4) return null;

    const radius = (range.level === 0 ? GROUP_BOX_RADIUS : 4) * zoom;
    return { x, y, w, h, radius, level: range.level };
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
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, radius);
        ctx.stroke();
      } else {
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
      ctx.restore();
    });
  }
}

export const groupBoxRenderer = new GroupBoxRenderer();
