import type { DocumentSnapshotActionType, DocumentVersionListItem } from '../../api/documentVersion';
import { formatCreatedAt, getAvatarColor, getAvatarText } from '../../utils/formatDate';

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 历史列表时间分组标签 */
export function historyGroupLabel(ts: number, nowMs: number = Date.now()): string {
  const d = new Date(ts);
  const now = new Date(nowMs);
  const today = startOfDay(now);
  const target = startOfDay(d);
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays > 1 && diffDays < 7) return '本周';
  if (diffDays >= 7 && diffDays < 14) return '上周';
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return '本月';
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月`;
  return `${d.getFullYear()}年`;
}

export function formatHistoryTime(ts: number): string {
  return formatCreatedAt(ts);
}

export function historyActionLabel(
  item: DocumentVersionListItem,
  opts?: { isLatest?: boolean },
): string | null {
  const type = item.actionType as DocumentSnapshotActionType | null;
  if (type === 'create') return '创建了文档';
  if (type === 'named') return item.label?.trim() || '命名版本';
  if (type === 'restore') return '还原版本';
  if (opts?.isLatest) return '最近更新';
  return item.label?.trim() || null;
}

export function groupHistoryItems(items: DocumentVersionListItem[]): Array<{
  label: string;
  items: DocumentVersionListItem[];
}> {
  const groups: Array<{ label: string; items: DocumentVersionListItem[] }> = [];
  for (const item of items) {
    const label = historyGroupLabel(item.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }
  return groups;
}

export { getAvatarColor, getAvatarText };
