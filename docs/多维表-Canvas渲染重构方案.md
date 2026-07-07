# 多维表 Canvas 渲染重构方案

> 版本：v1.0  
> 日期：2026-06-17  
> 目标：将多维表（Base）从 DOM 渲染全面重构为 Canvas 渲染，复用现有标准表/自由表 Canvas 引擎，实现高性能、百万行级数据流畅渲染。

---

## 一、现状分析

### 1.1 当前渲染架构

现有表格系统采用 **Canvas 多层渲染** 架构：

```
SheetContainer (React)
├── LayerManager          // 7 层 Canvas 叠加
│   ├── BACKGROUND (0)    // 单元格背景 + 行列头
│   ├── GRIDLINES (1)     // 网格线 + 单元格边框
│   ├── MERGE_CELLS (2)   // 合并区域覆盖
│   ├── CONTENT (3)       // 文本/数字/日期/公式等
│   ├── SELECTION (4)     // 选区高亮 + 公式范围高亮
│   ├── CURSOR (5)        // 光标/插入线
│   └── OVERLAY (6)       // 图表/浮动注释
├── CellEditor (DOM)      // 编辑态 DOM 浮层（定位在单元格上）
├── ChartOverlay (DOM)    // 图表 DOM 浮层
└── ContextMenu (DOM)     // 右键菜单
```

核心能力：
- `ViewportManager`：虚拟滚动、坐标转换、hitTest
- `CellRenderer`：文本、数字、布尔（checkbox）、日期、公式、链接、富文本的 Canvas 绘制
- `DirtyTracker`：脏矩形追踪，增量渲染
- `CellEditor`：编辑态 DOM 输入浮层（input/checkbox）

### 1.2 多维表目前的渲染方式

当前代码中 **多维表（Base）尚未独立实现**，其表格视图计划复用标准表/自由表的 Canvas 渲染引擎。但多维表特有的字段类型（如单选标签、人员头像、评分星星、进度条、关联字段等）的展示如果采用 DOM 渲染，会导致：

1. **性能瓶颈**：万行级数据产生大量 DOM 节点，滚动卡顿
2. **同步困难**：DOM 元素与 Canvas 滚动/缩放不同步，位置漂移
3. **层级混乱**：DOM 浮层与 Canvas 层叠关系复杂，z-index 管理困难
4. **内存爆炸**：每行每列一个 DOM 节点，内存占用巨大

**重构目标：所有展示态（非编辑态）统一用 Canvas 绘制，仅编辑态保留 DOM 浮层。**

---

## 二、重构总体思路

### 2.1 设计原则

| 原则 | 说明 |
|------|------|
| **展示态 Canvas 化** | 所有字段类型的展示态（只读）统一用 Canvas 绘制，不生成 DOM 节点 |
| **编辑态 DOM 化** | 单元格进入编辑态时，在对应位置叠加 DOM 输入控件（CellEditor 扩展） |
| **分层渲染** | 复用现有 7 层 Canvas 架构，新增字段类型渲染器 |
| **虚拟滚动** | 仅渲染可视区域，支持百万行级数据 |
| **异步资源管理** | 头像、附件缩略图等异步资源预加载 + 缓存 |

### 2.2 架构对比

```
Before (DOM 渲染):
┌─────────────────────────────────────────┐
│  <div class="base-table">               │
│    <div class="row"> × 10000           │  ← 大量 DOM 节点
│      <div class="cell"> × 200          │  ← 样式计算、布局、合成层爆炸
│        <span class="tag">标签</span>    │
│        <img src="avatar" />             │
│      </div>                             │
│    </div>                               │
│  </div>                                 │
└─────────────────────────────────────────┘

After (Canvas 渲染):
┌─────────────────────────────────────────┐
│  <canvas data-layer="background" />     │  ← 单元格背景 + 列头
│  <canvas data-layer="gridlines" />      │  ← 网格线 + 边框
│  <canvas data-layer="content" />        │  ← 标签/头像/进度条 Canvas 绘制
│  <canvas data-layer="selection" />      │  ← 选区高亮
│  <input data-cell-editor />             │  ← 仅编辑态 DOM 浮层
│  <div class="dropdown-portal" />        │  ← 下拉选择等 DOM 浮层
└─────────────────────────────────────────┘
```

