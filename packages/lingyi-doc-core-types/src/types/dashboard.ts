import type { FilterCondition, GroupRule, SortRule } from './index';

/** 聚合指标 */
export interface AggregateMetric {
  id: string;
  /** '*' 表示按记录计数 */
  fieldId: string | '*';
  op: 'count' | 'sum' | 'avg' | 'max' | 'min' | 'countDistinct';
  label?: string;
}

/** 多维表查询协议 —— 仪表盘聚合与明细下钻共用 */
export interface TableQuery {
  sheetId: string;
  viewId?: string;
  filter?: FilterCondition[];
  sort?: SortRule[];
  groupBy?: GroupRule[];
  metrics: AggregateMetric[];
  topN?: { metricId: string; n: number; order: 'asc' | 'desc' };
  timeBucket?: { fieldId: string; unit: 'day' | 'week' | 'month' | 'quarter' | 'year'; order?: 'asc' | 'desc' };
  /** 为 true 时保持分桶出现顺序（记录顺序），不做维度排序 */
  preserveBucketOrder?: boolean;
}

export interface AggregatedDataset {
  columns: Array<{ id: string; label: string; role: 'dimension' | 'metric' }>;
  rows: Array<Record<string, string | number | null>>;
  bucketRecordIds?: Record<string, string[]>;
  meta: {
    sheetId: string;
    totalSourceRows: number;
    computedAt: number;
    engine: 'client' | 'server';
  };
}

export type DashboardChartKind =
  | 'column'
  | 'bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'combo'
  | 'radar'
  | 'scatter'
  | 'bubble'
  | 'funnel'
  | 'wordCloud'
  | 'bidirectionalBar'
  | 'sankey'
  | 'treemap';

export type DashboardWidgetType =
  | 'metric.card'
  | 'metric.number'
  | `chart.${DashboardChartKind}`
  | 'rank.list'
  | 'text'
  | 'button'
  | 'image'
  | 'progress'
  | 'countdown'
  | 'nps'
  | 'filter'
  | 'layout.combo'
  | 'tabs'
  | 'lottery'
  | 'pivot'
  | 'ai.chart'
  | 'view.grid'
  | 'view.kanban'
  | 'view.calendar'
  | 'view.gantt'
  | 'view.gallery';

export interface ChartTextFormat {
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  italic?: boolean;
}

export interface ChartSeriesStyle {
  /** 当前编辑的系列标识（V1 单系列时可忽略） */
  selectedSeriesId?: string;
  customDisplayName?: boolean;
  displayName?: string;
  /** 折线形态 */
  lineStyle?: 'straight' | 'smooth' | 'step';
  lineColor?: string;
  lineDash?: 'solid' | 'dashed' | 'dotted';
  lineWidth?: number;
  pointVisibility?: 'always' | 'hover' | 'hidden';
  pointShape?: 'circle' | 'square' | 'diamond' | 'triangle';
  pointSize?: number;
  pointColor?: string;
  pointAxis?: 'left' | 'right';
  customPointColor?: boolean;
  labelVisibility?: 'always' | 'hidden';
  hideOverlappingLabels?: boolean;
  labelPosition?: 'default' | 'top' | 'bottom' | 'left' | 'right';
  labelContent?: { series?: boolean; category?: boolean; value?: boolean };
  labelFormat?: ChartTextFormat;
}

export interface ChartLegendStyle {
  position?: 'top' | 'bottom' | 'left' | 'right';
  textFormat?: ChartTextFormat;
}

export interface ChartTooltipStyle {
  enabled?: boolean;
  trigger?: 'axis' | 'item';
  width?: 'auto' | 'small' | 'medium' | 'large';
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  showTitle?: boolean;
  showTotal?: boolean;
  showSeries?: boolean;
}

