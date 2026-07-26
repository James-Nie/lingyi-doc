import type { ColumnDef, FilterCondition, RecordRow } from '@lingyi-doc/core-types';
import type { AggregatedDataset, AggregateMetric, TableQuery } from '@lingyi-doc/core-types';
import { applyBaseFilter, applyBaseSort } from '../utils/baseViewPipeline';
import { formatGroupLabel, getGroupKey, GROUP_EMPTY_KEY } from '../utils/recordGrouping';
import { getCellText } from '@lingyi-doc/core-types';
import type { CellValue } from '@lingyi-doc/core-types';

export interface AggregateInput {
  sheetId: string;
  columnDefs: ColumnDef[];
  rows: RecordRow[];
  getFieldValue: (rowIndex: number, fieldId: string) => unknown;
  query: TableQuery;
  /** 额外叠加的全局筛选（切片器等） */
  extraFilters?: FilterCondition[];
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value !== null && 'type' in value) {
    const cell = value as CellValue;
    if (cell.type === 'number') return Number.isFinite(cell.value) ? cell.value : null;
    if (cell.type === 'text') {
      const n = Number(cell.text);
      return Number.isFinite(n) ? n : null;
    }
    if (cell.type === 'date') return cell.timestamp;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function displayLabel(value: unknown, columnDef?: ColumnDef): string {
  const key = getGroupKey(value);
  if (!columnDef) {
    return key === GROUP_EMPTY_KEY ? '(空)' : key;
  }
  return formatGroupLabel(key, columnDef);
}

function computeMetric(
  op: AggregateMetric['op'],
  values: unknown[],
): number {
  if (op === 'count') return values.length;
  if (op === 'countDistinct') {
    const set = new Set(values.map(v => getGroupKey(v)));
    set.delete(GROUP_EMPTY_KEY);
    return set.size;
  }
  const nums = values.map(toNumber).filter((n): n is number => n !== null);
  if (nums.length === 0) return 0;
  switch (op) {
    case 'sum':
      return nums.reduce((a, b) => a + b, 0);
    case 'avg':
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'max':
      return Math.max(...nums);
    case 'min':
      return Math.min(...nums);
    default:
      return values.length;
  }
}

function timeBucketKey(timestamp: number, unit: NonNullable<TableQuery['timeBucket']>['unit']): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (unit === 'day') return `${y}-${m}-${day}`;
  if (unit === 'month') return `${y}-${m}`;
  if (unit === 'year') return String(y);
  if (unit === 'quarter') {
    const q = Math.floor(d.getMonth() / 3) + 1;
    return `${y}-Q${q}`;
  }
  // week: ISO-ish year-week
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
  return `${y}-W${String(week).padStart(2, '0')}`;
}

/**
 * 客户端分组聚合：filter → groupBy/timeBucket → metrics → sort/topN
 */