---

## 三、核心重构模块

### 3.1 字段类型 Canvas 渲染扩展

#### 3.1.1 新增字段类型渲染器

在 `CellRenderer.drawCellContent()` 中扩展字段类型分支：

```typescript
// packages/lingyi-doc-core/src/renderer/BaseCellRenderer.ts
export class BaseCellRenderer extends CellRenderer {
  /** 绘制多维表字段内容 */
  drawBaseCellContent(
    ctx: CanvasRenderingContext2D,
    coord: CellCoord,
    cellData: CellData,
    columnDef: ColumnDef,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    mergeRanges?: CellRange[],
  ): void {
    const type = columnDef.type;
    switch (type) {
      case 'select':       this._drawSelectTag(ctx, cellData, columnDef); break;
      case 'multiSelect':  this._drawMultiSelectTags(ctx, cellData, columnDef); break;
      case 'user':         this._drawUserAvatar(ctx, cellData, columnDef); break;
      case 'rating':       this._drawRatingStars(ctx, cellData); break;
      case 'progress':     this._drawProgressBar(ctx, cellData); break;
      case 'attachment':   this._drawAttachmentIcon(ctx, cellData); break;
      case 'autoNumber':   this._drawAutoNumber(ctx, cellData); break;
      case 'currency':     this._drawCurrency(ctx, cellData); break;
      case 'percent':      this._drawPercent(ctx, cellData); break;
      // 复用基类：text, number, boolean, date, formula, link, email, phone
      default:             super.drawCellContent(ctx, coord, cellData, columnWidths, rowHeights, mergeRanges);
    }
  }
}
```

#### 3.1.2 各字段类型绘制方案

| 字段类型 | Canvas 绘制策略 | 关键实现 |
|---------|----------------|---------|
| **单选** | 彩色圆角矩形标签 | `ctx.roundRect()` + 填充色 + 文字居中 |
| **多选** | 多个彩色标签横向排列 | 循环绘制标签，超出宽度截断 + "+N" 省略 |
| **人员** | 圆形头像 + 名字文本 | 异步加载头像到 ImageBitmap，缓存到 Map |
| **评分** | 五角星图标（空/实） | 绘制 5 个五角星路径，按评分填充 |
| **进度** | 进度条背景 + 填充条 + 百分比 | 圆角矩形背景 + 填充宽度计算 |
| **附件** | 文件图标 + 数量角标 | 绘制文件图标路径 + 小圆角数字 |
| **货币** | 符号 + 千分位数字 | 复用 `formatNumber` + 符号前缀 |
| **百分比** | 数字 + % 符号 | 复用 `formatNumber` + percent 格式 |
| **自动编号** | 前缀 + 序列号 | 直接文本绘制，灰色前缀 |
| **关联** | 引用卡片（小圆角矩形 + 主字段值） | 圆角矩形 + 文本，点击展开详情浮层 |
| **查找引用** | 与关联字段一致 | 复用关联绘制逻辑 |

#### 3.1.3 单选/多选标签绘制示例

