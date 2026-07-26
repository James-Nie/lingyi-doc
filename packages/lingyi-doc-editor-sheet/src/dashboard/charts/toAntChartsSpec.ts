import type { AggregatedDataset, DashboardChartDisplayConfig, DashboardChartKind } from '@lingyi-doc/core-types';

export interface AntChartsSpec {
  data: Array<Record<string, string | number | null>>;
  xField: string;
  yField: string;
  colorField?: string;
  angleField?: string;
  seriesField?: string;
  sizeField?: string;
  /** 桑基等关系图 */
  sourceField?: string;
  targetField?: string;
  valueField?: string;
  /** 折线空值是否连线 */
  connectNulls?: boolean;
}

function applyGroupAgg(
  rows: Array<Record<string, string | number | null>>,
  op: NonNullable<DashboardChartDisplayConfig['groupAgg']>,
): Array<Record<string, string | number | null>> {
  if (op === 'none') return rows;
  const buckets = new Map<string, number[]>();
  for (const row of rows) {
    const key = String(row.category ?? '(空)');
    const list = buckets.get(key) || [];
    const n = row.value == null ? null : Number(row.value);
    if (n != null && Number.isFinite(n)) list.push(n);
    buckets.set(key, list);
  }
  const result: Array<Record<string, string | number | null>> = [];
  let index = 0;
  for (const [category, nums] of buckets) {
    if (nums.length === 0) {
      result.push({ category, value: null, series: category, index: index++ });
      continue;
    }
    let value = 0;
    if (op === 'sum') value = nums.reduce((a, b) => a + b, 0);
    else if (op === 'avg') value = nums.reduce((a, b) => a + b, 0) / nums.length;
    else if (op === 'max') value = Math.max(...nums);
    else if (op === 'min') value = Math.min(...nums);
    result.push({
      category,
      value: Math.round(value * 100) / 100,
      series: category,
      index: index++,
    });
  }
  return result;
}

/** AggregatedDataset → Ant Design Charts 数据规格 */
export function toAntChartsSpec(
  dataset: AggregatedDataset,
  display: DashboardChartDisplayConfig,
): AntChartsSpec {
  const dims = dataset.columns.filter(c => c.role === 'dimension');
  const metrics = dataset.columns.filter(c => c.role === 'metric');
  const categoryKey =
    display.categoryFieldId
    || dims[0]?.id
    || 'category';
  const metricKey =
    display.metricIds?.[0]
    || metrics[0]?.id
    || 'count';
  const emptyMode = display.emptyValueDisplay || 'blank';
  const seriesName =
    display.seriesStyle?.customDisplayName && display.seriesStyle.displayName
      ? display.seriesStyle.displayName
      : (metrics[0]?.label || '数值');

  let data: Array<Record<string, string | number | null>> = [];
  dataset.rows.forEach((row, index) => {
    const raw = row[metricKey];
    const isEmpty = raw == null || raw === '' || (typeof raw === 'number' && !Number.isFinite(raw));
    if (isEmpty && emptyMode === 'skip') return;

    let value: number | null;
    if (isEmpty) {
      value = emptyMode === 'zero' ? 0 : null;
    } else {
      value = Number(raw);
      if (!Number.isFinite(value)) {
        if (emptyMode === 'skip') return;
        value = emptyMode === 'zero' ? 0 : null;
      }
    }

    data.push({
      category: String(row[categoryKey] ?? '(空)'),
      value,
      series: seriesName,
      index,
      [categoryKey]: String(row[categoryKey] ?? '(空)'),
      [metricKey]: value ?? 0,
    });
  });

  if (display.groupAgg && display.groupAgg !== 'none') {
    data = applyGroupAgg(data, display.groupAgg);
  }

  // 转置：非条形图种在渲染层交换字段；此处条形保持「值在 x」
  const kind: DashboardChartKind = display.chartKind;
  const transposed = !!display.transpose;

  if (kind === 'pie' || kind === 'donut') {
    return {
      data: data.map(d => ({ ...d, value: Number(d.value) || 0 })),
      xField: 'category',
      yField: 'value',
      colorField: 'category',
      angleField: 'value',
      seriesField: 'series',
    };
  }

  if (kind === 'bar' || kind === 'bidirectionalBar') {
    return {
      data,
      xField: transposed ? 'category' : 'value',
      yField: transposed ? 'value' : 'category',
      seriesField: 'series',
      connectNulls: emptyMode !== 'blank',
    };
  }

  if (kind === 'scatter' || kind === 'bubble') {
    return {
      data: data.map((d, i) => ({
        ...d,
        x: i + 1,
        y: Number(d.value) || 0,
        size: Math.max(4, Math.abs(Number(d.value) || 0)),
      })),
      xField: 'x',
      yField: 'y',
      sizeField: 'size',
      colorField: 'category',
      seriesField: 'series',
    };
  }

  if (kind === 'sankey') {
    const sankeyData = data.map(d => ({
      source: String(d.category),
      target: '合计',
      value: Math.max(0, Number(d.value) || 0),
    })).filter(d => d.value > 0);
    return {
      data: sankeyData,
      xField: 'source',
      yField: 'value',
      sourceField: 'source',
      targetField: 'target',
      valueField: 'value',
    };
  }

  if (kind === 'wordCloud' || kind === 'treemap' || kind === 'funnel' || kind === 'radar') {
    return {
      data: data.map(d => ({ ...d, value: Number(d.value) || 0 })),
      xField: 'category',
      yField: 'value',
      colorField: 'category',
      seriesField: 'series',
    };
  }

  // column / line / area / combo：类目在 x；transpose 时交换
  return {
    data,
    xField: transposed ? 'value' : 'category',
    yField: transposed ? 'category' : 'value',
    seriesField: 'series',
    connectNulls: emptyMode !== 'blank',
  };
}

