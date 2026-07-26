/** 多维表日期 / 创建时间 / 更新时间共用的显示格式 */

export const COLUMN_DATE_FORMATS = [
  { value: 'YYYY/MM/DD', label: '2026/01/30' },
  { value: 'YYYY/MM/DD HH:mm', label: '2026/01/30 14:00' },
  { value: 'YYYY/MM/DD HH:mm (GMT+8)', label: '2026/01/30 14:00 (GMT+8)' },
  { value: 'YYYY-MM-DD', label: '2026-01-30' },
  { value: 'YYYY-MM-DD HH:mm', label: '2026-01-30 14:00' },
  { value: 'YYYY-MM-DD HH:mm (GMT+8)', label: '2026-01-30 14:00 (GMT+8)' },
] as const;

export const DEFAULT_COLUMN_DATE_FORMAT = COLUMN_DATE_FORMATS[0].value;

/** 按列 format 字符串格式化时间戳（支持 HH:mm 与字面量时区后缀） */
export function formatColumnDateString(
  timestamp: number,
  formatStr: string = DEFAULT_COLUMN_DATE_FORMAT,
): string {
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return 'Invalid Date';

  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  const s = pad(d.getSeconds());

  return formatStr
    .replace(/YYYY/g, String(y))
    .replace(/MM/g, m)
    .replace(/DD/g, day)
    .replace(/HH/g, h)
    .replace(/hh/g, h)
    .replace(/mm/g, min)
    .replace(/ss/g, s);
}