```typescript
private _drawSelectTag(ctx: CanvasRenderingContext2D, cellData: CellData, columnDef: ColumnDef, rect: Rect): void {
  if (!cellData || cellData.value.type === 'empty') return;
  const value = cellData.value.type === 'text' ? cellData.value.text : '';
  const option = columnDef.options?.find(o => o.name === value);
  if (!option) return;

  const zoom = this._viewportManager.zoomLevel;
  const padding = 6 * zoom;
  const tagHeight = 20 * zoom;
  const fontSize = 12 * zoom;
  const borderRadius = 4 * zoom;

  // 测量文字宽度
  ctx.font = `${fontSize}px Arial, sans-serif`;
  const textWidth = ctx.measureText(value).width;
  const tagWidth = Math.min(textWidth + padding * 2, rect.width - 4);

  // 标签背景
  ctx.fillStyle = option.color + '20'; // 20% 透明度
  ctx.beginPath();
  ctx.roundRect(rect.x + 2, rect.y + (rect.height - tagHeight) / 2, tagWidth, tagHeight, borderRadius);
  ctx.fill();

  // 标签边框（同色系）
  ctx.strokeStyle = option.color;
  ctx.lineWidth = 0.5 * zoom;
  ctx.stroke();

  // 文字
  ctx.fillStyle = option.color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const textX = rect.x + 2 + padding;
  const textY = rect.y + rect.height / 2;
  ctx.fillText(value, textX, textY);
}
```

#### 3.1.4 人员头像绘制（异步资源管理）

```typescript
// 异步头像缓存
const avatarCache = new Map<string, ImageBitmap>();

private _drawUserAvatar(ctx: CanvasRenderingContext2D, cellData: CellData, columnDef: ColumnDef, rect: Rect): void {
  const userId = cellData.value.type === 'text' ? cellData.value.text : '';
  if (!userId) return;

  const zoom = this._viewportManager.zoomLevel;
  const avatarSize = Math.min(24 * zoom, rect.height - 4);
  const cx = rect.x + 2 + avatarSize / 2;
  const cy = rect.y + rect.height / 2;
  const radius = avatarSize / 2;

  // 绘制圆形裁剪区
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  const avatar = avatarCache.get(userId);
  if (avatar) {
    ctx.drawImage(avatar, cx - radius, cy - radius, avatarSize, avatarSize);
  } else {
    // 绘制默认头像（首字母 + 背景色）
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(cx - radius, cy - radius, avatarSize, avatarSize);
    ctx.fillStyle = '#666';
    ctx.font = `${12 * zoom}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(userId.charAt(0).toUpperCase(), cx, cy);
  }
  ctx.restore();

  // 绘制名字文本
  const nameX = cx + radius + 4 * zoom;
  ctx.fillStyle = '#333';
  ctx.font = `${12 * zoom}px Arial`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(userId, nameX, cy);
}
```

#### 3.1.5 异步资源预加载机制

```typescript
// packages/lingyi-doc-core/src/renderer/AsyncAssetManager.ts
export class AsyncAssetManager {
  private _imageCache = new Map<string, ImageBitmap>();
  private _pendingLoads = new Set<string>();
  private _onAssetLoaded: (() => void) | null = null;

  async loadAvatar(url: string): Promise<void> {
    if (this._imageCache.has(url) || this._pendingLoads.has(url)) return;
    this._pendingLoads.add(url);

    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      this._imageCache.set(url, bitmap);
      this._pendingLoads.delete(url);
      this._onAssetLoaded?.();
    } catch {
      this._pendingLoads.delete(url);
    }
  }

  getAvatar(url: string): ImageBitmap | undefined {
    return this._imageCache.get(url);
  }

  setOnAssetLoaded(callback: () => void): void {
    this._onAssetLoaded = callback;
  }
}
```

### 3.2 编辑态 DOM 浮层架构

编辑态保留 DOM 浮层，但统一由 Canvas 层调度：

```
编辑态触发流程:
1. 用户双击/按 Enter 进入编辑态
2. Canvas 层通过 hitTest 定位单元格
3. 计算单元格在屏幕上的像素坐标
4. 在对应位置创建/定位 DOM 浮层
5. 根据字段类型选择浮层类型:
   - text/number/currency/percent/date/email/phone/link/formula/autoNumber → <input>
   - boolean → <input type="checkbox">
   - select → <CustomSelect> (下拉组件，定位在单元格下方)
   - multiSelect → <CustomMultiSelect> (多选标签 + 下拉)
   - user → <UserPicker> (人员搜索选择器)
   - attachment → <FileUploader> (文件上传组件)
   - rating → <StarRating> (交互式星星)
   - progress → <ProgressSlider> (滑块)
