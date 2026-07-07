# 电子表格图表系统设计方案

## 1. 概述

为自研表格系统增加图表能力，支持柱状图、条形图、折线图、饼图/环形图四种基本图表类型，每种类型支持变体（如堆叠、多系列等）。

## 2. 功能需求

### 2.1 图表类型

| 类型 | 变体 | 描述 |
|------|------|------|
| 柱状图 (bar) | 普通、堆叠 | 垂直柱状，支持单/多系列 |
| 条形图 (horizontalBar) | 普通、堆叠 | 水平条形，支持单/多系列 |
| 折线图 (line) | 单线、多线 | 带数据点的折线，可平滑 |
| 饼图 (pie) | 普通、环形 | 扇形占比图，显示百分比 |

### 2.2 核心功能

1. **图表创建**：从选中的单元格数据创建图表
2. **图表编辑**：修改图表标题、颜色、图例等属性
3. **数据绑定**：图表与单元格数据自动同步
4. **图表位置**：图表作为浮动元素嵌入表格，可拖动调整位置
5. **图表大小**：可调整图表尺寸

## 3. 数据模型设计

### 3.1 图表类型定义

```typescript
// 图表类型
export type ChartType = 'bar' | 'horizontalBar' | 'line' | 'pie';

// 图表变体
export type ChartVariant = 'default' | 'stacked' | 'smooth' | 'donut';

// 图表数据源
export interface ChartDataSource {
  // 数据范围，如 "A1:B10"
  range: string;
  // 第一行是否为标题
  hasHeader: boolean;
  // 第一列是否为分类标签
  hasCategories: boolean;
}

// 图表数据（解析后）
export interface ChartData {
  // 分类标签（X轴或饼图标签）
  categories: string[];
  // 数据系列
  series: ChartSeries[];
}

// 单个数据系列
export interface ChartSeries {
  name: string;
  data: number[];
  color?: string;
}

// 图表配置
export interface ChartConfig {
  type: ChartType;
  variant: ChartVariant;
  title: string;
  showLegend: boolean;
  showDataLabels: boolean;
  colors: string[];
  // 饼图专用
  donutRatio?: number; // 环形图内圈比例 (0-1)
}

// 图表实例（存储于SheetModel）
export interface ChartInstance {
  id: string;
  name: string;
  // 数据源定义
  dataSource: ChartDataSource;
  // 图表配置
  config: ChartConfig;
  // 图表位置和尺寸（以单元格坐标为参考）
  position: {
    // 锚定单元格（图表左上角对齐的单元格）
    anchorRow: number;
    anchorCol: number;
    // 偏移量（像素）
    offsetX: number;
    offsetY: number;
    // 图表尺寸
    width: number;
    height: number;
  };
}
```

### 3.2 SheetModel 扩展

```typescript
export interface SheetModel {
  // ... 现有字段
  charts: ChartInstance[];
}
```

## 4. 渲染方案

### 4.1 渲染层设计

图表作为独立渲染层（Layer 7: CHARTS），位于所有单元格层之上：

```
Layer 1: BACKGROUND    (背景)
Layer 2: GRIDLINES     (网格线)
Layer 3: MERGE_CELLS   (合并单元格覆盖)
Layer 4: CONTENT       (单元格内容)
Layer 5: SELECTION     (选区高亮)
Layer 6: CURSOR        (光标)
Layer 7: CHARTS        (图表层 - 新增)
Layer 8: OVERLAY       (浮层、拖拽指示)
```

### 4.2 图表渲染方式

采用 **SVG 叠加层** 方案：

- 在 Canvas 层之上放置一个 SVG 容器
- 每个图表是一个独立的 SVG 元素
- 优势：矢量缩放、CSS 样式控制、交互友好
- 与 Canvas 坐标系统保持一致

### 4.3 图表渲染流程

1. 根据 `position` 计算图表在视口中的像素坐标
2. 创建/更新 SVG 元素
3. 解析数据并绘制图表
4. 处理图表交互（hover、click）

## 5. 模块设计

### 5.1 目录结构