export const DEFAULT_CHART_COLORS = [
  '#5B8FF9',
  '#5AD8A6',
  '#F6BD16',
  '#E86452',
  '#6DC8EC',
  '#945FB9',
  '#FF9845',
  '#1E9493',
];

/** 图表颜色主题（基础配置下拉） */
export const CHART_COLOR_THEMES: Array<{ id: string; colors: string[] }> = [
  { id: 'classic', colors: ['#5B8FF9', '#5AD8A6', '#F6BD16', '#E86452', '#945FB9', '#6DC8EC'] },
  { id: 'vivid', colors: ['#1677FF', '#52C41A', '#FA8C16', '#722ED1', '#13C2C2', '#EB2F96'] },
  { id: 'soft', colors: ['#91CAFF', '#B7EB8F', '#FFD666', '#FF9C6E', '#D3ADF7', '#87E8DE'] },
  { id: 'contrast', colors: ['#003A8C', '#08979C', '#D46B08', '#531DAB', '#CF1322', '#389E0D'] },
  { id: 'blue', colors: ['#003A8C', '#0958D9', '#1677FF', '#4096FF', '#69B1FF', '#91CAFF'] },
  { id: 'cyan', colors: ['#006D75', '#08979C', '#13C2C2', '#36CFC9', '#5CDBD3', '#87E8DE'] },
  { id: 'green', colors: ['#135200', '#237804', '#389E0D', '#52C41A', '#73D13D', '#95DE64'] },
  { id: 'yellow', colors: ['#AD6800', '#D48806', '#FAAD14', '#FFC53D', '#FFD666', '#FFE58F'] },
  { id: 'orange', colors: ['#AD2102', '#D4380D', '#FA541C', '#FF7A45', '#FF9C6E', '#FFBB96'] },
  { id: 'red', colors: ['#A8071A', '#CF1322', '#F5222D', '#FF4D4F', '#FF7875', '#FFA39E'] },
  { id: 'gray', colors: ['#141414', '#262626', '#434343', '#8C8C8C', '#BFBFBF', '#D9D9D9'] },
];

export function resolveChartThemeColors(themeId?: string, fallback?: string[]): string[] {
  const theme = CHART_COLOR_THEMES.find(t => t.id === themeId);
  if (theme) return theme.colors;
  if (fallback?.length) return fallback;
  return CHART_COLOR_THEMES[0].colors;
}

export const CHART_KIND_OPTIONS: Array<{ value: DashboardChartKind; label: string }> = [
  { value: 'column', label: '柱状图' },
  { value: 'bar', label: '基础条形图' },
  { value: 'line', label: '折线图' },
  { value: 'area', label: '面积图' },
  { value: 'pie', label: '饼图' },
  { value: 'donut', label: '环形图' },
  { value: 'combo', label: '组合图' },
  { value: 'radar', label: '雷达图' },
  { value: 'scatter', label: '散点图' },
  { value: 'bubble', label: '气泡图' },
  { value: 'funnel', label: '漏斗图' },
  { value: 'wordCloud', label: '词云' },
  { value: 'bidirectionalBar', label: '对比条形图' },
  { value: 'sankey', label: '桑基图' },
  { value: 'treemap', label: '矩形树图' },
];