6. 提交/取消后销毁 DOM 浮层，Canvas 层重绘该单元格
```

#### 3.2.1 统一浮层管理器

```typescript
// packages/lingyi-doc-editor/src/components/CellEditor/BaseCellEditor.tsx
export interface BaseEditorOverlayProps {
  coord: CellCoord;
  rect: { x: number; y: number; width: number; height: number };
  columnDef: ColumnDef;
  initialValue: CellValue;
  onCommit: (value: CellValue) => void;
  onCancel: () => void;
}

export const BaseCellEditor: React.FC<BaseEditorOverlayProps> = ({
  coord, rect, columnDef, initialValue, onCommit, onCancel
}) => {
  // 根据 columnDef.type 路由到不同编辑器
  switch (columnDef.type) {
    case 'select': return <SelectEditor {...{rect, columnDef, initialValue, onCommit, onCancel}} />;
    case 'multiSelect': return <MultiSelectEditor {...props} />;
    case 'user': return <UserPickerEditor {...props} />;
    case 'date': return <DateEditor {...props} />;
    case 'datetime': return <DateTimeEditor {...props} />;
    case 'attachment': return <AttachmentEditor {...props} />;
    case 'rating': return <RatingEditor {...props} />;
    case 'progress': return <ProgressEditor {...props} />;
    default: return <TextInputEditor {...props} />; // 复用现有 CellEditor
  }
};
```

#### 3.2.2 浮层定位策略

```typescript
// 计算浮层在屏幕上的绝对位置
function calculateEditorPosition(
  coord: CellCoord,
  viewportManager: ViewportManager,
  columnWidths: Map<number, number>,
  rowHeights: Map<number, number>,
  containerRect: DOMRect,
): { x: number; y: number; width: number; height: number } {
  const cellRect = viewportManager.getCellRect(coord, columnWidths, rowHeights);
  return {
    x: containerRect.left + cellRect.x,
    y: containerRect.top + cellRect.y,
    width: cellRect.width,
    height: cellRect.height,
  };
}

// 编辑器样式（绝对定位覆盖在 Canvas 上）
const editorStyle: React.CSSProperties = {
  position: 'fixed',
  left: `${x}px`,
  top: `${y}px`,
  width: `${width}px`,
  height: `${height}px`,
  zIndex: 1000,
  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  border: '1px solid #1a73e8',
  borderRadius: '2px',
  background: '#fff',
};
```

### 3.3 多视图 Canvas 渲染

多维表支持多视图：表格、看板、甘特、日历、画廊、表单。其中：
- **表格视图**：复用现有 Canvas 引擎 + 字段类型扩展
- **看板视图**：新建 Canvas 渲染模块
- **甘特视图**：新建 Canvas 渲染模块
- **日历视图**：新建 Canvas 渲染模块
- **画廊视图**：新建 Canvas 渲染模块
- **表单视图**：DOM 渲染（面向外部用户，不需要 Canvas 性能）

#### 3.3.1 看板视图（Kanban）Canvas 渲染

```typescript
// packages/lingyi-doc-core/src/renderer/views/KanbanRenderer.ts
export class KanbanRenderer {
  private _viewportManager: ViewportManager;
  private _cardRenderer: CardRenderer;

  constructor(viewportManager: ViewportManager) {
    this._viewportManager = viewportManager;
    this._cardRenderer = new CardRenderer(viewportManager);
  }

