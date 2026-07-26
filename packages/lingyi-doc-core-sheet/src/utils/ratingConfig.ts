import type { CellValue, ColumnDef } from '@lingyi-doc/core-types';

export interface RatingIconDef {
  key: string;
  char: string;
  label: string;
  activeColor: string;
  inactiveColor: string;
  useEmoji?: boolean;
  isNumber?: boolean;
}

/** 评分图形定义 */
export const RATING_ICON_DEFS: RatingIconDef[] = [
  { key: 'star', char: '★', label: '星星', activeColor: '#FFB400', inactiveColor: '#E0E0E0' },
  { key: 'heart', char: '♥', label: '爱心', activeColor: '#F44336', inactiveColor: '#E0E0E0' },
  { key: 'thumb', char: '👍', label: '点赞', activeColor: '#FF9800', inactiveColor: '#E0E0E0', useEmoji: true },
  { key: 'fire', char: '🔥', label: '火焰', activeColor: '#FF5722', inactiveColor: '#E0E0E0', useEmoji: true },
  { key: 'smile', char: '😊', label: '笑脸', activeColor: '#FFC107', inactiveColor: '#E0E0E0', useEmoji: true },
  { key: 'bolt', char: '⚡', label: '闪电', activeColor: '#00BCD4', inactiveColor: '#E0E0E0', useEmoji: true },
  { key: 'flower', char: '🌸', label: '花朵', activeColor: '#9C27B0', inactiveColor: '#E0E0E0', useEmoji: true },
  { key: 'number', char: '123', label: '123', activeColor: '#2196F3', inactiveColor: '#E0E0E0', isNumber: true },
];

const RATING_ICON_MAP = Object.fromEntries(
  RATING_ICON_DEFS.map(d => [d.key, d]),
) as Record<string, RatingIconDef>;

/** 兼容旧字段配置中的 trophy */
const LEGACY_ICON_ALIASES: Record<string, string> = {
  trophy: 'flower',
};

/** 获取评分图形定义 */
export function getRatingIconDef(iconKey?: string): RatingIconDef {
  const normalized = LEGACY_ICON_ALIASES[iconKey || ''] || iconKey || 'star';
  return RATING_ICON_MAP[normalized] || RATING_ICON_MAP.star;
}

/** 评分图形字符映射 */
export const RATING_ICON_CHARS: Record<string, string> = Object.fromEntries(
  RATING_ICON_DEFS.map(d => [d.key, d.char]),
);

/** 评分字段配置 */
export interface RatingFieldConfig {
  iconKey: string;
  iconDef: RatingIconDef;
  min: number;
  max: number;
  count: number;
}

/**
 * 获取评分字段配置
 * @param columnDef 列定义
 * @returns 评分字段配置
 */
export function getRatingConfig(
  columnDef?: Pick<ColumnDef, 'ratingIcon' | 'ratingMin' | 'ratingMax'>,
): RatingFieldConfig {
  const min = columnDef?.ratingMin ?? 1;
  const max = Math.max(min, columnDef?.ratingMax ?? 5);
  const rawKey = columnDef?.ratingIcon || 'star';
  const iconKey = LEGACY_ICON_ALIASES[rawKey] || rawKey;
  const iconDef = getRatingIconDef(iconKey);
  return { iconKey, iconDef, min, max, count: max - min + 1 };
}

/**
 * 解析评分值
 * @param value 单元格值
 * @param config 评分字段配置
 * @returns 评分值
 */
export function parseRatingValue(value: CellValue, config: RatingFieldConfig): number {
  let raw = 0;
  if (value.type === 'number') raw = value.value;
  else if (value.type === 'text') raw = parseFloat(value.text) || 0;
  return Math.max(config.min, Math.min(config.max, raw));
}

/** 评分布局 */
export interface RatingLayout {
  itemSize: number;
  gap: number;
  count: number;
  totalWidth: number;
  totalHeight: number;
  startX: number;
  startY: number;
  min: number;
}

/**
 * 计算评分布局
 * @param cellWidth 单元格宽度
 * @param cellHeight 单元格高度
 * @param config 评分字段配置
 * @param zoom 缩放比例
 * @returns 评分布局
 */
export function computeRatingLayout(
  cellWidth: number,
  cellHeight: number,
  config: RatingFieldConfig,
  zoom: number,
): RatingLayout {
  const padding = 4 * zoom;
  const gap = 2 * zoom;
  const maxItemSize = 24 * zoom;
  const minItemSize = 16 * zoom;
  let itemSize = Math.min(maxItemSize, Math.max(minItemSize, cellHeight - 6));
  const count = config.count;
  const availableWidth = cellWidth - padding * 2;
  const neededWidth = itemSize * count + gap * (count - 1);
  if (neededWidth > availableWidth) {
    itemSize = Math.max(minItemSize, (availableWidth - gap * (count - 1)) / count);
  }
  const totalWidth = itemSize * count + gap * (count - 1);
  return {
    itemSize,
    gap,
    count,
    totalWidth,
    totalHeight: itemSize,
    startX: (cellWidth - totalWidth) / 2,
    startY: (cellHeight - itemSize) / 2,
    min: config.min,
  };
}

/**
 * 点击测试评分项
 * @param relX 相对 x 坐标
 * @param relY 相对 y 坐标
 * @param cellWidth 单元格宽度
 * @param cellHeight 单元格高度
 * @param config 评分字段配置
 * @param zoom 缩放比例
 * @returns 评分项索引或 null
 */
export function hitTestRating(
  relX: number,
  relY: number,
  cellWidth: number,
  cellHeight: number,
  config: RatingFieldConfig,
  zoom: number,
): number | null {
  const layout = computeRatingLayout(cellWidth, cellHeight, config, zoom);
  if (
    relX < layout.startX || relX > layout.startX + layout.totalWidth ||
    relY < layout.startY || relY > layout.startY + layout.totalHeight
  ) {
    return null;
  }
  const index = Math.min(
    layout.count - 1,
    Math.max(0, Math.floor((relX - layout.startX) / (layout.itemSize + layout.gap))),
  );
  return layout.min + index;
}

export function getRatingColumnWidth(config: RatingFieldConfig): number {
  return Math.max(90, config.count * 20 + 16);
}

/** 获取评分项颜色 */
export function getRatingItemColors(iconDef: RatingIconDef, active: boolean) {
  return {
    color: active ? iconDef.activeColor : iconDef.inactiveColor,
    active,
  };
}
