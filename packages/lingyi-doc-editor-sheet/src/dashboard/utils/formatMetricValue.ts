import type { MetricLargeNumberAbbrev, MetricNumberFormat } from '@lingyi-doc/core-types';

export interface FormatMetricValueOptions {
  numberFormat?: MetricNumberFormat;
  decimalPlaces?: number;
  largeNumberAbbrev?: MetricLargeNumberAbbrev;
  useThousandSeparator?: boolean;
}

interface AbbrevRule {
  divisor: number;
  suffix: string;
}

const ABBREV_RULES: Record<Exclude<MetricLargeNumberAbbrev, 'none'>, AbbrevRule> = {
  k: { divisor: 1_000, suffix: 'K' },
  m: { divisor: 1_000_000, suffix: 'M' },
  b: { divisor: 1_000_000_000, suffix: 'B' },
  qian: { divisor: 1_000, suffix: '千' },
  wan: { divisor: 10_000, suffix: '万' },
  baiwan: { divisor: 1_000_000, suffix: '百万' },
  yi: { divisor: 100_000_000, suffix: '亿' },
};

function formatPlainNumber(
  value: number,
  decimalPlaces: number,
  useThousandSeparator: boolean,
): string {
  const fixed = value.toFixed(decimalPlaces);
  if (!useThousandSeparator) return fixed;
  const [intPart, frac] = fixed.split('.');
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac != null ? `${withSep}.${frac}` : withSep;
}

/** 按指标卡数字格式/缩写/分隔符格式化展示文案 */
export function formatMetricValue(
  raw: number,
  options: FormatMetricValueOptions = {},
): string {
  if (!Number.isFinite(raw)) return '—';

  const numberFormat = options.numberFormat || 'number';
  const decimalPlaces = options.decimalPlaces ?? 0;
  const abbrev = options.largeNumberAbbrev || 'none';
  const useThousandSeparator = options.useThousandSeparator !== false;

  let value = raw;
  let suffix = '';

  if (abbrev !== 'none') {
    const rule = ABBREV_RULES[abbrev];
    if (Math.abs(value) >= rule.divisor) {
      value = value / rule.divisor;
      suffix = rule.suffix;
    }
  }

  const body = formatPlainNumber(value, decimalPlaces, useThousandSeparator);

  if (numberFormat === 'percent') return `${body}${suffix}%`;
  if (numberFormat === 'cny') return `¥${body}${suffix}`;
  if (numberFormat === 'usd') return `$${body}${suffix}`;
  return `${body}${suffix}`;
}