```
packages/lingyi-doc-core/src/
├── chart/
│   ├── types.ts           # 图表类型定义
│   ├── ChartEngine.ts     # 图表渲染引擎
│   ├── ChartParser.ts     # 数据解析器
│   └── ChartModel.ts      # 图表模型管理

packages/lingyi-doc-editor/src/
├── components/
│   ├── chart/
│   │   ├── ChartContainer.tsx    # 图表容器组件
│   │   ├── ChartRenderer.tsx     # 图表渲染组件
│   │   ├── ChartInsertDialog.tsx # 插入图表对话框
│   │   └── ChartEditor.tsx       # 图表属性编辑器
```

### 5.2 核心类设计

#### ChartEngine

负责图表的 SVG 渲染：

```typescript
export class ChartEngine {
  // 渲染图表到 SVG 元素
  render(svg: SVGElement, data: ChartData, config: ChartConfig): void;
  
  // 各类型图表的绘制方法
  private drawBarChart(svg: SVGElement, data: ChartData, config: ChartConfig): void;
  private drawHorizontalBarChart(svg: SVGElement, data: ChartData, config: ChartConfig): void;
  private drawLineChart(svg: SVGElement, data: ChartData, config: ChartConfig): void;
  private drawPieChart(svg: SVGElement, data: ChartData, config: ChartConfig): void;
}
```

#### ChartParser

负责从单元格数据解析图表数据：

```typescript
export class ChartParser {
  // 从 FreeTable 和 DataSource 解析数据
  parse(table: FreeTable, dataSource: ChartDataSource): ChartData;
  
  // 解析单元格范围为矩阵
  private parseRange(table: FreeTable, range: string): (string | number)[][];
}
```

#### FreeTable 扩展

```typescript
export class FreeTable {
  // 图表管理
  addChart(chart: Omit<ChartInstance, 'id'>): ChartInstance;
  updateChart(id: string, updates: Partial<ChartInstance>): void;
  removeChart(id: string): void;
  getChart(id: string): ChartInstance | undefined;
  getAllCharts(): ChartInstance[];
  
  // 根据单元格坐标查找图表
  getChartsAt(row: number, col: number): ChartInstance[];
}
```

## 6. UI 交互设计

### 6.1 插入图表流程

1. 用户选中单元格数据区域
2. 点击工具栏"插入图表"按钮
3. 弹出图表类型选择对话框（如图1）
4. 选择图表类型和变体
5. 自动生成图表并嵌入表格

### 6.2 图表编辑器

点击图表打开属性面板，可编辑：
- 图表标题
- 数据范围
- 颜色方案
- 显示选项（图例、数据标签等）

### 6.3 图表操作

- **移动**：拖拽图表改变位置
- **缩放**：拖拽右下角调整大小
- **选中**：点击图表显示选中边框
- **删除**：选中后按 Delete 键

## 7. 实现步骤

### Phase 1: 基础类型和引擎
1. 定义图表类型接口
2. 实现 ChartEngine（SVG 渲染）
3. 实现 ChartParser（数据解析）

### Phase 2: 数据模型集成
1. 扩展 SheetModel 添加 charts 字段
2. 扩展 FreeTable 添加图表管理方法
3. 实现图表与单元格变更的同步

### Phase 3: UI 组件
1. 图表类型选择对话框
2. 图表容器组件（Overlay 层）
3. 图表属性编辑器

### Phase 4: 交互功能
1. 图表拖拽移动
2. 图表缩放调整
3. 图表选中/删除

## 8. 技术选型

- **渲染**：SVG（原生，无额外依赖）
- **颜色方案**：预设调色板（如图2中的蓝、绿、粉、橙）
- **动画**：CSS transitions（可选）

## 9. 预设配色方案

```typescript
export const CHART_COLOR_PALETTES = {
  default: ['#4285F4', '#34A853', '#EA4335', '#FBBC05', '#9C27B0', '#00BCD4'],
  pastel: ['#90CAF9', '#A5D6A7', '#EF9A9A', '#FFF59D', '#CE93D8', '#80DEEA'],
  // 更多配色...
};
```
