import type { BaseView, ColumnDef, DashboardChartKind, DashboardWidget, DashboardWidgetType } from '@lingyi-doc/core-types';

function pickDimension(columnDefs: ColumnDef[]) {
  return columnDefs.find(c => c.type === 'select' || c.type === 'multiSelect')
    || columnDefs.find(c => c.type === 'text')
    || columnDefs[0];
}

function pickDate(columnDefs: ColumnDef[]) {
  return columnDefs.find(c => c.type === 'date' || c.type === 'datetime');
}

function nextLayout(existing: DashboardWidget[]): DashboardWidget['layout'] {
  const maxY = existing.reduce((m, w) => Math.max(m, w.layout.y + w.layout.h), 0);
  return { x: 0, y: maxY, w: 6, h: 10 };
}

function chartTitle(kind: DashboardChartKind, dimName?: string, dateName?: string): string {
  if ((kind === 'line' || kind === 'area') && dateName) return `${dateName}趋势`;
  if (!dimName) return '未命名图表';
  if (kind === 'pie' || kind === 'donut' || kind === 'treemap') return `${dimName}占比`;
  if (kind === 'funnel') return `${dimName}漏斗`;
  if (kind === 'wordCloud') return `${dimName}词云`;
  if (kind === 'radar') return `${dimName}雷达`;
  if (kind === 'scatter' || kind === 'bubble') return `${dimName}分布`;
  if (kind === 'sankey') return `${dimName}流向`;
  if (kind === 'bidirectionalBar') return `${dimName}对比`;
  if (kind === 'combo') return `${dimName}组合图`;
  return `${dimName}分布`;
}

function groupCountBinding(sheetId: string, dimId?: string) {
  return {
    query: {
      sheetId,
      groupBy: dimId ? [{ fieldId: dimId, order: 'asc' as const }] : undefined,
      metrics: [{ id: 'count', fieldId: '*' as const, op: 'count' as const, label: '计数' }],
    },
    listenGlobalFilters: true,
  };
}