export function runAggregate(input: AggregateInput): AggregatedDataset {
  const { sheetId, columnDefs, rows, getFieldValue, query, extraFilters } = input;
  const filters = [...(query.filter || []), ...(extraFilters || [])];
  let indices = Array.from({ length: rows.length }, (_, i) => i);
  indices = applyBaseFilter(indices, filters, getFieldValue, columnDefs);
  indices = applyBaseSort(indices, query.sort, columnDefs, getFieldValue);

  const groupRules = query.groupBy || [];
  const timeBucket = query.timeBucket;
  const metrics = query.metrics.length
    ? query.metrics
    : [{ id: 'count', fieldId: '*' as const, op: 'count' as const, label: '计数' }];

  type Bucket = { key: string; labels: Record<string, string>; indices: number[] };
  const buckets = new Map<string, Bucket>();

  for (const idx of indices) {
    const labelParts: string[] = [];
    const labels: Record<string, string> = {};

    if (timeBucket) {
      const raw = getFieldValue(idx, timeBucket.fieldId);
      const n = toNumber(raw);
      const key = n != null ? timeBucketKey(n, timeBucket.unit) : GROUP_EMPTY_KEY;
      const dimId = `__time_${timeBucket.fieldId}`;
      labels[dimId] = key === GROUP_EMPTY_KEY ? '(空)' : key;
      labelParts.push(key);
    }

    for (const rule of groupRules) {
      const colDef = columnDefs.find(c => c.id === rule.fieldId);
      const raw = getFieldValue(idx, rule.fieldId);
      const key = getGroupKey(raw);
      labels[rule.fieldId] = displayLabel(raw, colDef);
      labelParts.push(key);
    }

    const bucketKey = labelParts.length ? labelParts.join('||') : '__all__';
    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = { key: bucketKey, labels, indices: [] };
      buckets.set(bucketKey, bucket);
    }
    bucket.indices.push(idx);
  }

  const dimColumns: AggregatedDataset['columns'] = [];
  if (timeBucket) {
    dimColumns.push({
      id: `__time_${timeBucket.fieldId}`,
      label: columnDefs.find(c => c.id === timeBucket.fieldId)?.name || '时间',
      role: 'dimension',
    });
  }
  for (const rule of groupRules) {
    dimColumns.push({
      id: rule.fieldId,
      label: columnDefs.find(c => c.id === rule.fieldId)?.name || rule.fieldId,
      role: 'dimension',
    });
  }

  const metricColumns: AggregatedDataset['columns'] = metrics.map(m => ({
    id: m.id,
    label: m.label || (m.op === 'count' ? '计数' : `${m.op}(${m.fieldId})`),
    role: 'metric',
  }));

  const resultRows: AggregatedDataset['rows'] = [];
  const bucketRecordIds: Record<string, string[]> = {};

  for (const bucket of buckets.values()) {
    const row: Record<string, string | number | null> = { ...bucket.labels };
    for (const m of metrics) {
      const values = m.fieldId === '*'
        ? bucket.indices.map(i => i)
        : bucket.indices.map(i => getFieldValue(i, m.fieldId));
      const val = computeMetric(m.op, values);
      row[m.id] = Number.isFinite(val) ? Math.round(val * 100) / 100 : 0;
    }
    resultRows.push(row);
    bucketRecordIds[bucket.key] = bucket.indices
      .map(i => rows[i]?._id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  }

  // 默认按第一维度排序（尊重 groupBy.order / timeBucket.order；记录顺序模式跳过）
  if (!query.topN && dimColumns.length > 0 && !query.preserveBucketOrder) {
    const dimId = dimColumns[0].id;
    const order = groupRules[0]?.order || timeBucket?.order || 'asc';
    resultRows.sort((a, b) => {
      const cmp = String(a[dimId] ?? '').localeCompare(String(b[dimId] ?? ''), 'zh-CN', {
        numeric: true,
        sensitivity: 'base',
      });
      return order === 'desc' ? -cmp : cmp;
    });
  }

  if (query.topN) {
    const { metricId, n, order } = query.topN;
    resultRows.sort((a, b) => {
      const va = Number(a[metricId] ?? 0);
      const vb = Number(b[metricId] ?? 0);
      return order === 'asc' ? va - vb : vb - va;
    });
    resultRows.splice(n);
  }

  return {
    columns: [...dimColumns, ...metricColumns],
    rows: resultRows,
    bucketRecordIds,
    meta: {
      sheetId,
      totalSourceRows: indices.length,
      computedAt: Date.now(),
      engine: 'client',
    },
  };
}

/** 从单元格或 RecordRow 直接字段读取值 */
export function createBaseFieldGetter(
  columnDefs: ColumnDef[],
  rows: RecordRow[],
  getCellValue: (rowIndex: number, colIndex: number) => unknown,
): (rowIndex: number, fieldId: string) => unknown {
  return (rowIndex, fieldId) => {
    const row = rows[rowIndex];
    if (row && fieldId in row && row[fieldId] !== undefined) {
      return row[fieldId];
    }
    const colIndex = columnDefs.findIndex(c => c.id === fieldId);
    if (colIndex < 0) return undefined;
    return getCellValue(rowIndex, colIndex);
  };
}

export function cellToPlainText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object' && value !== null && 'type' in value) {
    return getCellText(value as CellValue);
  }
  return String(value);
}
