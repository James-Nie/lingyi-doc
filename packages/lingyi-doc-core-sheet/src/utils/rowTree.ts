import type { RecordRow } from '@lingyi-doc/core-types';

export interface BaseRowHeaderMeta {
  depth: number;
  childCount: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

export interface RecordTreeColumnMeta extends BaseRowHeaderMeta {
  /** 各层级是否向下延伸垂直虚线 */
  lineContinues: boolean[];
  isLastChild: boolean;
}

export const TREE_INDENT_STEP = 20;
export const TREE_BASE_PADDING = 8;
export const TREE_CHEVRON_SIZE = 10;

/** 当前会话写入记录时的操作者显示名（创建人/更新人） */
let currentRecordOperator = 'local';

export function setCurrentRecordOperator(name: string): void {
  const trimmed = name.trim();
  currentRecordOperator = trimmed || 'local';
}

export function getCurrentRecordOperator(): string {
  return currentRecordOperator;
}

export function createRecordRow(order: number, parentId?: string | null): RecordRow {
  const now = Date.now();
  const by = getCurrentRecordOperator();
  return {
    _id: `rec_${now}_${Math.random().toString(36).slice(2, 9)}`,
    _createdAt: now,
    _createdBy: by,
    _updatedAt: now,
    _updatedBy: by,
    _order: order,
    _parentId: parentId ?? null,
  };
}


export function ensureSheetRows(rows: RecordRow[], rowCount: number): RecordRow[] {
  const result = rows.slice(0, rowCount);
  while (result.length < rowCount) {
    result.push(createRecordRow(result.length));
  }
  return result;
}

export function getRowDepth(rowIndex: number, rows: RecordRow[]): number {
  let depth = 0;
  let current = rows[rowIndex];
  const guard = new Set<string>();
  while (current?._parentId) {
    if (guard.has(current._id)) break;
    guard.add(current._id);
    const parentIndex = rows.findIndex(r => r._id === current!._parentId);
    if (parentIndex < 0) break;
    depth++;
    current = rows[parentIndex];
  }
  return depth;
}

export function getAncestorRowIndex(rowIndex: number, targetDepth: number, rows: RecordRow[]): number {
  let idx = rowIndex;
  let depth = getRowDepth(idx, rows);
  while (depth > targetDepth && idx >= 0) {
    const parentId = rows[idx]?._parentId;
    if (!parentId) break;
    idx = rows.findIndex(r => r._id === parentId);
    depth--;
  }
  return idx;
}

export function isLastChildRow(rowIndex: number, rows: RecordRow[]): boolean {
  const row = rows[rowIndex];
  if (!row?._parentId) return true;
  const siblings = getChildRowIndices(row._parentId, rows);
  return siblings.length === 0 || siblings[siblings.length - 1] === rowIndex;
}

export function getChildRowIndices(parentId: string, rows: RecordRow[]): number[] {
  const indices: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]._parentId === parentId) indices.push(i);
  }
  return indices;
}

export function getChildCount(parentId: string, rows: RecordRow[]): number {
  return rows.filter(r => r._parentId === parentId).length;
}

export function hasChildren(rowIndex: number, rows: RecordRow[]): boolean {
  const row = rows[rowIndex];
  if (!row) return false;
  return rows.some(r => r._parentId === row._id);
}

export function isRowVisible(rowIndex: number, rows: RecordRow[], collapsedIds: Set<string>): boolean {
  let current = rows[rowIndex];
  if (!current) return true;
  const guard = new Set<string>();
  while (current._parentId) {
    if (guard.has(current._id)) break;
    guard.add(current._id);
    if (collapsedIds.has(current._parentId)) return false;
    const parentIndex = rows.findIndex(r => r._id === current!._parentId);
    if (parentIndex < 0) break;
    current = rows[parentIndex];
  }
  return true;
}

