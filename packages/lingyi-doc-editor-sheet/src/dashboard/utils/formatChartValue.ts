import type { DashboardChartDisplayConfig } from '@lingyi-doc/core-types';

/** 图表数值格式（轴标签 / 数据标签 / tooltip） */
export function formatChartValue(
  raw: unknown,
  format?: DashboardChartDisplayConfig['valueNumberFormat'],
): string {
  if (raw == null || raw === '') return '';
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return String(raw);

  const abs = Math.abs(n);
  const body = abs >= 1000
    ? n.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

  switch (format) {
    case 'percent':
      return `${body}%`;
    case 'cny':
      return `¥${body}`;
    case 'usd':
      return `$${body}`;
    case 'number':
    case 'follow':
    default:
      return body;
  }
}

/** 柱/条/面积填充色：纯色或纵向渐变 */
export function resolveFillStyle(
  color: string,
  fillStyle?: DashboardChartDisplayConfig['fillStyle'],
): string {
  if (fillStyle === 'gradient') {
    return `linear-gradient(180deg, ${color} 0%, ${color}33 100%)`;
  }
  return color;
}
