import { RecordRow, ColumnDef } from '@lingyi-doc/core-types';
import { ViewportManager } from '../index';

// ==================== 甘特视图配置 ====================

export interface GanttViewConfig {
  viewId: string;
  viewName: string;
  startDateFieldId: string;         // 开始日期字段
  endDateFieldId: string;           // 结束日期字段
  progressFieldId?: string;         // 进度字段（可选）
  taskNameFieldId: string;          // 任务名字段
  dependencyFieldId?: string;       // 依赖字段（关联自身表）
  timeUnit: 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
  rowHeight: number;
  timelineHeight: number;           // 时间轴高度
  taskBarHeight: number;
  taskBarRadius: number;
  headerWidth: number;              // 左侧任务列表宽度
  minDate: Date;
  maxDate: Date;
}

export interface GanttTask {
  record: RecordRow;
  startX: number;
  endX: number;
  y: number;
  width: number;
  progress: number;
  dependencies: string[];           // 依赖的任务 recordId
  color: string;
}

export interface GanttDependency {
  fromTaskId: string;
  toTaskId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF'; // Finish-Start, Start-Start, Finish-Finish, Start-Finish
}

// ==================== GanttRenderer ====================

export class GanttRenderer {
  private _viewportManager: ViewportManager;
  private _tasks: Map<string, GanttTask> = new Map();

  constructor(viewportManager: ViewportManager) {
    this._viewportManager = viewportManager;
  }

  /** 计算时间轴总像素宽度 */
  getTimelineWidth(config: GanttViewConfig): number {
    const days = this._getDaysBetween(config.minDate, config.maxDate);
    return this._getPixelsPerUnit(config.timeUnit) * days;
  }

  /** 渲染甘特视图 */
  render(
    ctx: CanvasRenderingContext2D,
    config: GanttViewConfig,
    records: RecordRow[],
    columnDefs: ColumnDef[],
    scrollLeft: number,
    scrollTop: number,
    viewportWidth: number,
    viewportHeight: number,
  ): void {
    // 1. 计算任务位置
    this._calculateTasks(records, config, scrollTop, viewportHeight);

    // 2. 绘制时间轴
    this._drawTimeline(ctx, config, scrollLeft, viewportWidth);

    // 3. 绘制任务列表（左侧固定列）
    this._drawTaskList(ctx, records, config, scrollTop, viewportHeight);

    // 4. 绘制网格线（竖向时间线）
    this._drawGridLines(ctx, config, scrollLeft, viewportWidth, viewportHeight);

    // 5. 绘制任务条
    this._drawTaskBars(ctx, config, scrollLeft, viewportWidth);

    // 6. 绘制依赖连线
    this._drawDependencies(ctx, config, scrollLeft, viewportWidth);
  }

