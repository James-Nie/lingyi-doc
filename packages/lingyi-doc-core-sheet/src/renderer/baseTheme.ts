/** 多维表视觉规范 */
export const BASE_THEME = {
  pageBg: '#F7F8FA',
  cardBg: '#FFFFFF',
  cardBorder: '#DEE0E3',
  cardRadius: 8,
  toolbarBg: '#F7F8FA',
  toolbarBorder: '#DEE0E3',
  gridColor: '#DEE0E3',
  /** 分组卡片内数据区网格线（较淡） */
  groupedGridColor: '#EBEDF0',
  headerBgColor: '#FFFFFF',
  headerTextColor: '#646A73',
  headerIconColor: '#86909C',
  headerHeight: 32,
  headerBorderColor: '#DEE0E3',
  cellBgColor: '#FFFFFF',
  cellTextColor: '#1F2329',
  secondaryTextColor: '#86909C',
  primaryColor: '#3370FF',
  selectionFill: 'rgba(51, 112, 255, 0.06)',
  selectionBorder: '#3370FF',
  selectionHeaderBg: '#E8F0FF',
  rowHoverBg: '#e0e1e5ff',
  rowCheckedBg: '#F0F4FF',
  /** 查看行评论时的整行背景色 */
  rowCommentHighlightBg: '#FFF9E6',
  frozenLineColor: '#DEE0E3',
  fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", sans-serif',
  cellPaddingX: 12,
  cellPaddingY: 8,
  cornerCheckboxBorder: '#C9CDD4',
  addCellBg: '#FFFFFF',
  addCellBorder: '#DEE0E3',
  addCellColor: '#646A73',
  /** 列头末尾「+」添加字段列宽 */
  addColumnWidth: 40,
  /** 底部添加行栏下方留白（滚动余量的一部分） */
  gridPaddingBottom: 12,
} as const;

export interface BaseRenderConfigTarget {
  isBaseMode?: boolean;
  headerHeight: number;
  gridColor: string;
  headerBgColor: string;
  headerTextColor: string;
  backgroundColor: string;
  selectionColor: string;
  frozenLineColor: string;
  cellTextColor?: string;
  secondaryTextColor?: string;
  fontFamily?: string;
}

export function applyBaseRenderConfig(config: BaseRenderConfigTarget): void {
  config.isBaseMode = true;
  config.headerHeight = BASE_THEME.headerHeight;
  config.gridColor = BASE_THEME.gridColor;
  config.headerBgColor = BASE_THEME.headerBgColor;
  config.headerTextColor = BASE_THEME.headerTextColor;
  config.backgroundColor = BASE_THEME.cellBgColor;
  config.selectionColor = BASE_THEME.selectionFill;
  config.frozenLineColor = BASE_THEME.frozenLineColor;
  config.cellTextColor = BASE_THEME.cellTextColor;
  config.secondaryTextColor = BASE_THEME.secondaryTextColor;
  config.fontFamily = BASE_THEME.fontFamily;
}

export function resetStandardRenderConfig(config: BaseRenderConfigTarget): void {
  config.isBaseMode = false;
  config.headerHeight = 25;
  config.gridColor = '#d4d4d4';
  config.headerBgColor = '#f5f5f5';
  config.headerTextColor = '#666666';
  config.backgroundColor = '#ffffff';
  config.selectionColor = 'rgba(74, 137, 243, 0.06)';
  config.frozenLineColor = '#a0a0a0';
  config.cellTextColor = undefined;
  config.secondaryTextColor = undefined;
  config.fontFamily = undefined;
}

/** 多维表网格总宽度（行头 + 数据列 + 末尾添加列） */
export function computeBaseGridWidth(
  headerWidth: number,
  colCount: number,
  columnWidths: Map<number, number>,
  defaultColumnWidth: number,
  zoom: number,
): number {
  let total = headerWidth;
  for (let c = 0; c < colCount; c++) {
    const w = columnWidths.get(c);
    total += (w !== undefined ? w : defaultColumnWidth) * zoom;
  }
  return total + BASE_THEME.addColumnWidth;
}

/** 多维表编辑区在屏幕上的右/下边界（含添加行栏） */
export function computeBaseGridScreenBounds(
  headerWidth: number,
  headerHeight: number,
  colCount: number,
  rowCount: number,
  columnWidths: Map<number, number>,
  rowHeights: Map<number, number>,
  defaultColumnWidth: number,
  defaultRowHeight: number,
  zoom: number,
  scrollLeft: number,
  canvasWidth: number,
  canvasHeight: number,
  getRowScreenTop: (row: number, rowHeights: Map<number, number>) => number,
  /** 底部添加行栏是否计入下边界（分组视图无添加行栏，需排除，否则冻结首列竖线会超出最后分组下边框） */
  includeAddRowBar = true,
): { right: number; bottom: number } {
  const contentRight = computeBaseGridWidth(headerWidth, colCount, columnWidths, defaultColumnWidth, zoom);
  const right = Math.min(Math.max(headerWidth, contentRight - scrollLeft), canvasWidth);

  let bottom = headerHeight;
  if (rowCount > 0) {
    const lastRow = rowCount - 1;
    bottom = getRowScreenTop(lastRow, rowHeights)
      + (rowHeights.get(lastRow) !== undefined ? rowHeights.get(lastRow)! : defaultRowHeight) * zoom;
  }
  if (includeAddRowBar) {
    bottom += (rowHeights.get(0) !== undefined ? rowHeights.get(0)! : defaultRowHeight) * zoom;
  }
  bottom = Math.min(bottom, canvasHeight);

  return { right, bottom };
}

/** 单选/多选标签色：浅色底 + 深色字，无边框 */
export function getSelectTagColors(optionColor: string): { bg: string; text: string } {
  const hex = optionColor.replace('#', '');
  if (hex.length !== 6) {
    return { bg: '#F2F3F5', text: '#646A73' };
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return {
    bg: `rgba(${r}, ${g}, ${b}, 0.14)`,
    text: optionColor,
  };
}
