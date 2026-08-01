import { ViewportManager } from '../index';

// ==================== 甘特视图类型 ====================

export type GanttViewType = 'week' | 'month' | 'quarter';

export type GanttHeaderViewType = 'month' | 'week' | 'day';

// ==================== 颜色 ====================

export type GanttColorKey = 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray';

export const GANTT_COLORS: Record<GanttColorKey, { bg: string; border: string; text: string }> = {
  blue:   { bg: '#E8F0FE', border: '#1A73E8', text: '#1967D2' },
  green:  { bg: '#E6F4EA', border: '#34A853', text: '#1E8E3E' },
  yellow: { bg: '#FEF7E0', border: '#F9AB00', text: '#B06000' },
  red:    { bg: '#FCE8E6', border: '#EA4335', text: '#D93025' },
  purple: { bg: '#F3E8FD', border: '#A142F4', text: '#8430CE' },
  gray:   { bg: '#F1F3F4', border: '#9AA0A6', text: '#5F6368' },
};

// ==================== 渲染数据结构 ====================

export interface GanttRenderTask {
  recordId: string;
  rowIndex: number;
  title: string;
  startDate: string | null;
  endDate: string | null;
  color: GanttColorKey;
  durationDays: number;
  leftPx: number;
  widthPx: number;
}

export interface GanttRenderHeaderColumn {
  key: string;
  label: string;
  isToday: boolean;
  isWeekend: boolean;
}

export interface GanttRenderMonthGroup {
  key: string;
  label: string;
  colspan: number;
}

export interface GanttRenderWeekGroup {
  key: string;
  label: string;
  colspan: number;
}

export interface GanttTreeInfo {
  depth: number;
  hasChildren: boolean;
}

// ==================== 渲染配置 ====================

export interface GanttRenderConfig {
  viewType: GanttViewType;
  headerViewType: GanttHeaderViewType;
  pixelsPerDay: number;
  leftColWidth: number;
  rowNumWidth: number;
  rowHeight: number;
  barHeight: number;
  showLabelInBar: boolean;
  headerMonthHeight: number;
  headerWeekHeight: number;
  headerDayHeight: number;
  barRadius: number;
  treeIndent: number;
  leftHeaderLabel?: string;
}

// ==================== 渲染状态 ====================

export interface GanttRenderState {
  hoveredRecordId: string | null;
  checkedRecordIds: Set<string>;
  collapsedRecordIds: Set<string>;
}

// ==================== 命中测试 ====================

export interface GanttHitResult {
  type:
    | 'header'
    | 'left-cell'
    | 'task-bar'
    | 'collapse-btn'
    | 'checkbox'
    | 'header-checkbox'
    | 'add-row'
    | 'scroll-back-btn'
    | 'timeline'
    | null;
  recordId?: string;
  rowIndex?: number;
}

// ==================== 内部结构 ====================

interface Rect {
  recordId?: string;
  rowIndex?: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ==================== GanttRenderer ====================

export class GanttRenderer {
  private _viewportManager: ViewportManager;
  private _leftRowRects: Rect[] = [];
  private _taskBarRects: Rect[] = [];
  private _collapseBtnRects: Rect[] = [];
  private _checkboxRects: Rect[] = [];
  private _scrollBackBtnRects: Rect[] = [];
  private _headerCheckboxRect: Rect | null = null;
  private _addRowRect: Rect | null = null;
  private _headerRect: Rect | null = null;

  constructor(viewportManager: ViewportManager) {
    this._viewportManager = viewportManager;
  }

