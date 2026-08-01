import type { ColumnDef } from '@lingyi-doc/core-types';
import { BASE_THEME } from './baseTheme';
import { resolveColumnWidth } from '../utils/columnLayout';
import { drawFieldTypeIcon } from '../utils/fieldTypeIcons';
import {
  GROUP_CHEVRON_OFFSET,
  GROUP_INDENT_STEP,
  GROUP_ROW_METADATA_WIDTH,
  type GroupLayoutItem,
} from '../utils/recordGrouping';

export interface GroupHeaderDrawRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type GroupHeaderHitAction = 'toggle' | 'add-record';

export class GroupHeaderRenderer {
  drawGroupHeader(
    ctx: CanvasRenderingContext2D,
    rect: GroupHeaderDrawRect,
    item: Extract<GroupLayoutItem, { type: 'group-header' }>,
    columnDef: ColumnDef | undefined,
    zoom: number,
    selectedCount?: number,
    /** metadata 与首字段列分界 X（屏幕坐标，通常为 headerWidth） */
    metadataDividerX?: number,
  ): void {
    const { x, y, width, height } = rect;
    const chevronCx = x + GROUP_CHEVRON_OFFSET * zoom;
    const cy = y + height / 2;

    ctx.save();
    ctx.fillStyle = item.level > 0 ? '#FAFBFC' : '#FFFFFF';
    ctx.fillRect(x, y, width, height);

    this._drawChevron(ctx, chevronCx, cy, 8 * zoom, item.expanded);

    let labelX = chevronCx + 14 * zoom;
    if (columnDef) {
      const iconCx = labelX + 6 * zoom;
      drawFieldTypeIcon(ctx, columnDef.type, iconCx, cy, 11 * zoom, BASE_THEME.secondaryTextColor);
      labelX += 18 * zoom;
    }

    ctx.font = `500 ${13 * zoom}px ${BASE_THEME.fontFamily}`;
    ctx.fillStyle = BASE_THEME.cellTextColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const countText = selectedCount && selectedCount > 0
      ? `已选择 ${selectedCount} 条记录`
      : `${item.recordCount} 条记录`;
    ctx.font = `${12 * zoom}px ${BASE_THEME.fontFamily}`;
    const countWidth = ctx.measureText(countText).width;
    const maxLabelWidth = Math.max(60 * zoom, width - (labelX - x) - countWidth - 40 * zoom);
    let label = item.label;
    ctx.font = `500 ${13 * zoom}px ${BASE_THEME.fontFamily}`;
    while (ctx.measureText(label).width > maxLabelWidth && label.length > 1) {
      label = `${label.slice(0, -2)}…`;
    }
    ctx.fillText(label, labelX, cy);

    ctx.font = `${12 * zoom}px ${BASE_THEME.fontFamily}`;
    ctx.fillStyle = BASE_THEME.secondaryTextColor;
    ctx.textAlign = 'right';
    ctx.fillText(countText, x + width - 16 * zoom, cy);

    // 分组头底部分隔（局部线，非全宽网格）
    ctx.strokeStyle = '#EBEDF0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + height - 0.5);
    ctx.lineTo(x + width, y + height - 0.5);
    ctx.stroke();

    ctx.restore();
  }

