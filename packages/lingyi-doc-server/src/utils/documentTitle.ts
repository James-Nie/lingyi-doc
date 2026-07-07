/** 系统默认占位标题，允许多个文档共用 */
const PLACEHOLDER_TITLES = new Set([
  '未命名文档',
  '未命名思维笔记',
  '未命名多维表格',
  '未命名普通表格',
  '导入的文档',
  '导入的表格',
]);

export function normalizeDocumentTitle(title: string): string {
  return title.trim();
}

export function isPlaceholderDocumentTitle(title: string): boolean {
  return PLACEHOLDER_TITLES.has(normalizeDocumentTitle(title));
}

export function shouldEnforceUniqueTitle(title: string): boolean {
  const normalized = normalizeDocumentTitle(title);
  return normalized.length > 0 && !isPlaceholderDocumentTitle(normalized);
}
