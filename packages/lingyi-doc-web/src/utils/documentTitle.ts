import type { DocumentListItem } from '@lingyi-doc/core';

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

export function isDocumentTitleTaken(
  title: string,
  documents: DocumentListItem[],
  excludeId?: string,
): boolean {
  const normalized = normalizeDocumentTitle(title);
  if (!normalized || isPlaceholderDocumentTitle(normalized)) return false;
  return documents.some(
    doc => doc.id !== excludeId && normalizeDocumentTitle(doc.title || '') === normalized,
  );
}

/** 在已有文档列表中生成不重复的真实标题（如「报告 2」） */
export function ensureUniqueDocumentTitle(
  title: string,
  documents: DocumentListItem[],
): string {
  const base = normalizeDocumentTitle(title);
  if (!base) return '未命名文档';
  if (isPlaceholderDocumentTitle(base) || !isDocumentTitleTaken(base, documents)) return base;

  let n = 2;
  while (isDocumentTitleTaken(`${base} ${n}`, documents)) {
    n += 1;
  }
  return `${base} ${n}`;
}
