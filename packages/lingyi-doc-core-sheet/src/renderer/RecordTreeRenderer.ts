import type { RecordTreeColumnMeta } from '../utils/rowTree';
import {
  TREE_BASE_PADDING,
  TREE_CHEVRON_SIZE,
  TREE_INDENT_STEP,
  resolveTreeLayout,
} from '../utils/rowTree';

export interface RecordTreeDrawRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 在第一列绘制子记录树形结构（虚线、折叠箭头） */
export class RecordTreeRenderer {
  drawTreeColumn(
    ctx: CanvasRenderingContext2D,
    rect: RecordTreeDrawRect,
    meta: RecordTreeColumnMeta,
    zoom: number,
  ): void {
    const cy = rect.y + rect.height / 2;
    const depth = meta.depth;
    const { offset } = resolveTreeLayout(meta, rect.width, zoom);
    const ox = rect.x - offset;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#d9d9d9';
    ctx.setLineDash([3 * zoom, 3 * zoom]);

    for (let level = 0; level < depth; level++) {
      const lineX = ox + TREE_BASE_PADDING * zoom + level * TREE_INDENT_STEP * zoom + (TREE_INDENT_STEP * zoom) / 2;
      const continues = meta.lineContinues[level];
      const isCurrentLevel = level === depth - 1;

      if (isCurrentLevel && !meta.isLastChild) {
        ctx.beginPath();
        ctx.moveTo(lineX, rect.y);
        ctx.lineTo(lineX, rect.y + rect.height);
        ctx.stroke();
      } else if (isCurrentLevel && meta.isLastChild) {
        ctx.beginPath();
        ctx.moveTo(lineX, rect.y);
        ctx.lineTo(lineX, cy);
        ctx.stroke();
      } else if (continues) {
        ctx.beginPath();
        ctx.moveTo(lineX, rect.y);
        ctx.lineTo(lineX, rect.y + rect.height);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(lineX, rect.y);
        ctx.lineTo(lineX, cy);
        ctx.stroke();
      }
    }

    if (depth > 0) {
      const parentLineX = ox + TREE_BASE_PADDING * zoom + (depth - 1) * TREE_INDENT_STEP * zoom + (TREE_INDENT_STEP * zoom) / 2;
      const chevronX = ox + TREE_BASE_PADDING * zoom + depth * TREE_INDENT_STEP * zoom;
      ctx.beginPath();
      ctx.moveTo(parentLineX, cy);
      ctx.lineTo(chevronX - 2 * zoom, cy);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    if (meta.hasChildren && depth > 0) {
      const chevronX = ox + TREE_BASE_PADDING * zoom + depth * TREE_INDENT_STEP * zoom + (TREE_CHEVRON_SIZE * zoom) / 2;
      this._drawChevron(ctx, chevronX, cy, TREE_CHEVRON_SIZE * zoom, meta.isExpanded);
    }

    ctx.restore();
  }

  /**
   * 绘制折叠箭头
   * @param ctx 上下文
   * @param cx 三角中心 x 坐标
   * @param cy 三角中心 y 坐标
   * @param size 三角大小
   * @param expanded 是否展开
   */
  private _drawChevron(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    expanded: boolean,
  ): void {
    ctx.save();
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (expanded) {
      ctx.moveTo(cx - size / 2, cy - size / 4);
      ctx.lineTo(cx, cy + size / 4);
      ctx.lineTo(cx + size / 2, cy - size / 4);
    } else {
      ctx.moveTo(cx - size / 4, cy - size / 2);
      ctx.lineTo(cx + size / 4, cy);
      ctx.lineTo(cx - size / 4, cy + size / 2);
    }
    ctx.stroke();
    ctx.restore();
  }
}

export const recordTreeRenderer = new RecordTreeRenderer();
