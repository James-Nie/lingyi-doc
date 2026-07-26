import type { ActiveCellEditor } from './CollabClient';
import type { CellEditingPayload } from './cellEditing';
import { cellRefLabel } from './cellEditing';

export type BlockLockTarget = Pick<ActiveCellEditor, 'sheetId' | 'row' | 'col'>;

export function richTextBlockLock(blockIndex: number): BlockLockTarget {
  return { sheetId: 'rt', row: blockIndex, col: 0 };
}

export function richTextTitleLock(): BlockLockTarget {
  return { sheetId: 'rt', row: -1, col: 0 };
}

export function whiteboardElementLock(elementId: string): BlockLockTarget {
  return { sheetId: `wb:${elementId}`, row: 0, col: 0 };
}

export function whiteboardMindmapNodeLock(elementId: string, nodeId: string): BlockLockTarget {
  return { sheetId: `wb:${elementId}:${nodeId}`, row: 0, col: 0 };
}

export function whiteboardTableCellLock(elementId: string, row: number, col: number): BlockLockTarget {
  return { sheetId: `wbt:${elementId}`, row, col };
}

export function mindnoteNodeLock(nodeId: string): BlockLockTarget {
  return { sheetId: `mn:${nodeId}`, row: 0, col: 0 };
}

export function blockLockEquals(a: BlockLockTarget, b: BlockLockTarget): boolean {
  return a.sheetId === b.sheetId && a.row === b.row && a.col === b.col;
}

export function blockLockKey(lock: BlockLockTarget): string {
  return `${lock.sheetId}:${lock.row}:${lock.col}`;
}

/** 从协议字段归一化为区域锁列表 */
export function normalizeCellEditors(
  editors?: ActiveCellEditor[] | null,
  fallback?: ActiveCellEditor | null,
): ActiveCellEditor[] {
  if (Array.isArray(editors)) {
    if (editors.length > 0) return editors;
    // 空数组：若带有 legacy editor，视为服务端未填 editors 的兼容载荷
    if (fallback) return [fallback];
    return [];
  }
  return fallback ? [fallback] : [];
}

export function blockLockLabel(editor: ActiveCellEditor): string {
  const { sheetId, row, col } = editor;
  if (sheetId === 'rt') {
    if (row === -1) return '标题';
    return `第 ${row + 1} 段`;
  }
  if (sheetId.startsWith('wbt:')) {
    return `表格 (${row + 1}, ${col + 1})`;
  }
  if (sheetId.startsWith('wb:')) {
    const parts = sheetId.slice(3).split(':');
    if (parts.length >= 2) return '思维导图节点';
    return '画板元素';
  }
  if (sheetId.startsWith('mn:')) {
    return '思维节点';
  }
  return cellRefLabel(row, col);
}

export function toCellEditingStart(lock: BlockLockTarget): Extract<CellEditingPayload, { action: 'start' }> {
  return { action: 'start', ...lock };
}

export function toCellEditingEnd(lock: BlockLockTarget): Extract<CellEditingPayload, { action: 'end' }> {
  return { action: 'end', ...lock };
}
