import type { ColumnDef, NumberFormat } from '@lingyi-doc/core-types';

/** 货币符号对齐：默认/居左 → 符号在前；居右 → 符号在后 */
export type CurrencySymbolAlign = 'default' | 'left' | 'right';

export const CURRENCY_SYMBOL_OPTIONS = [
  { value: '¥', label: '¥ 人民币' },
  { value: '$', label: '$ 美元' },
  { value: '€', label: '€ 欧元' },
  { value: '£', label: '£ 英镑' },
  { value: 'HK$', label: 'HK$ 港币' },
  { value: 'JP¥', label: 'JP¥ 日元' },
  { value: '₩', label: '₩ 韩元' },
  { value: '₹', label: '₹ 印度卢比' },
] as const;

export const CURRENCY_SYMBOL_ALIGN_OPTIONS: Array<{ value: CurrencySymbolAlign; label: string }> = [
  { value: 'default', label: '默认对齐' },
  { value: 'left', label: '符号居左' },
  { value: 'right', label: '符号居右' },
];

export const CURRENCY_PRECISION_OPTIONS = [0, 1, 2, 3, 4] as const;

export interface CurrencyFieldConfig {
  symbol: string;
  symbolAlign: CurrencySymbolAlign;
  precision: number;
}

export function getCurrencyConfig(
  columnDef?: Pick<ColumnDef, 'currencySymbol' | 'currencySymbolAlign' | 'currencyPrecision'> | null,
): CurrencyFieldConfig {
  const precision = columnDef?.currencyPrecision;
  return {
    symbol: columnDef?.currencySymbol || '¥',
    symbolAlign: columnDef?.currencySymbolAlign || 'default',
    precision: typeof precision === 'number' && Number.isFinite(precision)
      ? Math.max(0, Math.min(10, Math.round(precision)))
      : 2,
  };
}

export function isCurrencySymbolPrefix(align: CurrencySymbolAlign): boolean {
  return align !== 'right';
}

/** 生成货币 NumberFormat（写入单元格） */
export function toCurrencyNumberFormat(config: CurrencyFieldConfig): NumberFormat {
  return {
    kind: 'currency',
    symbol: config.symbol,
    decimals: config.precision,
    symbolPosition: isCurrencySymbolPrefix(config.symbolAlign) ? 'prefix' : 'suffix',
  };
}

/** 格式化货币展示文本 */
export function formatCurrencyDisplay(value: number, config: CurrencyFieldConfig): string {
  if (!Number.isFinite(value)) return String(value);
  const dec = config.precision;
  const parts = Math.abs(value).toFixed(dec).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const numText = parts.join('.');
  const sign = value < 0 ? '-' : '';
  if (isCurrencySymbolPrefix(config.symbolAlign)) {
    return `${sign}${config.symbol}${numText}`;
  }
  return `${sign}${numText}${config.symbol}`;
}

/** 精度下拉预览，如 `$ 1.00` */
export function currencyPrecisionPreview(symbol: string, precision: number, align: CurrencySymbolAlign = 'default'): string {
  const sample = formatCurrencyDisplay(1, { symbol, symbolAlign: align, precision });
  // 预览里符号与数字间加空格更易读（与截图 $ 1.00 一致）
  if (isCurrencySymbolPrefix(align)) {
    const body = (1).toFixed(precision);
    return `${symbol} ${body}`;
  }
  return `${(1).toFixed(precision)} ${symbol}`;
}