  render(
    ctx: CanvasRenderingContext2D,
    config: GanttRenderConfig,
    tasks: GanttRenderTask[],
    headerColumns: GanttRenderHeaderColumn[],
    monthGroups: GanttRenderMonthGroup[],
    weekGroups: GanttRenderWeekGroup[],
    treeInfo: Map<string, GanttTreeInfo>,
    scrollTop: number,
    scrollLeft: number,
    viewportWidth: number,
    viewportHeight: number,
    state: GanttRenderState,
  ): void {
    this._clearRects();

    const headerRowsHeight =
      config.headerMonthHeight + config.headerWeekHeight + config.headerDayHeight;
    const leftColW = config.leftColWidth;
    const totalWidth = headerColumns.length * config.pixelsPerDay;
    const bodyTop = headerRowsHeight;
    const todayLeftPx = this._computeTodayLeftPx(headerColumns, config.pixelsPerDay);

    // 1. 表头区
    this._drawHeader(
      ctx, config, headerColumns, monthGroups, weekGroups,
      totalWidth, headerRowsHeight, leftColW, todayLeftPx, scrollLeft,
    );

    // 2. 数据行
    // 2. 先画时间线行（为左侧列提供底层背景）
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const rowY = bodyTop + i * config.rowHeight - scrollTop;
      if (rowY + config.rowHeight < 0 || rowY > viewportHeight) continue;

      this._drawTimelineCell(
        ctx, config, task, headerColumns, i, rowY, leftColW,
        totalWidth, todayLeftPx, scrollLeft, viewportHeight, state,
      );
    }

    // 3. 底部添加记录行（时间线部分）
    const addRowY = bodyTop + tasks.length * config.rowHeight - scrollTop;
    this._drawAddRow(ctx, config, addRowY, leftColW, totalWidth, todayLeftPx, scrollLeft);

    // 4. 今天竖线（跨所有行）
    if (todayLeftPx >= 0) {
      const todayX = leftColW + todayLeftPx - scrollLeft;
      ctx.strokeStyle = '#3370ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(todayX, bodyTop);
      ctx.lineTo(todayX, bodyTop + tasks.length * config.rowHeight);
      ctx.stroke();
    }

    // 5. 左侧固定列（绘制在时间线上方，更高层级）
    const leftBodyTop = headerRowsHeight;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, leftBodyTop, leftColW, Math.max(0, viewportHeight - leftBodyTop));
    ctx.restore();

    // 右边框
    ctx.strokeStyle = '#e5e6eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftColW, leftBodyTop);
    ctx.lineTo(leftColW, viewportHeight);
    ctx.stroke();

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const rowY = bodyTop + i * config.rowHeight - scrollTop;
      if (rowY + config.rowHeight < 0 || rowY > viewportHeight) continue;

