import {
  GROUP_CHEVRON_OFFSET,
  GROUP_INDENT_STEP,
  GROUP_ROW_METADATA_WIDTH,
} from '../utils/recordGrouping';

export type GroupedRowControlAction = 'drag' | 'checkbox';

export interface DrawGroupedRecordControlsOptions {
  cardLeft: number;
  y: number;
  height: number;
  level: number;
  zoom: number;
  localIndex: number;
  isChecked: boolean;
  /** hover / 选中 / 勾选时展示拖拽与复选框 */
  showControls?: boolean;
  /** 元数据区与数据列分隔线 X（屏幕坐标） */
  metadataDividerX?: number;
}

export class GroupedRowControlsRenderer {
  /** 折叠三角列 X（与分组头三角对齐） */
  resolveChevronColumnX(cardLeft: number, level: number, zoom: number): number {
    return cardLeft + (level * GROUP_INDENT_STEP + GROUP_CHEVRON_OFFSET) * zoom;
  }

  drawRecordRowControls(
    ctx: CanvasRenderingContext2D,
    options: DrawGroupedRecordControlsOptions,
  ): void {
    const { cardLeft, y, height, level, zoom, localIndex, isChecked, showControls = false, metadataDividerX } = options;
    const chevronX = this.resolveChevronColumnX(cardLeft, level, zoom);
    const cy = y + height / 2;

    if (showControls) {
      const dragCx = chevronX - 16 * zoom;
      this._drawDragHandle(ctx, dragCx, cy, 8 * zoom, '#86909C');

      const cbSize = 16 * zoom;
      const cbX = chevronX - cbSize / 2;
      this._drawCheckbox(ctx, cbX, cy - cbSize / 2, cbSize, isChecked, zoom);
    } else {
      ctx.save();
      ctx.font = `${12 * zoom}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.fillStyle = '#86909C';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(localIndex), chevronX + 6 * zoom, cy);
      ctx.restore();
    }

    if (metadataDividerX !== undefined) {
      ctx.save();
      ctx.strokeStyle = '#EBEDF0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(metadataDividerX, y);
      ctx.lineTo(metadataDividerX, y + height);
      ctx.stroke();
      ctx.restore();
    }
  }

  hitTestRecordControls(
    relXFromCardLeft: number,
    relY: number,
    rowHeight: number,
    level: number,
    zoom: number,
    showControls = false,
  ): GroupedRowControlAction | null {
    if (relY < rowHeight * 0.1 || relY > rowHeight * 0.9) return null;
    const chevronX = (level * GROUP_INDENT_STEP + GROUP_CHEVRON_OFFSET) * zoom;
    if (relXFromCardLeft >= chevronX - 12 * zoom && relXFromCardLeft <= chevronX + GROUP_ROW_METADATA_WIDTH * zoom) {
      return 'checkbox';
    }
    if (!showControls) return null;
    const dragCx = chevronX - 16 * zoom;
    if (relXFromCardLeft >= dragCx - 10 * zoom && relXFromCardLeft <= chevronX - 4 * zoom) {
      return 'drag';
    }
    return null;
  }

  private _drawDragHandle(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
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

  private _drawCheckbox(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    checked: boolean,
    zoom: number,
  ): void {
    ctx.save();
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, 2 * zoom);
    } else {
      ctx.rect(x, y, size, size);
    }
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
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.strokeStyle = '#C9CDD4';
      ctx.lineWidth = 1 * zoom;
      ctx.stroke();
    }
    ctx.restore();
  }
}

export const groupedRowControlsRenderer = new GroupedRowControlsRenderer();