  render(
    ctx: CanvasRenderingContext2D,
    viewConfig: KanbanViewConfig,
    records: RecordRow[],
    columnDefs: ColumnDef[],
  ): void {
    // 1. 按分组字段值分组
    const groups = this._groupRecords(records, viewConfig.groupFieldId);

    // 2. 绘制列头（分组值）
    let columnX = 0;
    for (const group of groups) {
      this._drawColumnHeader(ctx, group.name, columnX, viewConfig.columnWidth);
      // 3. 绘制列内卡片（虚拟滚动）
      const visibleCards = this._calculateVisibleCards(group.records, columnX);
      for (const card of visibleCards) {
        this._cardRenderer.drawCard(ctx, card, columnDefs, viewConfig.cardFields);
      }
      columnX += viewConfig.columnWidth + viewConfig.columnGap;
    }
  }
}
```

#### 3.3.2 甘特视图（Gantt）Canvas 渲染

```typescript
// packages/lingyi-doc-core/src/renderer/views/GanttRenderer.ts
export class GanttRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    viewConfig: GanttViewConfig,
    records: RecordRow[],
  ): void {
    // 1. 绘制时间轴（顶部/左侧）
    this._drawTimeline(ctx, viewConfig.timeUnit, viewConfig.startDate, viewConfig.endDate);
    // 2. 绘制任务条（虚拟滚动）
    for (const record of visibleRecords) {
      const startX = this._dateToX(record.startDate);
      const endX = this._dateToX(record.endDate);
      const y = this._rowToY(record._order);
      this._drawTaskBar(ctx, startX, endX, y, record.progress, record.color);
    }
    // 3. 绘制依赖连线（贝塞尔曲线）
    this._drawDependencyLines(ctx, viewConfig.dependencies);
  }
}
```

#### 3.3.3 日历视图（Calendar）Canvas 渲染

```typescript
// packages/lingyi-doc-core/src/renderer/views/CalendarRenderer.ts
export class CalendarRenderer {
  render(ctx: CanvasRenderingContext2D, viewConfig: CalendarViewConfig, records: RecordRow[]): void {
    // 1. 绘制月/周/日网格
    this._drawCalendarGrid(ctx, viewConfig.viewType, viewConfig.dateField);
    // 2. 将记录按日期映射到对应格
    const dateMap = this._mapRecordsToDates(records, viewConfig.dateField);
    // 3. 绘制日期格内的记录卡片（限制每格数量，溢出显示 +N）
    for (const [dateKey, dayRecords] of dateMap) {
      const cellRect = this._getDateCellRect(dateKey);
      this._drawDayCell(ctx, cellRect, dayRecords, viewConfig.maxCardsPerDay);
    }
  }
}
```

#### 3.3.4 画廊视图（Gallery）Canvas 渲染

```typescript
// packages/lingyi-doc-core/src/renderer/views/GalleryRenderer.ts
export class GalleryRenderer {
  render(ctx: CanvasRenderingContext2D, viewConfig: GalleryViewConfig, records: RecordRow[]): void {
    // 1. 计算瀑布流/网格布局
    const layout = this._calculateLayout(records, viewConfig.layoutType, viewConfig.cardSize);
    // 2. 虚拟滚动：仅渲染可视区域卡片
    for (const card of visibleCards) {
      this._drawGalleryCard(ctx, card, viewConfig.coverField, viewConfig.displayFields);
    }
  }
}
```

### 3.4 性能优化策略

#### 3.4.1 现有优化复用

| 优化项 | 现有实现 | 多维表扩展 |
|--------|---------|-----------|
| 虚拟滚动 | `ViewportManager.calculateVisibleRange()` | 复用，看板/甘特/日历扩展计算逻辑 |
| 脏矩形追踪 | `DirtyTracker.markDirtyRange()` | 复用，卡片拖拽/字段变更触发局部重绘 |
| 增量渲染 | 仅重绘变更层 | 复用，头像加载后仅重绘 CONTENT 层 |
| 字体预测量 | `ctx.measureText()` | 复用，标签宽度计算 |
| requestAnimationFrame | `scheduleRender()` | 复用 |

#### 3.4.2 新增优化

```typescript
// 1. 图片资源预加载 + 缓存
class ImageCache {
  private _cache = new Map<string, ImageBitmap>();
  private _maxSize = 100; // 最多缓存 100 张图片

  async preload(urls: string[]): Promise<void> {
    const promises = urls.map(url => this._load(url));
    await Promise.all(promises);
  }

