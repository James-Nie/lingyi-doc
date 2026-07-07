// ==================== 图表类型定义 ====================

export type ChartType = 'bar' | 'horizontalBar' | 'line' | 'pie';

export type ChartVariant = 'default' | 'stacked' | 'donut';

export interface ChartDataSource {
  range: string;
  hasHeader: boolean;
  hasCategories: boolean;
}

export interface ChartData {
  categories: string[];
  series: ChartSeries[];
}

export interface ChartSeries {
  name: string;
  data: number[];
  color?: string;
}

export interface ChartConfig {
  type: ChartType;
  variant: ChartVariant;
  title: string;
  showLegend: boolean;
  showDataLabels: boolean;
  showBorder: boolean;
  showGridLines: boolean;
  colors: string[];
  donutRatio?: number;
}

export interface ChartPosition {
  anchorRow: number;
  anchorCol: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export interface ChartInstance {
  id: string;
  name: string;
  dataSource: ChartDataSource;
  config: ChartConfig;
  position: ChartPosition;
}

// ==================== 预设配色方案 ====================

export const CHART_COLOR_PALETTES: Record<string, string[]> = {
  // 通用配色
  default: ['#4285F4', '#34A853', '#EA4335', '#FBBC05', '#9C27B0', '#00BCD4', '#FF7043', '#66BB6A', '#AB47BC', '#26C6DA'],
  pastel: ['#90CAF9', '#A5D6A7', '#EF9A9A', '#FFF59D', '#CE93D8', '#80DEEA', '#FFCC80', '#C5E1A5', '#F48FB1', '#81D4FA'],
  bold: ['#E53935', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA', '#00ACC1', '#D81B60', '#3949AB', '#C0CA33', '#F4511E'],
  mono: ['#212121', '#424242', '#616161', '#757575', '#9E9E9E', '#BDBDBD', '#E0E0E0', '#EEEEEE', '#F5F5F5', '#FAFAFA'],
  // 饼图专属：高对比度发散色
  pie: ['#E53935', '#1E88E5', '#43A047', '#8E24AA', '#FB8C00', '#00ACC1', '#FFB300', '#3949AB', '#C0CA33', '#F4511E'],
  pieWarm: ['#FF6B35', '#FF9F1C', '#FFBF46', '#8AC926', '#6A4C93', '#1982C4', '#4B7F52', '#9C89B8', '#F45B69', '#F77F00'],
  // 折线图专属：柔和渐变系
  line: ['#1565C0', '#E53935', '#2E7D32', '#6A1B9A', '#E65100', '#00838F', '#283593', '#BF360C', '#1B5E20', '#4A148C'],
  lineSoft: ['#42A5F5', '#EF5350', '#66BB6A', '#AB47BC', '#FFA726', '#26C6DA', '#5C6BC0', '#EC407A', '#9CCC65', '#7E57C2'],
  // 柱状图/条形图：稳重商务色
  bar: ['#1A5276', '#117A65', '#B03A2E', '#7D3C98', '#BA4A00', '#1A5276', '#0E6655', '#7B241C', '#512E5F', '#935116'],
  barLight: ['#5DADE2', '#48C9B0', '#EC7063', '#AF7AC5', '#F0B27A', '#5DADE2', '#76D7C4', '#F1948A', '#D2B4DE', '#FAD7A0'],
};

/** 根据不同图表类型返回推荐的配色方案名称列表 */
export function getPaletteSuggestions(chartType: string): Record<string, string[]> {
  const all = CHART_COLOR_PALETTES;
  const common = { default: all.default, pastel: all.pastel, bold: all.bold };
  switch (chartType) {
    case 'pie':
      return { ...common, '高对比': all.pie, '暖色': all.pieWarm };
    case 'line':
      return { ...common, '深色系': all.line, '柔和系': all.lineSoft };
    case 'bar':
    case 'horizontalBar':
      return { ...common, '稳重': all.bar, '清爽': all.barLight };
    default:
      return { default: all.default, pastel: all.pastel, bold: all.bold, mono: all.mono };
  }
}