export function findChildInsertIndex(parentRowIndex: number, rows: RecordRow[]): number {
  const parent = rows[parentRowIndex];
  if (!parent) return parentRowIndex + 1;

  let insertAt = parentRowIndex + 1;
  for (let i = parentRowIndex + 1; i < rows.length; i++) {
    if (isDescendantOf(i, parent._id, rows)) {
      insertAt = i + 1;
    } else {
      break;
    }
  }
  return insertAt;
}

export function isDescendantOf(rowIndex: number, ancestorId: string, rows: RecordRow[]): boolean {
  let current = rows[rowIndex];
  const guard = new Set<string>();
  while (current?._parentId) {
    if (guard.has(current._id)) return false;
    guard.add(current._id);
    if (current._parentId === ancestorId) return true;
    const parentIndex = rows.findIndex(r => r._id === current!._parentId);
    if (parentIndex < 0) return false;
    current = rows[parentIndex];
  }
  return false;
}

export function buildDisplayRowHeights(
  rowCount: number,
  rows: RecordRow[],
  rowHeights: Map<number, number>,
  collapsedIds: Set<string>,
  defaultHeight: number,
): Map<number, number> {
  const result = new Map<number, number>();
  for (let r = 0; r < rowCount; r++) {
    const base = rowHeights.get(r) ?? defaultHeight;
    result.set(r, isRowVisible(r, rows, collapsedIds) ? base : 0);
  }
  return result;
}

/** 在树形折叠基础上，将未通过视图筛选的记录行高置为 0 */
export function applyFilterToDisplayRowHeights(
  rowCount: number,
  rows: RecordRow[],
  rowHeights: Map<number, number>,
  collapsedIds: Set<string>,
  defaultHeight: number,
  visibleRecordIndices: Set<number>,
): Map<number, number> {
  const result = buildDisplayRowHeights(rowCount, rows, rowHeights, collapsedIds, defaultHeight);
  for (let r = 0; r < rowCount; r++) {
    if (!visibleRecordIndices.has(r)) {
      result.set(r, 0);
    }
  }
  return result;
}

export function buildRowHeaderMeta(
  rowCount: number,
  rows: RecordRow[],
  collapsedIds: Set<string>,
): RecordTreeColumnMeta[] {
  const meta: RecordTreeColumnMeta[] = [];
  for (let r = 0; r < rowCount; r++) {
    const row = rows[r];
    const depth = getRowDepth(r, rows);
    const childCount = row ? getChildCount(row._id, rows) : 0;
    const lineContinues: boolean[] = [];
    for (let level = 0; level < depth; level++) {
      const ancestorIdx = getAncestorRowIndex(r, level + 1, rows);
      lineContinues.push(ancestorIdx >= 0 && !isLastChildRow(ancestorIdx, rows));
    }
    meta.push({
      depth,
      childCount,
      hasChildren: childCount > 0,
      isExpanded: row ? !collapsedIds.has(row._id) : true,
      lineContinues,
      isLastChild: isLastChildRow(r, rows),
    });
  }
  return meta;
}

/** 第一列内容区左侧留白（树形控件之后，逻辑像素） */
export function getRawTreeInset(meta: Pick<RecordTreeColumnMeta, 'depth' | 'hasChildren'>): number {
  const chevronSpace = meta.hasChildren || meta.depth > 0 ? 16 : 0;
  return TREE_BASE_PADDING + meta.depth * TREE_INDENT_STEP + chevronSpace + 4;
}

export const TREE_MIN_CONTENT_WIDTH = 48;

/** 深层子记录时左移树形控件，保证内容区可见 */
export function getTreeLayoutOffset(rawInset: number, cellWidthScreen: number, zoom: number): number {
  const overflow = rawInset * zoom + TREE_MIN_CONTENT_WIDTH * zoom - cellWidthScreen;
  return overflow > 0 ? overflow : 0;
}