  private async _load(url: string): Promise<void> {
    if (this._cache.has(url)) return;
    if (this._cache.size >= this._maxSize) {
      const first = this._cache.keys().next().value;
      this._cache.delete(first); // LRU: 简单删除最早项
    }
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      this._cache.set(url, bitmap);
    } catch { /* ignore */ }
  }
}

// 2. 文本测量缓存
class TextMetricsCache {
  private _cache = new Map<string, TextMetrics>();

  measure(ctx: CanvasRenderingContext2D, text: string, font: string): TextMetrics {
    const key = `${font}:${text}`;
    if (!this._cache.has(key)) {
      this._cache.set(key, ctx.measureText(text));
    }
    return this._cache.get(key)!;
  }
}

// 3. 卡片/记录对象池（看板/甘特/日历）
class RecordCardPool {
  private _pool: RecordCard[] = [];
  acquire(): RecordCard { return this._pool.pop() || new RecordCard(); }
  release(card: RecordCard): void { this._pool.push(card); }
}

// 4. 离屏 Canvas 预渲染（固定列头/卡片模板）
class OffscreenRenderer {
  private _templates = new Map<string, OffscreenCanvas>();

  renderTemplate(template: string, width: number, height: number): OffscreenCanvas {
    if (this._templates.has(template)) return this._templates.get(template)!;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    // 绘制模板...
    this._templates.set(template, canvas);
    return canvas;
  }
}
```

### 3.5 交互事件处理

#### 3.5.1 事件路由

```typescript
// 统一事件处理：Canvas 层接收所有事件，分发到不同视图
class InteractionManager {
  private _currentView: 'grid' | 'kanban' | 'gantt' | 'calendar' | 'gallery';

  onMouseDown(e: MouseEvent): void {
    const coord = this._hitTest(e);
    switch (this._currentView) {
      case 'grid': this._gridInteraction.onMouseDown(coord, e); break;
      case 'kanban': this._kanbanInteraction.onMouseDown(coord, e); break;
      case 'gantt': this._ganttInteraction.onMouseDown(coord, e); break;
      case 'calendar': this._calendarInteraction.onMouseDown(coord, e); break;
      case 'gallery': this._galleryInteraction.onMouseDown(coord, e); break;
    }
  }

  onMouseMove(e: MouseEvent): void {
    // 拖拽处理：卡片拖拽、任务条调整、甘特依赖连线
  }

  onMouseUp(e: MouseEvent): void {
    // 提交拖拽结果
  }
}
```

#### 3.5.2 看板卡片拖拽

```typescript
class KanbanDragManager {
  private _dragState: {
    card: RecordRow;
    startX: number;
    startY: number;
    sourceColumn: string;
    ghostCanvas: HTMLCanvasElement; // 拖拽时的半透明卡片
  } | null = null;

  onDragStart(card: RecordRow, e: MouseEvent): void {
    // 1. 创建 ghost Canvas（预渲染卡片半透明副本）
    this._dragState = {
      card,
      startX: e.clientX,
      startY: e.clientY,
      sourceColumn: card.groupValue,
      ghostCanvas: this._createGhost(card),
    };
  }

  onDragMove(e: MouseEvent): void {
    if (!this._dragState) return;
    // 2. 更新 ghost 位置
    this._updateGhostPosition(e.clientX, e.clientY);
    // 3. 计算目标列（吸附逻辑）
    const targetColumn = this._hitTestColumn(e.clientX);
    // 4. 高亮目标列
    this._highlightColumn(targetColumn);
  }

