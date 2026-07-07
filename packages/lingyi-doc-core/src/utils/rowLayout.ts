/** 解析行高：0 表示隐藏行（如筛选折叠），不能用 || 回退默认值 */
export function resolveRowHeight(
  row: number,
  rowHeights: Map<number, number>,
  defaultHeight: number,
): number {
  const h = rowHeights.get(row);
  return h !== undefined ? h : defaultHeight;
}

/** 行是否被折叠隐藏（高度为 0） */
export function isRowLayoutHidden(
  row: number,
  rowHeights: Map<number, number>,
  defaultHeight: number,
): boolean {
  return resolveRowHeight(row, rowHeights, defaultHeight) === 0;
}