  /** 分组卡片内列头行（字段名独立一行） */
  drawGroupColumnHeader(
    ctx: CanvasRenderingContext2D,
    rect: GroupHeaderDrawRect,
    columnDefs: ColumnDef[],
    colCount: number,
    columnWidths: Map<number, number>,
    defaultColumnWidth: number,
    zoom: number,
    getColumnScreenLeft: (col: number) => number,
    visibleStartCol: number,
    visibleEndCol: number,
  ): void {
    const { x, y, width, height } = rect;
    const cy = y + height / 2;
    const metaEndX = x + (GROUP_CHEVRON_OFFSET + GROUP_ROW_METADATA_WIDTH) * zoom;

    ctx.save();
    ctx.fillStyle = '#FAFBFC';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#EBEDF0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + height);
    ctx.lineTo(x + width, y + height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(metaEndX, y);
    ctx.lineTo(metaEndX, y + height);
    ctx.stroke();

    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();

    const fontFamily = BASE_THEME.fontFamily;

    for (let c = Math.max(0, visibleStartCol); c <= visibleEndCol && c < colCount; c++) {
      const colDef = columnDefs[c];
      if (!colDef) continue;
      const colX = getColumnScreenLeft(c);
      const colW = resolveColumnWidth(c, columnWidths, defaultColumnWidth) * zoom;
      if (colX + colW < x || colX > x + width) continue;

      const minLabelX = c === 0 ? metaEndX + 8 * zoom : colX + 8 * zoom;
      let labelX = Math.max(colX + 8 * zoom, minLabelX);
      const iconCx = labelX + 6 * zoom;
      drawFieldTypeIcon(ctx, colDef.type, iconCx, cy, 10 * zoom, BASE_THEME.secondaryTextColor);
      labelX += 14 * zoom;

      ctx.font = `${12 * zoom}px ${fontFamily}`;
      ctx.fillStyle = BASE_THEME.secondaryTextColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let name = colDef.name;
      const maxW = colW - 16 * zoom;
      while (ctx.measureText(name).width > maxW && name.length > 1) {
        name = `${name.slice(0, -2)}…`;
      }
      ctx.fillText(name, labelX, cy);

      ctx.strokeStyle = '#EBEDF0';
      ctx.beginPath();
      ctx.moveTo(colX + colW, y);
      ctx.lineTo(colX + colW, y + height);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawAddRecordRow(
    ctx: CanvasRenderingContext2D,
    rect: GroupHeaderDrawRect,
    level: number,
    zoom: number,
    metadataDividerX?: number,
    hovered?: boolean,
  ): void {
    const { x, y, width, height } = rect;
    const plusCx = x + GROUP_CHEVRON_OFFSET * zoom;
    const cy = y + height / 2;

    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x, y, width, height);

    if (hovered) {
      const btnW = 24 * zoom;
      const btnH = 20 * zoom;
      const btnX = plusCx - btnW / 2;
      const btnY = cy - btnH / 2;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(btnX, btnY, btnW, btnH, 6 * zoom);
      } else {
        ctx.rect(btnX, btnY, btnW, btnH);
      }
      ctx.fillStyle = '#EBEDF0';
      ctx.fill();
    }

    ctx.strokeStyle = hovered ? '#646A73' : '#C9CDD4';
    ctx.lineWidth = 1.5 * zoom;
    ctx.lineCap = 'round';
    const s = 5 * zoom;
    ctx.beginPath();
    ctx.moveTo(plusCx - s, cy);
    ctx.lineTo(plusCx + s, cy);
    ctx.moveTo(plusCx, cy - s);
    ctx.lineTo(plusCx, cy + s);
    ctx.stroke();

    ctx.restore();
  }

  hitTestGroupHeader(
    relX: number,
    relY: number,
    item: Extract<GroupLayoutItem, { type: 'group-header' }>,
    cellHeight: number,
    zoom: number,
  ): GroupHeaderHitAction | null {
    const chevronCx = (item.level * GROUP_INDENT_STEP + GROUP_CHEVRON_OFFSET) * zoom;
    if (
      relX >= chevronCx - 10 * zoom &&
      relX <= chevronCx + 20 * zoom &&
      relY >= cellHeight * 0.15 &&
      relY <= cellHeight * 0.85
    ) {
      return 'toggle';
    }
    return null;
  }

  hitTestAddRecordRow(
    relX: number,
    _relY: number,
    level: number,
    zoom: number,
  ): boolean {
    const plusCx = (level * GROUP_INDENT_STEP + GROUP_CHEVRON_OFFSET) * zoom;
    return relX >= plusCx - 16 * zoom && relX <= plusCx + 16 * zoom;
  }

  private _drawChevron(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    expanded: boolean,
  ): void {
    ctx.save();
    ctx.strokeStyle = '#646A73';
    ctx.lineWidth = 1.4;
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

export const groupHeaderRenderer = new GroupHeaderRenderer();