  onDragEnd(e: MouseEvent): void {
    if (!this._dragState) return;
    const targetColumn = this._hitTestColumn(e.clientX);
    if (targetColumn && targetColumn !== this._dragState.sourceColumn) {
      // 5. 更新数据模型
      this._updateRecordGroup(this._dragState.card, targetColumn);
    }
    this._dragState = null;
  }
}
```

---

## 四、复用分析

### 4.1 可完全复用（无需修改）

| 模块 | 复用度 | 说明 |
|------|--------|------|
| `ViewportManager` | 100% | 虚拟滚动、坐标转换、hitTest、zoom |
| `LayerManager` | 100% | 7 层 Canvas 叠加、DPR 处理、resize |
| `DirtyTracker` | 100% | 脏矩形追踪、合并算法 |
| `SelectionManager` | 100% | 选区逻辑、键盘导航 |
| `ClipboardManager` | 100% | 复制/剪切/粘贴 |
| `RecalcEngine` | 100% | 公式计算、依赖图 |
| `Collab` | 100% | CRDT + WebSocket 协同 |

### 4.2 可扩展复用（需要增强）

| 模块 | 复用度 | 增强内容 |
|------|--------|---------|
| `CellRenderer` | 70% | 新增 `drawBaseCellContent()` 方法，扩展字段类型绘制 |
| `SheetContainer` | 80% | 新增视图路由（grid/kanban/gantt/calendar/gallery），扩展事件处理 |
| `CellEditor` | 60% | 从单一 `<input>` 扩展为字段类型感知编辑器路由 |
| `sheetStore` | 85% | 新增视图状态（currentView、viewConfig）、筛选/排序状态 |

### 4.3 需要新建

| 模块 | 说明 |
|------|------|
| `BaseCellRenderer` | 多维表字段类型 Canvas 绘制器 |
| `AsyncAssetManager` | 异步头像/缩略图预加载管理 |
| `TextMetricsCache` | 文本测量缓存 |
| `KanbanRenderer` | 看板视图 Canvas 渲染 |
| `GanttRenderer` | 甘特视图 Canvas 渲染 |
| `CalendarRenderer` | 日历视图 Canvas 渲染 |
| `GalleryRenderer` | 画廊视图 Canvas 渲染 |
| `ViewManager` | 视图状态管理（视图切换、配置持久化） |
| `KanbanDragManager` | 看板卡片拖拽交互 |
| `GanttDragManager` | 甘特任务条拖拽/调整交互 |

---

## 五、实施路线

### 第一阶段：基础 Canvas 绘制能力（2-3 周）

**目标**：多维表表格视图的所有字段类型支持 Canvas 绘制。

1. 创建 `BaseCellRenderer`，继承 `CellRenderer`
2. 实现单选/多选标签绘制
3. 实现人员头像绘制（含异步加载）
4. 实现评分/进度/附件/自动编号绘制
5. 扩展 `SheetContainer` 支持 `SheetModel.type === 'base'` 路由
6. 联调测试：确保所有字段类型在 Canvas 中正确展示

### 第二阶段：编辑态 DOM 浮层（2 周）

**目标**：所有字段类型进入编辑态时有正确的 DOM 输入控件。

1. 重构 `CellEditor` 为 `BaseCellEditor`（字段类型路由）
2. 实现 SelectEditor（下拉选择）
3. 实现 MultiSelectEditor（多选标签）
4. 实现 UserPickerEditor（人员搜索）
5. 实现 DateEditor/DateTimeEditor（日期选择）
6. 实现 AttachmentEditor（文件上传）
7. 实现 RatingEditor/ProgressEditor（交互式编辑）
8. 浮层定位与滚动同步（编辑时跟随滚动）

### 第三阶段：看板视图 Canvas 渲染（2-3 周）

**目标**：看板视图支持 Canvas 渲染 + 虚拟滚动 + 卡片拖拽。

1. 实现 `KanbanRenderer`（列头 + 卡片网格 + 虚拟滚动）
2. 实现卡片绘制（字段布局、封面图、缩略信息）
3. 实现 `KanbanDragManager`（卡片拖拽、列切换、动画）
4. 看板视图筛选/排序

### 第四阶段：甘特视图 Canvas 渲染（2-3 周）

**目标**：甘特视图支持 Canvas 渲染 + 时间轴 + 任务依赖。

1. 实现 `GanttRenderer`（时间轴 + 任务条 + 虚拟滚动）
2. 实现时间轴缩放（日/周/月/季度/年）
3. 实现任务条拖拽调整（起止日期）
4. 实现依赖连线绘制（贝塞尔曲线）
5. 实现里程碑标记

### 第五阶段：日历 + 画廊视图（2-3 周）

1. 实现 `CalendarRenderer`（月/周/日视图 + 虚拟滚动）
2. 实现 `GalleryRenderer`（网格/瀑布流 + 虚拟滚动）
3. 拖拽调整日期（日历 ↔ 数据同步）

### 第六阶段：性能优化与测试（2 周）

1. 图片资源预加载优化
2. 文本测量缓存
3. 大数据量测试（10万/100万行）
4. 内存泄漏检测
5. 性能基准测试（首屏加载、滚动 FPS、编辑响应）

---

## 六、风险评估与应对

| 风险 | 影响 | 应对策略 |
|------|------|---------|
| Canvas 绘制复杂 UI 开发成本高 | 中 | 优先级排序：先实现高频字段（单选/多选/人员），低频字段（附件预览）后续迭代 |
| 异步图片加载导致闪烁 | 中 | 预加载 + 默认占位图（首字母/灰色背景） |
| 看板/甘特拖拽性能 | 中 | 拖拽时使用 ghost Canvas（离屏预渲染），避免实时重绘 |
| 移动端触摸交互 | 高 | 单独评估移动端是否需要 Canvas 渲染（可能保留 DOM 渲染） |
| 可访问性（A11y） | 高 | 编辑态 DOM 化保障屏幕阅读器；展示态提供 ARIA live region 播报 |
| 浏览器兼容性 | 低 | 仅使用 Canvas 2D API（不使用 WebGL），兼容所有现代浏览器 |
| 打印/导出 PDF | 中 | 导出时通过 Canvas 截图或后端渲染 |

---

## 七、性能指标目标

| 指标 | 目标值 | 验证方式 |
|------|--------|---------|
| 首屏加载（万行级） | < 1.5s | Performance API 测量 |
| 滚动 FPS | ≥ 60fps | Chrome DevTools FPS 计数器 |
| 单元格编辑响应延迟 | < 100ms | 从双击到编辑器出现 |
| 10万行表格滚动 | 无卡顿 | 手动测试 + FPS 监控 |
| 看板视图卡片拖拽 | 流畅，无掉帧 | 手动测试 |
| 甘特视图时间轴缩放 | < 200ms | 缩放操作耗时测量 |
| 内存占用（10万行） | < 200MB | Chrome DevTools Memory |

---

## 八、附录：代码目录规划

```
packages/lingyi-doc-core/src/
├── renderer/
│   ├── index.ts                    # 现有：ViewportManager, LayerManager, CellRenderer, DirtyTracker
│   ├── BaseCellRenderer.ts         # 新增：多维表字段类型 Canvas 绘制
│   ├── AsyncAssetManager.ts        # 新增：异步图片资源管理
│   └── views/
│       ├── KanbanRenderer.ts       # 新增：看板视图
│       ├── GanttRenderer.ts        # 新增：甘特视图
│       ├── CalendarRenderer.ts     # 新增：日历视图
│       └── GalleryRenderer.ts      # 新增：画廊视图

packages/lingyi-doc-editor/src/
├── components/
│   ├── SheetContainer.tsx          # 修改：增加视图路由
│   ├── CellEditor.tsx              # 修改：扩展为 BaseCellEditor 路由
│   └── editors/                    # 新增：各字段类型编辑器
│       ├── BaseCellEditor.tsx
│       ├── SelectEditor.tsx
│       ├── MultiSelectEditor.tsx
│       ├── UserPickerEditor.tsx
│       ├── DateEditor.tsx
│       ├── DateTimeEditor.tsx
│       ├── AttachmentEditor.tsx
│       ├── RatingEditor.tsx
│       └── ProgressEditor.tsx
├── views/                          # 新增：多视图容器组件
│   ├── KanbanView.tsx
│   ├── GanttView.tsx
│   ├── CalendarView.tsx
│   └── GalleryView.tsx
```
