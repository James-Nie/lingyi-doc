import { BASE_THEME } from './baseTheme';
import type { BaseRowHeaderMeta } from '../utils/rowTree';
import type { ViewportManager } from './ViewportManager';
import { CellRenderer, type CellRendererOptions, type RowHeaderCellDrawOptions } from './CellRenderer';
import { BASE_AXIS_SELECTION, resolveAxisSelection } from './types';

/**
 * BaseSheet (多维表) 特定的渲染方法
 * 覆写行头单元格绘制：选中/勾选/悬停背景 + 拖拽/复选框 + 折叠三角
 */
export class CellRendererBase extends CellRenderer {
  constructor(viewportManager: ViewportManager, options?: CellRendererOptions) {
    super(viewportManager, options);
  }

  protected override drawRowHeaderCell(ctx: CanvasRenderingContext2D, opts: RowHeaderCellDrawOptions): void {
    const {
      row, drawY, h, zoom, isHovered, isSelected, isChecked, isActive,
      meta, depth, suppressRowNumbers, showHoverControls,
      primaryColor, secondaryColor, fontFamily, headerWidth,
    } = opts;

    if (isActive) {
      ctx.fillStyle = BASE_AXIS_SELECTION.headerBg;
      ctx.fillRect(0, drawY, headerWidth, h);
    } else if (isChecked) {
      ctx.fillStyle = BASE_THEME.rowCheckedBg;
      ctx.fillRect(0, drawY, headerWidth, h);
    } else if (isSelected && !isChecked) {
      ctx.fillStyle = resolveAxisSelection(true).headerBg;
      ctx.fillRect(0, drawY, headerWidth, h);
    } else if (isHovered) {
      ctx.fillStyle = BASE_THEME.rowHoverBg;
      ctx.fillRect(0, drawY, headerWidth, h);
    }

    if (showHoverControls) {
      this._drawBaseRowHeaderHover(ctx, drawY, h, zoom, isChecked);
    }

    if (depth === 0 && meta?.hasChildren) {
      const chevronCx = 38 * zoom + 15;
      this._drawTreeChevron(
        ctx, chevronCx, drawY + h / 2, 8 * zoom,
        meta.isExpanded !== false,
      );
    }

    if (depth === 0 && !showHoverControls && !meta?.hasChildren && !suppressRowNumbers) {
      ctx.font = `${12 * zoom}px ${fontFamily}`;
      ctx.fillStyle = isActive ? primaryColor : secondaryColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(row + 1), headerWidth / 2, drawY + h / 2);
    }
  }

  /** 多维表行头：拖拽句柄 + 行复选框 */
  private _drawBaseRowHeaderHover(
    ctx: CanvasRenderingContext2D,
    drawY: number,
    h: number,
    zoom: number,
    isChecked?: boolean,
  ): void {
    const cy = drawY + h / 2;
    const iconSize = 14 * zoom;
    const padding = 6 * zoom;

    const dragCx = padding + 7 * zoom;
    this._drawDragHandle(ctx, dragCx, cy, 8 * zoom, '#86909C');

    const cbX = padding + 18 * zoom;
    this._drawRowCheckbox(ctx, cbX, cy - iconSize / 2, iconSize, !!isChecked, zoom);
  }

  /** 多维表行头：子记录折叠三角 */
  private _drawTreeChevron(
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

  /** 拖动句柄 */
  private _drawDragHandle(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color = '#bbb'): void {
    ctx.save();
    ctx.fillStyle = color;
    const dotR = 1.2;
    const gapX = 3.5;
    const gapY = 3.5;
    for (let row = -1; row <= 1; row++) {
      for (let col = -1; col <= 0; col++) {
        ctx.beginPath();
        ctx.arc(cx + col * gapX, cy + row * gapY, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** 行复选框 */
  private _drawRowCheckbox(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, size: number, checked: boolean, zoom: number,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 2 * zoom);
    if (checked) {
      ctx.fillStyle = '#3370FF';
      ctx.fill();
      ctx.strokeStyle = '#3370FF';
      ctx.lineWidth = 1 * zoom;
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5 * zoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x + 3 * zoom, y + size / 2);
      ctx.lineTo(x + size * 0.4, y + size - 3 * zoom);
      ctx.lineTo(x + size - 2 * zoom, y + 2 * zoom);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#C9CDD4';
      ctx.lineWidth = 1 * zoom;
      ctx.stroke();
    }
    ctx.restore();
  }
}

export type { BaseRowHeaderMeta };