export function createWidgetByType(
  type: DashboardWidgetType,
  sheetId: string,
  columnDefs: ColumnDef[],
  existing: DashboardWidget[],
  options?: { views?: BaseView[]; activeViewId?: string },
): DashboardWidget {
  const now = Date.now();
  const id = `w_${type.replace(/\./g, '_')}_${now}`;
  const dim = pickDimension(columnDefs);
  const date = pickDate(columnDefs);
  const layout = nextLayout(existing);
  const views = options?.views ?? [];
  const defaultGridView =
    views.find(v => v.viewId === options?.activeViewId && v.viewType === 'grid')
    || views.find(v => v.viewType === 'grid')
    || views[0];

  if (type === 'metric.card' || type === 'metric.number') {
    return {
      id,
      componentType: type,
      title: type === 'metric.number' ? '统计数字' : '指标卡',
      layout: { ...layout, w: 6, h: 5 },
      config: {
        title: type === 'metric.number' ? '统计数字' : '指标卡',
        valueColor: '#262626',
        background: '#fff',
        borderColor: 'default',
        borderWidth: 1,
        valueFontSizeMode: 'adaptive',
        numberFormat: 'number',
        decimalPlaces: 0,
        largeNumberAbbrev: 'none',
        useThousandSeparator: true,
      },
      dataBinding: {
        query: {
          sheetId,
          metrics: [{ id: 'count', fieldId: '*', op: 'count', label: '计数' }],
        },
        listenGlobalFilters: true,
      },
    };
  }

  if (type.startsWith('chart.')) {
    const chartKind = type.replace('chart.', '') as DashboardChartKind;
    const useDate = (chartKind === 'line' || chartKind === 'area') && date;
    const title = chartTitle(chartKind, dim?.name, date?.name);
    return {
      id,
      componentType: type,
      title,
      layout,
      config: {
        chartKind,
        title,
        showLegend: true,
        showLabel: chartKind !== 'scatter' && chartKind !== 'bubble' && chartKind !== 'sankey',
        categoryFieldId: useDate ? `__time_${date!.id}` : dim?.id,
        metricIds: ['count'],
        colorThemeId: 'classic',
        colors: ['#5B8FF9', '#5AD8A6', '#F6BD16', '#E86452', '#945FB9', '#6DC8EC'],
        fillStyle: 'solid',
        sortOrder: (chartKind === 'line' || chartKind === 'area') ? 'asc' : 'desc',
        valueNumberFormat: 'follow',
        emptyValueDisplay: 'blank',
        groupAgg: 'none',
        borderColor: 'default',
        borderWidth: 1,
        componentFontSize: 11,
        seriesStyle: {
          lineStyle: 'straight',
          lineWidth: 2,
          lineColor: '#5B8FF9',
          pointVisibility: 'always',
          pointShape: 'circle',
          pointSize: 3,
          labelVisibility: chartKind !== 'scatter' && chartKind !== 'bubble' && chartKind !== 'sankey'
            ? 'always'
            : 'hidden',
          hideOverlappingLabels: true,
          labelContent: { value: true },
        },
        legendStyle: { position: 'top' },
        tooltipStyle: {
          enabled: true,
          trigger: 'axis',
          width: 'auto',
          borderWidth: 0,
          showTitle: true,
          showSeries: true,
        },
        xAxis: { enabled: true, showLabel: true, labelMaxHeight: '20%', showLine: false },
        yAxis: { enabled: true, showLabel: true, showLine: false, rangeMode: 'fixed' },
        grid: { horizontal: true, horizontalWidth: 0.5, vertical: false },
      },
      dataBinding: useDate
        ? {
            query: {
              sheetId,
              timeBucket: { fieldId: date!.id, unit: 'day' },
              metrics: [{ id: 'count', fieldId: '*', op: 'count', label: '计数' }],
            },
            listenGlobalFilters: true,
          }
        : groupCountBinding(sheetId, dim?.id),
    };
  }

  if (type === 'rank.list') {
    return {
      id,
      componentType: 'rank.list',
      title: dim ? `${dim.name}排行` : '排行榜',
      layout: { ...layout, w: 4, h: 10 },
      config: {
        title: dim ? `${dim.name}排行` : '排行榜',
        labelFieldId: dim?.id,
        metricId: 'count',
      },
      dataBinding: {
        query: {
          sheetId,
          groupBy: dim ? [{ fieldId: dim.id, order: 'asc' }] : undefined,
          metrics: [{ id: 'count', fieldId: '*', op: 'count', label: '计数' }],
          topN: { metricId: 'count', n: 10, order: 'desc' },
        },
        listenGlobalFilters: true,
      },
    };
  }

  if (type === 'text') {
    return {
      id,
      componentType: 'text',
      title: '文本',
      layout: { ...layout, w: 4, h: 4 },
      config: { content: '在此添加说明文字' },
    };
  }

  if (type === 'view.grid') {
    return {
      id,
      componentType: 'view.grid',
      title: '表格',
      layout: { ...layout, w: 12, h: 12 },
      config: {
        title: '表格',
        viewId: defaultGridView?.viewId,
        showToolbar: true,
        borderColor: 'default',
        borderWidth: 1,
      },
      // 明细网格直接读 Base 表行，不走聚合 dataset
      dataBinding: {
        query: {
          sheetId,
          viewId: defaultGridView?.viewId,
          metrics: [],
        },
        listenGlobalFilters: true,
      },
    };
  }

  if (type === 'progress') {
    return {
      id,
      componentType: 'progress',
      title: '进度图',
      layout: { ...layout, w: 4, h: 8 },
      config: {
        title: '进度图',
        shape: 'ring',
        valueType: 'number',
        progressColor: '#5B8FF9',
        targetMode: 'custom',
        targetValue: 200,
        targetLabel: '目标',
        currentMode: 'field',
        currentStatMode: 'recordCount',
        currentAgg: 'count',
        currentLabel: '当前',
        progressDecimalPlaces: 0,
        decimalPlaces: 0,
        largeNumberAbbrev: 'none',
        useThousandSeparator: true,
        unit: 'none',
        unitPosition: 'left',
        borderColor: 'default',
        borderWidth: 1,
        background: '#fff',
      },
      dataBinding: {
        listenGlobalFilters: true,
        query: {
          sheetId,
          metrics: [{ id: 'current', fieldId: '*', op: 'count', label: '当前' }],
        },
      },
    };
  }

  // 其余类型：创建占位卡片，后续版本补齐
  const labelMap: Partial<Record<DashboardWidgetType, string>> = {
    button: '按钮',
    image: '图片',
    countdown: '倒计时',
    nps: 'NPS 图',
    filter: '过滤器',
    'layout.combo': '组合布局',
    tabs: '标签页',
    lottery: '抽奖',
    pivot: '透视表',
    'ai.chart': 'AI 分析图表',
    'view.kanban': '看板',
    'view.calendar': '日历',
    'view.gantt': '甘特',
    'view.gallery': '画册',
  };

  return {
    id,
    componentType: type,
    title: labelMap[type] || '未命名组件',
    layout: { ...layout, w: 6, h: 6 },
    config: {
      title: labelMap[type] || '未命名组件',
      placeholder: true,
    },
  };
}
