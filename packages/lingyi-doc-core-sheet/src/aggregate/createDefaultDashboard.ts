import type { ColumnDef } from '@lingyi-doc/core-types';
import type { DashboardModel, DashboardWidget } from '@lingyi-doc/core-types';

function pickFields(columnDefs: ColumnDef[]) {
  const selects = columnDefs.filter(c => c.type === 'select' || c.type === 'multiSelect');
  const dates = columnDefs.filter(c => c.type === 'date' || c.type === 'datetime');
  const texts = columnDefs.filter(c => c.type === 'text' || c.type === 'autoNumber');
  const numbers = columnDefs.filter(c =>
    c.type === 'number' || c.type === 'currency' || c.type === 'percent' || c.type === 'rating' || c.type === 'progress',
  );
  return {
    dim1: selects[0] || texts[0] || columnDefs[0],
    dim2: selects[1] || selects[0] || texts[1] || columnDefs[1] || columnDefs[0],
    dim3: selects[2] || texts[0] || columnDefs[0],
    date: dates[0],
    number: numbers[0],
  };
}

function metricCount(sheetId: string) {
  return {
    query: {
      sheetId,
      metrics: [{ id: 'count', fieldId: '*' as const, op: 'count' as const, label: '计数' }],
    },
    listenGlobalFilters: true,
  };
}

function groupCount(sheetId: string, fieldId: string, topN?: number) {
  return {
    query: {
      sheetId,
      groupBy: [{ fieldId, order: 'asc' as const }],
      metrics: [{ id: 'count', fieldId: '*' as const, op: 'count' as const, label: '计数' }],
      ...(topN ? { topN: { metricId: 'count', n: topN, order: 'desc' as const } } : {}),
    },
    listenGlobalFilters: true,
  };
}

/**
 * 根据当前表字段生成一版接近产品示意的默认仪表盘布局。
 */
export function createDefaultDashboard(sheetId: string, columnDefs: ColumnDef[], name = '未命名仪表盘'): DashboardModel {
  const now = Date.now();
  const fields = pickFields(columnDefs);
  const dim1 = fields.dim1?.id;
  const dim2 = fields.dim2?.id;
  const dim3 = fields.dim3?.id;
  const dateId = fields.date?.id;

  const widgets: DashboardWidget[] = [
    {
      id: `w_metric_1_${now}`,
      componentType: 'metric.card',
      title: '总记录数',
      layout: { x: 0, y: 0, w: 4, h: 5 },
      config: {
        title: '总记录数',
        valueColor: '#262626',
        background: '#fff',
      },
      dataBinding: metricCount(sheetId),
    },
    {
      id: `w_metric_2_${now}`,
      componentType: 'metric.card',
      title: fields.dim2 ? `${fields.dim2.name}计数` : '指标二',
      layout: { x: 4, y: 0, w: 4, h: 5 },
      config: {
        title: fields.dim2 ? `${fields.dim2.name}计数` : '指标二',
        valueColor: '#262626',
        background: '#fff',
      },
      dataBinding: metricCount(sheetId),
    },
    {
      id: `w_metric_3_${now}`,
      componentType: 'metric.card',
      title: fields.dim3 ? `${fields.dim3.name}计数` : '指标三',
      layout: { x: 8, y: 0, w: 4, h: 5 },
      config: {
        title: fields.dim3 ? `${fields.dim3.name}计数` : '指标三',
        valueColor: '#262626',
        background: '#fff',
      },
      dataBinding: metricCount(sheetId),
    },
  ];

  if (dim1) {
    widgets.push({
      id: `w_bar_${now}`,
      componentType: 'chart.bar',
      title: `${fields.dim1!.name}分布`,
      layout: { x: 0, y: 5, w: 7, h: 10 },
      config: {
        chartKind: 'bar',
        title: `${fields.dim1!.name}分布`,
        showLegend: true,
        showLabel: true,
        categoryFieldId: dim1,
        metricIds: ['count'],
      },
      dataBinding: groupCount(sheetId, dim1),
    });
  }

  if (dateId) {
    widgets.push({
      id: `w_line_${now}`,
      componentType: 'chart.line',
      title: `${fields.date!.name}趋势`,
      layout: { x: 7, y: 5, w: 5, h: 10 },
      config: {
        chartKind: 'line',
        title: `${fields.date!.name}趋势`,
        showLegend: true,
        showLabel: true,
        categoryFieldId: `__time_${dateId}`,
        metricIds: ['count'],
      },
      dataBinding: {
        query: {
          sheetId,
          timeBucket: { fieldId: dateId, unit: 'day' },
          metrics: [{ id: 'count', fieldId: '*', op: 'count', label: '计数' }],
        },
        listenGlobalFilters: true,
      },
    });
  } else if (dim2) {
    widgets.push({
      id: `w_line_${now}`,
      componentType: 'chart.column',
      title: `${fields.dim2!.name}对比`,
      layout: { x: 7, y: 5, w: 5, h: 10 },
      config: {
        chartKind: 'column',
        title: `${fields.dim2!.name}对比`,
        showLegend: true,
        showLabel: true,
        categoryFieldId: dim2,
        metricIds: ['count'],
      },
      dataBinding: groupCount(sheetId, dim2),
    });
  }

  const bottomY = 15;
  if (dim2) {
    widgets.push({
      id: `w_bar2_${now}`,
      componentType: 'chart.bar',
      title: `${fields.dim2!.name}分布`,
      layout: { x: 0, y: bottomY, w: 4, h: 10 },
      config: {
        chartKind: 'bar',
        title: `${fields.dim2!.name}分布`,
        showLabel: true,
        categoryFieldId: dim2,
        metricIds: ['count'],
      },
      dataBinding: groupCount(sheetId, dim2),
    });
  }

  if (dim1) {
    widgets.push({
      id: `w_pie_${now}`,
      componentType: 'chart.pie',
      title: `${fields.dim1!.name}占比`,
      layout: { x: 4, y: bottomY, w: 4, h: 10 },
      config: {
        chartKind: 'pie',
        title: `${fields.dim1!.name}占比`,
        showLabel: true,
        categoryFieldId: dim1,
        metricIds: ['count'],
      },
      dataBinding: groupCount(sheetId, dim1),
    });
  }

  if (dim3 || dim1) {
    const rankField = dim3 || dim1!;
    const rankCol = fields.dim3 || fields.dim1!;
    widgets.push({
      id: `w_rank_${now}`,
      componentType: 'rank.list',
      title: `${rankCol.name}排行`,
      layout: { x: 8, y: bottomY, w: 4, h: 10 },
      config: {
        title: `${rankCol.name}排行`,
        labelFieldId: rankField,
        metricId: 'count',
      },
      dataBinding: groupCount(sheetId, rankField, 10),
    });
  }

  return {
    id: `dash_${now}`,
    name,
    sourceSheetId: sheetId,
    layout: { columns: 12, rowHeight: 40, gap: 12 },
    widgets,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptyDashboard(sheetId: string, name = '未命名仪表盘'): DashboardModel {
  const now = Date.now();
  return {
    id: `dash_${now}`,
    name,
    sourceSheetId: sheetId,
    layout: { columns: 12, rowHeight: 40, gap: 12 },
    widgets: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}