  /** 计算所有任务的位置 */
  private _calculateTasks(records: RecordRow[], config: GanttViewConfig, scrollTop: number, viewportHeight: number): void {
    const pixelsPerUnit = this._getPixelsPerUnit(config.timeUnit);
    const minTime = config.minDate.getTime();

    this._tasks.clear();

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const startDate = record[config.startDateFieldId];
      const endDate = record[config.endDateFieldId];

      if (!startDate || !endDate) continue;

      const startTime = new Date(startDate as string | number).getTime();
      const endTime = new Date(endDate as string | number).getTime();

      const startX = ((startTime - minTime) / (1000 * 60 * 60 * 24)) * pixelsPerUnit;
      const endX = ((endTime - minTime) / (1000 * 60 * 60 * 24)) * pixelsPerUnit;
      const y = config.timelineHeight + i * config.rowHeight - scrollTop;

      // 只缓存可视区域内的任务
      if (y + config.rowHeight >= 0 && y <= viewportHeight) {
        const progress = config.progressFieldId
          ? (parseFloat(record[config.progressFieldId] as string) || 0) / 100
          : 0;

        this._tasks.set(record._id, {
          record,
          startX,
          endX,
          y: y + config.rowHeight / 2,
          width: endX - startX,
          progress: Math.max(0, Math.min(1, progress)),
          dependencies: this._parseDependencies(record, config),
          color: this._getTaskColor(record, i),
        });
      }
    }
  }

  /** 绘制时间轴 */
  private _drawTimeline(
    ctx: CanvasRenderingContext2D,
    config: GanttViewConfig,
    scrollLeft: number,
    viewportWidth: number,
  ): void {
    const zoom = this._viewportManager.zoomLevel;
    const pixelsPerUnit = this._getPixelsPerUnit(config.timeUnit);
    const timelineHeight = config.timelineHeight * zoom;

    // 时间轴背景
    ctx.fillStyle = '#F8F9FA';
    ctx.fillRect(config.headerWidth, 0, viewportWidth - config.headerWidth, timelineHeight);

    // 时间轴底边框
    ctx.strokeStyle = '#D4D4D4';
    ctx.lineWidth = 1 * zoom;
    ctx.beginPath();
    ctx.moveTo(config.headerWidth, timelineHeight);
    ctx.lineTo(viewportWidth, timelineHeight);
    ctx.stroke();

    // 绘制时间刻度
    const startPixel = scrollLeft;
    const endPixel = scrollLeft + viewportWidth - config.headerWidth;
    const startDay = Math.floor(startPixel / pixelsPerUnit);
    const endDay = Math.ceil(endPixel / pixelsPerUnit);

    ctx.font = `${11 * zoom}px Arial, sans-serif`;
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    switch (config.timeUnit) {
      case 'day':
        for (let d = startDay; d <= endDay; d++) {
          const x = config.headerWidth + d * pixelsPerUnit - scrollLeft;
          const date = new Date(config.minDate.getTime() + d * 24 * 60 * 60 * 1000);
          const text = `${date.getMonth() + 1}/${date.getDate()}`;
          ctx.fillText(text, x + pixelsPerUnit / 2, timelineHeight / 2);

          // 刻度线
          ctx.strokeStyle = '#E0E0E0';
          ctx.lineWidth = 0.5 * zoom;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, timelineHeight);
          ctx.stroke();
        }
        break;

      case 'week': {
        for (let d = startDay; d <= endDay; d += 7) {
          const x = config.headerWidth + d * pixelsPerUnit - scrollLeft;
          const date = new Date(config.minDate.getTime() + d * 24 * 60 * 60 * 1000);
          const text = `${date.getMonth() + 1}月第${Math.ceil(date.getDate() / 7)}周`;
          ctx.fillText(text, x + pixelsPerUnit * 3.5, timelineHeight / 2);
        }
        break;
      }

      case 'month': {
        for (let d = startDay; d <= endDay; d += 30) {
          const x = config.headerWidth + d * pixelsPerUnit - scrollLeft;
          const date = new Date(config.minDate.getTime() + d * 24 * 60 * 60 * 1000);
          const text = `${date.getFullYear()}/${date.getMonth() + 1}`;
          ctx.fillText(text, x + pixelsPerUnit * 15, timelineHeight / 2);
        }
        break;
      }
    }
  }

  /** 绘制任务列表（左侧固定列） */
  private _drawTaskList(
    ctx: CanvasRenderingContext2D,
    records: RecordRow[],
    config: GanttViewConfig,
    scrollTop: number,
    viewportHeight: number,
  ): void {
    const zoom = this._viewportManager.zoomLevel;
    const headerWidth = config.headerWidth * zoom;
    const timelineHeight = config.timelineHeight * zoom;

    // 左侧背景
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, headerWidth, viewportHeight);

    // 列表头
    ctx.fillStyle = '#F5F5F5';
    ctx.fillRect(0, 0, headerWidth, timelineHeight);
    ctx.font = `bold ${12 * zoom}px Arial, sans-serif`;
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('任务', headerWidth / 2, timelineHeight / 2);

    // 列表边框
    ctx.strokeStyle = '#D4D4D4';
    ctx.lineWidth = 1 * zoom;
    ctx.beginPath();
    ctx.moveTo(headerWidth, 0);
    ctx.lineTo(headerWidth, viewportHeight);
    ctx.stroke();

    // 任务名称
    ctx.font = `${11 * zoom}px Arial, sans-serif`;
    ctx.fillStyle = '#333';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < records.length; i++) {
      const y = timelineHeight + i * config.rowHeight * zoom - scrollTop;
      if (y + config.rowHeight * zoom < 0 || y > viewportHeight) continue;

      const taskName = records[i][config.taskNameFieldId] || '未命名任务';
      const displayText = String(taskName).slice(0, 20);
      ctx.fillText(displayText, 8 * zoom, y + config.rowHeight * zoom / 2);

      // 行分隔线
      ctx.strokeStyle = '#E8E8E8';
      ctx.lineWidth = 0.5 * zoom;
      ctx.beginPath();
      ctx.moveTo(0, y + config.rowHeight * zoom);
      ctx.lineTo(headerWidth, y + config.rowHeight * zoom);
      ctx.stroke();
    }
  }

  /** 绘制网格线 */
  private _drawGridLines(
    ctx: CanvasRenderingContext2D,
    config: GanttViewConfig,
    scrollLeft: number,
    viewportWidth: number,
    viewportHeight: number,
  ): void {
    const zoom = this._viewportManager.zoomLevel;
    const pixelsPerUnit = this._getPixelsPerUnit(config.timeUnit);
    const timelineHeight = config.timelineHeight * zoom;

    ctx.strokeStyle = '#F0F0F0';
    ctx.lineWidth = 0.5 * zoom;

    const startDay = Math.floor(scrollLeft / pixelsPerUnit);
    const endDay = Math.ceil((scrollLeft + viewportWidth - config.headerWidth * zoom) / pixelsPerUnit);

    for (let d = startDay; d <= endDay; d++) {
      const x = config.headerWidth * zoom + d * pixelsPerUnit - scrollLeft;
      if (x < config.headerWidth * zoom) continue;

      ctx.beginPath();
      ctx.moveTo(x, timelineHeight);
      ctx.lineTo(x, viewportHeight);
      ctx.stroke();
    }
  }

  /** 绘制任务条 */
  private _drawTaskBars(
    ctx: CanvasRenderingContext2D,
    config: GanttViewConfig,
    scrollLeft: number,
    viewportWidth: number,
  ): void {
    const zoom = this._viewportManager.zoomLevel;
    const headerWidth = config.headerWidth * zoom;
    const barHeight = config.taskBarHeight * zoom;
    const radius = config.taskBarRadius * zoom;

    for (const [taskId, task] of this._tasks) {
      const drawX = headerWidth + task.startX - scrollLeft;
      const drawY = task.y - barHeight / 2;
      const width = Math.max(2, task.width);

      // 超出视口不绘制
      if (drawX + width < headerWidth || drawX > viewportWidth) continue;

      // 任务条背景
      ctx.fillStyle = task.color + '30';
      this._roundRect(ctx, drawX, drawY, width, barHeight, radius);
      ctx.fill();

      // 进度填充
      if (task.progress > 0) {
        const progressWidth = width * task.progress;
        ctx.fillStyle = task.color;
        this._roundRect(ctx, drawX, drawY, progressWidth, barHeight, radius);
        ctx.fill();
      }

      // 任务条边框
      ctx.strokeStyle = task.color;
      ctx.lineWidth = 1 * zoom;
      this._roundRect(ctx, drawX, drawY, width, barHeight, radius);
      ctx.stroke();

      // 任务名称（如果宽度足够）
      if (width > 40 * zoom) {
        const taskName = task.record[config.taskNameFieldId] || '';
        ctx.font = `bold ${10 * zoom}px Arial, sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const text = String(taskName).slice(0, Math.floor(width / (7 * zoom)));
        ctx.fillText(text, drawX + 6 * zoom, drawY + barHeight / 2);
      }
    }
  }

  /** 绘制依赖连线 */
  private _drawDependencies(
    ctx: CanvasRenderingContext2D,
    config: GanttViewConfig,
    scrollLeft: number,
    viewportWidth: number,
  ): void {
    const zoom = this._viewportManager.zoomLevel;
    const headerWidth = config.headerWidth * zoom;

    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1.5 * zoom;

    for (const [taskId, task] of this._tasks) {
      for (const depId of task.dependencies) {
        const depTask = this._tasks.get(depId);
        if (!depTask) continue;

        const fromX = headerWidth + depTask.endX - scrollLeft;
        const fromY = depTask.y;
        const toX = headerWidth + task.startX - scrollLeft;
        const toY = task.y;

        // 绘制贝塞尔曲线
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        const cp1x = fromX + Math.min(20 * zoom, (toX - fromX) / 2);
        const cp1y = fromY;
        const cp2x = toX - Math.min(20 * zoom, (toX - fromX) / 2);
        const cp2y = toY;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, toX, toY);
        ctx.stroke();

        // 箭头
        this._drawArrow(ctx, toX, toY, -1, 0, 6 * zoom);
      }
    }
  }

  /** 绘制箭头 */
  private _drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, size: number): void {
    const angle = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#999';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, -size / 2);
    ctx.lineTo(-size, size / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** 根据鼠标位置 hitTest 任务条 */
  hitTestTask(
    clientX: number, clientY: number,
    scrollLeft: number, scrollTop: number,
    config: GanttViewConfig,
  ): string | null {
    const zoom = this._viewportManager.zoomLevel;
    const headerWidth = config.headerWidth * zoom;
    const barHeight = config.taskBarHeight * zoom;

    for (const [taskId, task] of this._tasks) {
      const drawX = headerWidth + task.startX - scrollLeft;
      const drawY = task.y - barHeight / 2;
      const width = task.width;

      if (clientX >= drawX && clientX <= drawX + width &&
          clientY >= drawY && clientY <= drawY + barHeight) {
        return taskId;
      }
    }
    return null;
  }

  // ─── 辅助方法 ───

  private _getPixelsPerUnit(timeUnit: string): number {
    switch (timeUnit) {
      case 'hour': return 40;
      case 'day': return 40;
      case 'week': return 30;
      case 'month': return 60;
      case 'quarter': return 80;
      case 'year': return 120;
      default: return 40;
    }
  }

  private _getDaysBetween(start: Date, end: Date): number {
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }

  private _parseDependencies(record: RecordRow, config: GanttViewConfig): string[] {
    if (!config.dependencyFieldId) return [];
    const deps = record[config.dependencyFieldId];
    if (Array.isArray(deps)) return deps.map(String);
    if (typeof deps === 'string' && deps) return deps.split(',').map(s => s.trim());
    return [];
  }

  private _getTaskColor(record: RecordRow, index: number): string {
    const colors = [
      '#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#F44336',
      '#00BCD4', '#8BC34A', '#FFEB3B', '#FF5722', '#607D8B',
    ];
    return colors[index % colors.length];
  }

  private _roundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, width: number, height: number, radius: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}