export interface ChartAxisStyle {
  enabled?: boolean;
  title?: string;
  titleFormat?: ChartTextFormat;
  showLabel?: boolean;
  /** 如 20% */
  labelMaxHeight?: string;
  /** default | 0 | 45 | 90 | -45 */
  labelAngle?: string;
  labelFormat?: ChartTextFormat;
  showLine?: boolean;
  rangeMode?: 'fixed' | 'dynamic';
  min?: number | null;
  max?: number | null;
}

export interface ChartGridStyle {
  horizontal?: boolean;
  horizontalColor?: string;
  horizontalWidth?: number;
  horizontalTick?: boolean;
  vertical?: boolean;
  verticalColor?: string;
  verticalWidth?: number;
}

export interface DashboardChartDisplayConfig {
  chartKind: DashboardChartKind;
  title?: string;
  stack?: boolean;
  showLegend?: boolean;
  showLabel?: boolean;
  colors?: string[];
  /** 类目维度字段 */
  categoryFieldId?: string;
  /** 系列拆分字段（可选） */
  seriesFieldId?: string;
  metricIds?: string[];
  /** 排序：按名称 / 按数值 */
  sortBy?: 'name' | 'value';
  /** 条形/柱状等：纵轴值 | 横轴值 | 原记录顺序 */
  axisSort?: 'category' | 'value' | 'record';
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
  /** 颜色主题 id */
  colorThemeId?: string;
  /** 填充样式 */
  fillStyle?: 'solid' | 'gradient';
  /** 扇区/系列数值：记录数 / 字段值聚合 */
  valueMode?: 'recordCount' | 'fieldValue';
  /** valueMode=fieldValue 时的聚合字段与算子 */
  valueFieldId?: string;
  valueAgg?: AggregateMetric['op'];
  /** 数值数字格式：跟随源数据等 */
  valueNumberFormat?: 'follow' | 'number' | 'percent' | 'cny' | 'usd';
  /** 空值显示 */
  emptyValueDisplay?: 'blank' | 'zero' | 'skip';
  /** 分组聚合 */
  groupAgg?: 'none' | 'sum' | 'avg' | 'max' | 'min';
  /** 行列转置 */
  transpose?: boolean;
  /** 数据范围文案（视图名），空表示全部数据 */
  dataRangeLabel?: string;

  /** —— 自定义配置（外壳 / 字体 / 系列 / 轴等） —— */
  titleColor?: string;
  background?: string;
  borderColor?: string;
  borderWidth?: number;
  componentTextColor?: string;
  componentFontSize?: number;
  seriesStyle?: ChartSeriesStyle;
  legendStyle?: ChartLegendStyle;
  tooltipStyle?: ChartTooltipStyle;
  xAxis?: ChartAxisStyle;
  yAxis?: ChartAxisStyle;
  grid?: ChartGridStyle;
}

/** 指标卡数字格式 */
export type MetricNumberFormat = 'number' | 'percent' | 'cny' | 'usd';

/** 指标卡大数缩写 */
export type MetricLargeNumberAbbrev =
  | 'none'
  | 'k'
  | 'm'
  | 'b'
  | 'qian'
  | 'wan'
  | 'baiwan'
  | 'yi';

export interface DashboardMetricCardConfig {
  title?: string;
  /** 标题颜色 */
  titleColor?: string;
  /** 数值颜色，如 #faad14 */
  valueColor?: string;
  /** 卡片背景 tint */
  background?: string;
  /** 边框色；空或 `default` 表示跟随主题默认 */
  borderColor?: string;
  /** 边框粗细（px） */
  borderWidth?: number;
  /** 开启区间配色 */
  rangeColorEnabled?: boolean;
  /** 指标字号：自适应 / 自定义 */
  valueFontSizeMode?: 'adaptive' | 'custom';
  /** 自定义字号（px），仅 valueFontSizeMode=custom 时生效 */
  valueFontSize?: number;
  /** 数字格式 */
  numberFormat?: MetricNumberFormat;
  /** 小数位数 */
  decimalPlaces?: number;
  /** 大数缩写 */
  largeNumberAbbrev?: MetricLargeNumberAbbrev;
  /** 使用千位分隔符 */
  useThousandSeparator?: boolean;
  /** 数值说明 */
  valueDescription?: string;
  /** 统计方式：记录数等 */
  statMode?: 'recordCount' | 'fieldValue';
  valueFieldId?: string;
  valueAgg?: AggregateMetric['op'];
  showYoy?: boolean;
  showTrend?: boolean;
  dataRangeLabel?: string;
}