export function resolveTreeLayout(
  meta: Pick<RecordTreeColumnMeta, 'depth' | 'hasChildren'>,
  cellWidthScreen: number,
  zoom: number,
): { rawInset: number; offset: number; contentInset: number } {
  const rawInset = getRawTreeInset(meta);
  const offset = getTreeLayoutOffset(rawInset, cellWidthScreen, zoom);
  return {
    rawInset,
    offset,
    contentInset: Math.max(4 * zoom, rawInset * zoom - offset),
  };
}

/** 第一列内容区左侧留白（树形控件之后） */
export function getTreeContentInset(
  meta: Pick<RecordTreeColumnMeta, 'depth' | 'hasChildren'>,
  cellWidthScreen?: number,
  zoom = 1,
): number {
  if (cellWidthScreen == null) return getRawTreeInset(meta);
  return resolveTreeLayout(meta, cellWidthScreen, zoom).contentInset / zoom;
}

export interface TreeContentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 第一列子记录：内容区矩形（选区/编辑器与渲染对齐） */
export function getTreeContentRect(
  rect: TreeContentRect,
  col: number,
  meta: RecordTreeColumnMeta | undefined,
  zoom = 1,
): TreeContentRect {
  if (col !== 0 || !meta) return rect;
  const inset = resolveTreeLayout(meta, rect.width, zoom).contentInset;
  if (inset <= 0 || inset >= rect.width) return rect;
  return {
    x: rect.x + inset,
    y: rect.y,
    width: rect.width - inset,
    height: rect.height,
  };
}

/** 获取以 rowIndex 为根的子树最后一行索引（含自身） */
export function getSubtreeRowEnd(rowIndex: number, rows: RecordRow[]): number {
  const row = rows[rowIndex];
  if (!row) return rowIndex;
  let end = rowIndex;
  for (let i = rowIndex + 1; i < rows.length; i++) {
    if (!isDescendantOf(i, row._id, rows)) break;
    end = i;
  }
  return end;
}

/** 行拖拽时扩展为完整子树块（父记录带子记录一起移动） */
export function expandRowDragBlock(
  start: number,
  end: number,
  rows: RecordRow[],
): { start: number; end: number } {
  let blockStart = start;
  let blockEnd = end;
  for (let r = start; r <= end; r++) {
    blockEnd = Math.max(blockEnd, getSubtreeRowEnd(r, rows));
  }
  return { start: blockStart, end: blockEnd };
}

/** 子记录拖拽时允许插入的索引范围（保持同级顺序） */
export function getSiblingInsertBounds(rowIndex: number, rows: RecordRow[]): { min: number; max: number } {
  const row = rows[rowIndex];
  if (!row) return { min: 0, max: rows.length };

  if (!row._parentId) {
    return { min: 0, max: rows.length };
  }

  const parentIdx = rows.findIndex(r => r._id === row._parentId);
  if (parentIdx < 0) return { min: 0, max: rows.length };

  const parentEnd = getSubtreeRowEnd(parentIdx, rows);
  return { min: parentIdx + 1, max: parentEnd + 1 };
}

export type RecordTreeHitAction = 'collapse' | null;

/** 检测第一列树形区域点击（折叠箭头） */
export function hitTestRecordTreeColumn(
  relX: number,
  relY: number,
  cellWidth: number,
  cellHeight: number,
  meta: RecordTreeColumnMeta | undefined,
  zoom = 1,
): RecordTreeHitAction {
  if (!meta?.hasChildren || meta.depth === 0) return null;

  const { offset } = resolveTreeLayout(meta, cellWidth, zoom);
  const chevronX = TREE_BASE_PADDING * zoom + meta.depth * TREE_INDENT_STEP * zoom - offset;
  if (
    relX >= chevronX - 2 * zoom &&
    relX <= chevronX + (TREE_CHEVRON_SIZE + 2) * zoom &&
    relY >= cellHeight * 0.2 &&
    relY <= cellHeight * 0.8
  ) {
    return 'collapse';
  }

  return null;
}
