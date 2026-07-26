import type { CellValue, DateFormat, NumberFormat } from '@lingyi-doc/core-types';
import { getCellText } from '@lingyi-doc/core-types';

/** 工具栏数字格式下拉项 key */
export type FormatMenuKey =
  | 'general'
  | 'text'
  | 'number'
  | 'number_comma'
  | 'number_decimal'
  | 'percent'
  | 'percent_decimal'
  | 'scientific'
  | 'cny'
  | 'cny_decimal'
  | 'usd'
  | 'usd_decimal'
  | 'date_slash'
  | 'date_dash'
  | 'time'
  | 'datetime';

export function formatMenuKeyToNumberFormat(key: string): NumberFormat | null {
  switch (key) {
    case 'general':
      return { kind: 'general' };
    case 'number':
      return { kind: 'fixed', decimals: 0 };
    case 'number_comma':
      return { kind: 'currency', symbol: '', decimals: 0 };
    case 'number_decimal':
      return { kind: 'currency', symbol: '', decimals: 2 };
    case 'percent':
      return { kind: 'percent', decimals: 0 };
    case 'percent_decimal':
      return { kind: 'percent', decimals: 2 };
    case 'scientific':
      return { kind: 'scientific', decimals: 2 };
    case 'cny':
      return { kind: 'currency', symbol: '¥', decimals: 0 };
    case 'cny_decimal':
      return { kind: 'currency', symbol: '¥', decimals: 2 };
    case 'usd':
      return { kind: 'currency', symbol: '$', decimals: 0 };
    case 'usd_decimal':
      return { kind: 'currency', symbol: '$', decimals: 2 };
    default:
      return null;
  }
}

export function formatMenuKeyToDateFormat(key: string): DateFormat | null {
  switch (key) {
    case 'date_slash':
      return { kind: 'short' };
    case 'date_dash':
      return { kind: 'custom', pattern: 'yyyy-mm-dd' };
    case 'time':
      return { kind: 'time' };
    case 'datetime':
      return { kind: 'datetime' };
    default:
      return null;
  }
}

export function numberFormatToMenuKey(format: NumberFormat): FormatMenuKey {
  switch (format.kind) {
    case 'general':
      return 'general';
    case 'fixed':
      return 'number';
    case 'scientific':
      return 'scientific';
    case 'percent':
      return format.decimals > 0 ? 'percent_decimal' : 'percent';
    case 'currency': {
      if (format.symbol === '¥') {
        return format.decimals > 0 ? 'cny_decimal' : 'cny';
      }
      if (format.symbol === '$') {
        return format.decimals > 0 ? 'usd_decimal' : 'usd';
      }
      if (!format.symbol) {
        return format.decimals > 0 ? 'number_decimal' : 'number_comma';
      }
      return format.decimals > 0 ? 'cny_decimal' : 'cny';
    }
    default:
      return 'general';
  }
}

export function dateFormatToMenuKey(format: DateFormat): FormatMenuKey {
  switch (format.kind) {
    case 'short':
      return 'date_slash';
    case 'long':
      return 'date_slash';
    case 'time':
      return 'time';
    case 'datetime':
      return 'datetime';
    case 'custom':
      return format.pattern.includes('-') ? 'date_dash' : 'date_slash';
    default:
      return 'date_slash';
  }
}

/** 从单元格值提取可用于数字格式的数值 */
export function extractNumericValue(value: CellValue): number | null {
  switch (value.type) {
    case 'number':
      return value.value;
    case 'text': {
      const trimmed = value.text.trim().replace(/,/g, '').replace(/%/g, '');
      if (trimmed === '') return null;
      const num = Number(trimmed);
      return Number.isFinite(num) ? num : null;
    }
    case 'formula':
      return value.cached ? extractNumericValue(value.cached) : null;
    default:
      return null;
  }
}

function parseDateFromValue(value: CellValue): number | null {
  if (value.type === 'date') return value.timestamp;
  if (value.type === 'number') return value.value;
  if (value.type === 'text') {
    const ts = Date.parse(value.text.trim());
    return Number.isNaN(ts) ? null : ts;
  }
  if (value.type === 'formula' && value.cached) {
    return parseDateFromValue(value.cached);
  }
  return null;
}

/** 将工具栏格式 key 应用到单元格值，无法应用时返回 null */
export function applyFormatMenuKey(value: CellValue, key: string): CellValue | null {
  if (key === 'general') {
    const num = extractNumericValue(value);
    if (num !== null) return { type: 'number', value: num, format: { kind: 'general' } };
    if (value.type === 'text' || value.type === 'empty') return value.type === 'empty' ? { type: 'empty' } : value;
    return null;
  }

  if (key === 'text') {
    if (value.type === 'empty') return { type: 'text', text: '' };
    return { type: 'text', text: getCellText(value) };
  }

  const numFormat = formatMenuKeyToNumberFormat(key);
  if (numFormat) {
    const num = extractNumericValue(value);
    if (num === null) return null;
    return { type: 'number', value: num, format: numFormat };
  }

  const dateFormat = formatMenuKeyToDateFormat(key);
  if (dateFormat) {
    const ts = parseDateFromValue(value);
    if (ts === null) return null;
    return { type: 'date', timestamp: ts, format: dateFormat };
  }

  return null;
}

export function resolveFormatMenuKeyFromValue(value: CellValue | undefined): FormatMenuKey {
  if (!value || value.type === 'empty') return 'general';
  if (value.type === 'text') return 'text';
  if (value.type === 'number') return numberFormatToMenuKey(value.format);
  if (value.type === 'date') return dateFormatToMenuKey(value.format);
  if (value.type === 'formula' && value.cached) return resolveFormatMenuKeyFromValue(value.cached);
  return 'general';
}