      this._drawLeftCell(
        ctx, config, task, treeInfo, i, rowY, leftColW, state,
      );
    }
  }

  // ==================== 表头 ====================

  private _drawHeader(
    ctx: CanvasRenderingContext2D,
    config: GanttRenderConfig,
    headerColumns: GanttRenderHeaderColumn[],
    monthGroups: GanttRenderMonthGroup[],
    weekGroups: GanttRenderWeekGroup[],
    totalWidth: number,
    headerRowsHeight: number,
    leftColW: number,
    todayLeftPx: number,
    scrollLeft: number,
  ): void {
    const { headerMonthHeight, headerWeekHeight, headerDayHeight, rowNumWidth } = config;
    const monthTop = 0;
    const weekTop = headerMonthHeight;
    const dayTop = headerMonthHeight + headerWeekHeight;

    // 左上角表头
    ctx.fillStyle = '#fafbfc';
    ctx.fillRect(0, 0, leftColW, headerRowsHeight);
    ctx.strokeStyle = '#e5e6eb';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, leftColW, headerRowsHeight);

    // 行号列
    ctx.strokeStyle = '#f0f1f2';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rowNumWidth, 0);
    ctx.lineTo(rowNumWidth, headerRowsHeight);
    ctx.stroke();

    // 选择全部 checkbox
    this._headerCheckboxRect = {
      x: (rowNumWidth - 16) / 2,
      y: (headerRowsHeight - 16) / 2,
      width: 16,
      height: 16,
    };

    // 左侧标题
    ctx.font = '500 13px Arial, sans-serif';
    ctx.fillStyle = '#646a73';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('☰', rowNumWidth + 10, headerRowsHeight / 2);
    ctx.fillText(config.leftHeaderLabel || '标题显示', rowNumWidth + 28, headerRowsHeight / 2);

    this._headerRect = { x: 0, y: 0, width: leftColW, height: headerRowsHeight };

    // 月分组行
    if (headerMonthHeight > 0) {
      let cursor = 0;
      for (const group of monthGroups) {
        const gx = leftColW + cursor * config.pixelsPerDay - scrollLeft;
        const gw = group.colspan * config.pixelsPerDay;
        ctx.fillStyle = '#fafbfc';
        ctx.fillRect(gx, monthTop, gw, headerMonthHeight);
        ctx.strokeStyle = '#e5e6eb';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(gx, monthTop);
        ctx.lineTo(gx, monthTop + headerMonthHeight);
        ctx.stroke();
        ctx.font = '600 12px Arial, sans-serif';
        ctx.fillStyle = '#1f2329';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(group.label, gx + gw / 2, monthTop + headerMonthHeight / 2);
        cursor += group.colspan;
      }
      ctx.strokeStyle = '#e5e6eb';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(leftColW, monthTop + headerMonthHeight);
      ctx.lineTo(leftColW + totalWidth, monthTop + headerMonthHeight);
      ctx.stroke();
    }

    // 周分组行
    if (headerWeekHeight > 0) {
      let cursor = 0;
      for (const group of weekGroups) {
        const gx = leftColW + cursor * config.pixelsPerDay - scrollLeft;
        const gw = group.colspan * config.pixelsPerDay;
        ctx.fillStyle = '#fafbfc';
        ctx.fillRect(gx, weekTop, gw, headerWeekHeight);
        ctx.strokeStyle = '#f0f1f2';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(gx, weekTop);
        ctx.lineTo(gx, weekTop + headerWeekHeight);
        ctx.stroke();
        ctx.font = '11px Arial, sans-serif';
        ctx.fillStyle = '#646a73';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(group.label, gx + gw / 2, weekTop + headerWeekHeight / 2);
        cursor += group.colspan;
      }
      ctx.strokeStyle = '#e5e6eb';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(leftColW, weekTop + headerWeekHeight);
      ctx.lineTo(leftColW + totalWidth, weekTop + headerWeekHeight);
      ctx.stroke();
    }

    // 日列行
    for (let i = 0; i < headerColumns.length; i++) {
      const col = headerColumns[i];
      const x = leftColW + i * config.pixelsPerDay - scrollLeft;
      const w = config.pixelsPerDay;

      if (col.isWeekend) {
        this._drawWeekendBg(ctx, x, dayTop, w, headerDayHeight);
      }
      ctx.fillStyle = col.isToday ? '#f0f5ff' : col.isWeekend ? 'rgba(0,0,0,0)' : '#fff';
      if (!col.isWeekend) {
        ctx.fillRect(x, dayTop, w, headerDayHeight);
      }
      ctx.strokeStyle = '#f0f1f2';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, dayTop);
      ctx.lineTo(x, dayTop + headerDayHeight);
      ctx.stroke();

      ctx.font = `${config.viewType === 'quarter' ? 10 : 12}px Arial, sans-serif`;
      ctx.fillStyle = col.isToday ? '#3370ff' : '#8f959e';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(col.label, x + w / 2, dayTop + headerDayHeight / 2);
    }

    // 日行底边框
    ctx.strokeStyle = '#e5e6eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftColW, dayTop + headerDayHeight);
    ctx.lineTo(leftColW + totalWidth, dayTop + headerDayHeight);
    ctx.stroke();

    // 表头今天高亮底线
    if (todayLeftPx >= 0) {
      const todayX = leftColW + todayLeftPx - scrollLeft;
      ctx.fillStyle = '#3370ff';
      ctx.fillRect(todayX - 1, dayTop, 2, headerDayHeight);
    }
  }

  // ==================== 左侧单元格 ====================

  private _drawLeftCell(
    ctx: CanvasRenderingContext2D,
    config: GanttRenderConfig,
    task: GanttRenderTask,
    treeInfo: Map<string, GanttTreeInfo>,
    index: number,
    rowY: number,
    leftColW: number,
    state: GanttRenderState,
  ): void {
    const meta = treeInfo.get(task.recordId);
    const hasChildren = !!meta?.hasChildren;
    const depth = meta?.depth ?? 0;
    const isExpanded = !state.collapsedRecordIds.has(task.recordId);
    const isHovered = state.hoveredRecordId === task.recordId;
    const isChecked = state.checkedRecordIds.has(task.recordId);
    const showControls = isHovered || isChecked;

    // 背景
    let bg = index % 2 === 1 ? '#fafbfc' : '#fff';
    if (isChecked) bg = '#F0F4FF';
    else if (isHovered) bg = '#F7F8FA';
    ctx.fillStyle = bg;
    ctx.fillRect(0, rowY, leftColW, config.rowHeight);

    // 边框
    ctx.strokeStyle = '#f0f1f2';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftColW, rowY);
    ctx.lineTo(leftColW, rowY + config.rowHeight);
    ctx.stroke();
    ctx.strokeStyle = '#f5f6f7';
    ctx.beginPath();
    ctx.moveTo(0, rowY + config.rowHeight);
    ctx.lineTo(leftColW, rowY + config.rowHeight);
    ctx.stroke();

    // 行号列
    ctx.strokeStyle = '#f0f1f2';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(config.rowNumWidth, rowY);
    ctx.lineTo(config.rowNumWidth, rowY + config.rowHeight);
    ctx.stroke();

    const rowNumCenterX = config.rowNumWidth / 2;
    const rowNumCenterY = rowY + config.rowHeight / 2;

    if (showControls) {
      // 拖拽手柄
      ctx.strokeStyle = '#86909C';
      ctx.lineWidth = 2;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(rowNumCenterX - 5, rowNumCenterY + k * 3 - 1);
        ctx.lineTo(rowNumCenterX + 5, rowNumCenterY + k * 3 - 1);
        ctx.stroke();
      }
      // checkbox
      this._checkboxRects.push({
        recordId: task.recordId,
        rowIndex: task.rowIndex,
        x: rowNumCenterX - 8,
        y: rowNumCenterY - 8,
        width: 16,
        height: 16,
      });
      this._drawCheckbox(ctx, rowNumCenterX - 8, rowNumCenterY - 8, 16, isChecked);
    } else if (!hasChildren) {
      ctx.font = '11px Arial, sans-serif';
      ctx.fillStyle = '#8f959e';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(index + 1), rowNumCenterX, rowNumCenterY);
    }

    // 折叠箭头 + 标题
    const titleLeft = config.rowNumWidth + 8;
    let textX = titleLeft;
    if (hasChildren) {
      const arrowY = rowY + config.rowHeight / 2;
      this._collapseBtnRects.push({
        recordId: task.recordId,
        rowIndex: task.rowIndex,
        x: titleLeft,
        y: rowY,
        width: 16,
        height: config.rowHeight,
      });
      this._drawCollapseArrow(ctx, titleLeft + 3, arrowY, 8, isExpanded);
      textX = titleLeft + 16;
    }

    ctx.font = '13px Arial, sans-serif';
    ctx.fillStyle = '#1f2329';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const indent = depth * config.treeIndent;
    const title = this._truncateText(ctx, task.title, leftColW - textX - indent - 16);
    ctx.fillText(title, textX + indent, rowY + config.rowHeight / 2);

    this._leftRowRects.push({
      recordId: task.recordId,
      rowIndex: task.rowIndex,
      x: 0,
      y: rowY,
      width: leftColW,
      height: config.rowHeight,
    });
  }

  // ==================== 时间线单元格 ====================

  private _drawTimelineCell(
    ctx: CanvasRenderingContext2D,
    config: GanttRenderConfig,
    task: GanttRenderTask,
    headerColumns: GanttRenderHeaderColumn[],
    index: number,
    rowY: number,
    leftColW: number,
    totalWidth: number,
    todayLeftPx: number,
    scrollLeft: number,
    viewportHeight: number,
    state: GanttRenderState,
  ): void {
    // 背景
    let bg = index % 2 === 1 ? '#fafbfc' : '#fff';
    if (state.checkedRecordIds.has(task.recordId)) bg = '#F0F4FF';
    else if (state.hoveredRecordId === task.recordId) bg = '#F7F8FA';
    ctx.fillStyle = bg;
    ctx.fillRect(leftColW, rowY, totalWidth, config.rowHeight);

    // 周末列斜纹 + 列分隔线 + 今天列高亮
    for (let i = 0; i < headerColumns.length; i++) {
      const col = headerColumns[i];
      const x = leftColW + i * config.pixelsPerDay - scrollLeft;
      const w = config.pixelsPerDay;
      if (col.isWeekend) {
        this._drawWeekendBg(ctx, x, rowY, w, config.rowHeight);
      }
      ctx.strokeStyle = '#f0f1f2';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, rowY);
      ctx.lineTo(x, rowY + config.rowHeight);
      ctx.stroke();
    }
    ctx.strokeStyle = '#f5f6f7';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftColW, rowY + config.rowHeight);
    ctx.lineTo(leftColW + totalWidth, rowY + config.rowHeight);
    ctx.stroke();

    const rowCenterY = rowY + config.rowHeight / 2;

    // 无日期占位
    if (!task.startDate) {
      ctx.font = '11px Arial, sans-serif';
      ctx.fillStyle = '#c9cdd4';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('未设置日期', leftColW + 12 - scrollLeft, rowCenterY);
      return;
    }

    const hasLeftData = task.leftPx < scrollLeft - leftColW;

    // "←" 回起始按钮
    if (hasLeftData) {
      const btnX = leftColW + 4 - scrollLeft;
      const btnY = rowCenterY - 11;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeStyle = '#e5e6eb';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(btnX + 11, rowCenterY, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#646a73';
      ctx.font = '10px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('←', btnX + 11, rowCenterY + 1);
      this._scrollBackBtnRects.push({
        recordId: task.recordId,
        rowIndex: task.rowIndex,
        x: btnX,
        y: btnY,
        width: 22,
        height: 22,
      });
    }

    // 任务条
    const barWidth = Math.max(task.widthPx - 4, 12);
    const barX = leftColW + task.leftPx + 2 - scrollLeft;
    const barY = rowY + (config.rowHeight - config.barHeight) / 2;
    const colors = GANTT_COLORS[task.color] || GANTT_COLORS.blue;
    const isHovered = state.hoveredRecordId === task.recordId;

    // 条外标签（month/quarter）
    if (!config.showLabelInBar) {
      const labelText = `${task.durationDays}天 ${task.title}`;
      ctx.font = '10px Arial, sans-serif';
      const labelW = ctx.measureText(labelText).width;
      ctx.fillStyle = '#1f2329';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const labelX = barX + barWidth + 6;
      ctx.fillText(labelText, labelX, rowCenterY);

      this._taskBarRects.push({
        recordId: task.recordId,
        rowIndex: task.rowIndex,
        x: barX,
        y: barY,
        width: barWidth + 6 + labelW + 8,
        height: config.barHeight,
      });
    } else {
      this._taskBarRects.push({
        recordId: task.recordId,
        rowIndex: task.rowIndex,
        x: barX,
        y: barY,
        width: barWidth,
        height: config.barHeight,
      });
    }

    // 条
    this._roundRect(ctx, barX, barY, barWidth, config.barHeight, config.barRadius);
    ctx.fillStyle = colors.border;
    ctx.fill();

    if (isHovered) {
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      this._roundRect(ctx, barX, barY, barWidth, config.barHeight, config.barRadius);
      ctx.fill();
    }

    // 白色圆点图标
    const dotSize = Math.max(8, config.barHeight - 14);
    const dotX = barX + 4;
    const dotY = rowCenterY;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotSize / 2, 0, Math.PI * 2);
    ctx.fill();

    const textLeft = dotX + dotSize / 2 + 3;

    if (config.showLabelInBar) {
      ctx.font = '500 11px Arial, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const title = this._truncateText(ctx, task.title, Math.max(0, barWidth - (textLeft - barX) - 8));
      ctx.fillText(title, textLeft, rowCenterY);

      if (task.widthPx > 40) {
        const durText = `${task.durationDays}天`;
        ctx.font = '10px Arial, sans-serif';
        const durW = ctx.measureText(durText).width + 6;
        const durX = barX + barWidth - durW - 3;
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        this._roundRect(ctx, durX, rowCenterY - 7, durW, 14, 3);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(durText, durX + durW / 2, rowCenterY);
      }
    }

    void viewportHeight;
  }

  // ==================== 添加记录行 ====================

  private _drawAddRow(
    ctx: CanvasRenderingContext2D,
    config: GanttRenderConfig,
    addRowY: number,
    leftColW: number,
    totalWidth: number,
    todayLeftPx: number,
    scrollLeft: number,
  ): void {
    const rowHeight = config.rowHeight;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, addRowY, leftColW + totalWidth, rowHeight);

    ctx.strokeStyle = '#f0f1f2';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftColW, addRowY);
    ctx.lineTo(leftColW, addRowY + rowHeight);
    ctx.stroke();
    ctx.strokeStyle = '#f5f6f7';
    ctx.beginPath();
    ctx.moveTo(0, addRowY + rowHeight);
    ctx.lineTo(leftColW + totalWidth, addRowY + rowHeight);
    ctx.stroke();

    // 左侧 + 添加记录
    ctx.strokeStyle = '#f0f1f2';
    ctx.beginPath();
    ctx.moveTo(config.rowNumWidth, addRowY);
    ctx.lineTo(config.rowNumWidth, addRowY + rowHeight);
    ctx.stroke();

    const rowCenterX = config.rowNumWidth / 2;
    const rowCenterY = addRowY + rowHeight / 2;
    ctx.fillStyle = '#8f959e';
    ctx.font = '14px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', rowCenterX, rowCenterY);

    ctx.font = '14px Arial, sans-serif';
    ctx.fillStyle = '#8f959e';
    ctx.textAlign = 'left';
    ctx.fillText('添加记录', config.rowNumWidth + 8, rowCenterY);

    this._addRowRect = { x: 0, y: addRowY, width: leftColW + totalWidth, height: rowHeight };

    void todayLeftPx;
    void scrollLeft;
  }

  // ==================== 命中测试 ====================

  hitTest(clientX: number, clientY: number): GanttHitResult {
    if (this._headerCheckboxRect && this._inRect(clientX, clientY, this._headerCheckboxRect)) {
      return { type: 'header-checkbox' };
    }

    for (const r of this._scrollBackBtnRects) {
      if (this._inRect(clientX, clientY, r)) {
        return { type: 'scroll-back-btn', recordId: r.recordId, rowIndex: r.rowIndex };
      }
    }

    for (const r of this._collapseBtnRects) {
      if (this._inRect(clientX, clientY, r)) {
        return { type: 'collapse-btn', recordId: r.recordId, rowIndex: r.rowIndex };
      }
    }

    for (const r of this._checkboxRects) {
      if (this._inRect(clientX, clientY, r)) {
        return { type: 'checkbox', recordId: r.recordId, rowIndex: r.rowIndex };
      }
    }

    for (const r of this._taskBarRects) {
      if (this._inRect(clientX, clientY, r)) {
        return { type: 'task-bar', recordId: r.recordId, rowIndex: r.rowIndex };
      }
    }

    for (const r of this._leftRowRects) {
      if (this._inRect(clientX, clientY, r)) {
        return { type: 'left-cell', recordId: r.recordId, rowIndex: r.rowIndex };
      }
    }

    if (this._addRowRect && this._inRect(clientX, clientY, this._addRowRect)) {
      return { type: 'add-row' };
    }

    if (this._headerRect && this._inRect(clientX, clientY, this._headerRect)) {
      return { type: 'header' };
    }

    return { type: 'timeline' };
  }

  /** 获取指定任务左侧单元格屏幕矩形（用于 hover 工具栏定位） */
  getLeftRowRect(recordId: string): { x: number; y: number; width: number; height: number; rowIndex: number } | null {
    for (const r of this._leftRowRects) {
      if (r.recordId === recordId) return { x: r.x, y: r.y, width: r.width, height: r.height, rowIndex: r.rowIndex ?? 0 };
    }
    return null;
  }

  // ==================== 辅助绘制 ====================

  private _drawWeekendBg(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
  ): void {
    ctx.fillStyle = '#f5f6f7';
    ctx.fillRect(x, y, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = '#e8eaed';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let px = x - h; px < x + w + h; px += 6) {
      ctx.moveTo(px, y + h);
      ctx.lineTo(px + h, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  private _drawCheckbox(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, size: number, checked: boolean,
  ): void {
    ctx.fillStyle = checked ? '#3370ff' : '#fff';
    ctx.strokeStyle = checked ? '#3370ff' : '#d9d9d9';
    ctx.lineWidth = 1;
    this._roundRect(ctx, x, y, size, size, 3);
    ctx.fill();
    ctx.stroke();

    if (checked) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + size / 2);
      ctx.lineTo(x + size / 2, y + size - 4);
      ctx.lineTo(x + size - 3, y + 3);
      ctx.stroke();
    }
  }

  private _drawCollapseArrow(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, size: number, expanded: boolean,
  ): void {
    ctx.fillStyle = '#666';
    ctx.beginPath();
    if (expanded) {
      ctx.moveTo(x - size / 2, y - size / 2);
      ctx.lineTo(x + size / 2, y - size / 2);
      ctx.lineTo(x, y + size / 2);
    } else {
      ctx.moveTo(x - size / 2, y - size / 2);
      ctx.lineTo(x - size / 2, y + size / 2);
      ctx.lineTo(x + size / 2, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  private _computeTodayLeftPx(
    headerColumns: GanttRenderHeaderColumn[],
    pixelsPerDay: number,
  ): number {
    const idx = headerColumns.findIndex(c => c.isToday);
    return idx >= 0 ? idx * pixelsPerDay + pixelsPerDay / 2 : -1;
  }

  private _truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (maxWidth <= 0) return '';
    if (ctx.measureText(text).width <= maxWidth) return text;
    let displayText = text;
    while (displayText.length > 0 && ctx.measureText(displayText + '\u2026').width > maxWidth) {
      displayText = displayText.slice(0, -1);
    }
    return displayText + '\u2026';
  }

  private _roundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private _inRect(x: number, y: number, r: Rect): boolean {
    return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
  }

  private _clearRects(): void {
    this._leftRowRects = [];
    this._taskBarRects = [];
    this._collapseBtnRects = [];
    this._checkboxRects = [];
    this._scrollBackBtnRects = [];
    this._headerCheckboxRect = null;
    this._addRowRect = null;
    this._headerRect = null;
  }
}