export interface DashboardRankListConfig {
  title?: string;
  labelFieldId?: string;
  metricId?: string;
}

/** 进度图形状 */
export type DashboardProgressShape = 'bar' | 'semicircle' | 'ring';

/** 进度图数值单位 */
export type DashboardProgressUnit = 'none' | 'cny' | 'usd' | 'custom';

/** 仪表盘进度图配置 */
export interface DashboardProgressConfig {
  title?: string;
  titleColor?: string;
  background?: string;
  borderColor?: string;
  borderWidth?: number;
  /** 条形 / 半圆环 / 圆环 */
  shape?: DashboardProgressShape;
  /** 数值 / 日期（V1 以数值为主） */
  valueType?: 'number' | 'date';
  /** 进度条/环颜色 */
  progressColor?: string;
  /** 百分比数字颜色 */
  percentColor?: string;
  /** 当前值文字颜色 */
  currentValueColor?: string;
  /** 目标值文字颜色 */
  targetValueColor?: string;
  /** 按完成度区间自动切换进度色 */
  rangeColorEnabled?: boolean;
  /** 达成目标（≥100%）时的视觉强调 */
  achieveEffectEnabled?: boolean;

  targetMode?: 'custom' | 'field';
  targetValue?: number;
  targetFieldId?: string;
  targetAgg?: AggregateMetric['op'];
  targetLabel?: string;

  currentMode?: 'custom' | 'field';
  currentValue?: number;
  currentFieldId?: string;
  currentAgg?: AggregateMetric['op'];
  currentLabel?: string;
  /** 统计方式文案：记录数 / 字段值 */
  currentStatMode?: 'recordCount' | 'fieldValue';
  dataRangeLabel?: string;

  /** 进度百分比小数位 */
  progressDecimalPlaces?: number;
  /** 当前/目标数值小数位 */
  decimalPlaces?: number;
  largeNumberAbbrev?: MetricLargeNumberAbbrev;
  useThousandSeparator?: boolean;
  unit?: DashboardProgressUnit;
  customUnit?: string;
  unitPosition?: 'left' | 'right';
}

/** 仪表盘「表格」视图组件：复用多维表网格 */
export interface DashboardGridViewConfig {
  title?: string;
  /** 绑定的 Base 视图 id（grid 视图） */
  viewId?: string;
  /** 是否展示轻量工具栏（筛选/分组/排序/查找） */
  showToolbar?: boolean;
  titleColor?: string;
  background?: string;
  borderColor?: string;
  borderWidth?: number;
}

export interface DashboardTextConfig {
  content?: string;
}

export interface DashboardWidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetDataBinding {
  query: TableQuery;
  listenGlobalFilters?: boolean;
}

export interface DashboardWidget {
  id: string;
  componentType: DashboardWidgetType;
  layout: DashboardWidgetLayout;
  title?: string;
  config: Record<string, unknown>;
  dataBinding?: WidgetDataBinding;
}

export interface DashboardModel {
  id: string;
  name: string;
  /** 默认绑定的数据表（同簿 Base sheet） */
  sourceSheetId: string;
  layout: {
    columns: number;
    rowHeight: number;
    gap: number;
  };
  widgets: DashboardWidget[];
  globalFilters?: FilterCondition[];
  version: number;
  createdAt: number;
  updatedAt: number;
}
