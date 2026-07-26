import type { TableElement, WhiteboardElement } from '@lingyi-doc/core-whiteboard';
import { elementBounds, rectsIntersect } from './viewportUtils';
import { expandIdsWithSectionContents } from './sectionUtils';

function elementCenter(el: WhiteboardElement): { x: number; y: number } {
  return {
    x: el.x + el.width / 2,
    y: el.y + el.height / 2,
  };
}

function pointInRect(
  pt: { x: number; y: number },
  box: { x: number; y: number; w: number; h: number },
): boolean {
  return pt.x >= box.x && pt.x <= box.x + box.w && pt.y >= box.y && pt.y <= box.y + box.h;
}

/** 找到覆盖元素中心的最顶层表格（按 zIndex） */
export function findContainingTable(
  el: WhiteboardElement,
  elements: WhiteboardElement[],
): TableElement | null {
  if (el.type === 'table' || el.type === 'section') return null;
  const center = elementCenter(el);
  let best: TableElement | null = null;
  for (const item of elements) {
    if (item.type !== 'table' || item.id === el.id) continue;
    if (!pointInRect(center, elementBounds(item))) continue;
    if (!best || item.zIndex >= best.zIndex) best = item as TableElement;
  }
  return best;
}

/**
 * 已归属于表格的对象（通过主动拖入后写入的 containerId）。
 * 不包含其他表格与分区。
 */
export function findElementsInTable(
  table: TableElement,
  elements: WhiteboardElement[],
): WhiteboardElement[] {
  return elements.filter(el => {
    if (el.id === table.id) return false;
    if (el.type === 'table' || el.type === 'section') return false;
    return el.containerId === table.id;
  });
}

export function expandIdsWithTableContents(
  ids: string[],
  elements: WhiteboardElement[],
): string[] {
  const expanded = new Set(ids);
  for (const id of ids) {
    const table = elements.find(e => e.id === id);
    if (!table || table.type !== 'table') continue;
    for (const child of findElementsInTable(table, elements)) {
      expanded.add(child.id);
    }
  }
  return [...expanded];
}

/** 分区 + 表格容器内容一并展开（拖动/复制/删除时带动内部对象） */
export function expandIdsWithContainerContents(
  ids: string[],
  elements: WhiteboardElement[],
): string[] {
  return expandIdsWithTableContents(
    expandIdsWithSectionContents(ids, elements),
    elements,
  );
}

/**
 * 拖动结束后更新归属：主动移入表格则绑定 containerId，移出则清除。
 * 仅处理 movedIds 中的非表/非分区对象。
 */
export function syncTableContainmentAfterMove(
  elements: WhiteboardElement[],
  movedIds: Iterable<string>,
): WhiteboardElement[] {
  const idSet = new Set(movedIds);
  let changed = false;
  const next = elements.map(el => {
    if (!idSet.has(el.id)) return el;
    if (el.type === 'table' || el.type === 'section') return el;

    const host = findContainingTable(el, elements);
    const nextId = host?.id;
    if (el.containerId === nextId) return el;
    changed = true;
    if (nextId) return { ...el, containerId: nextId };
    const { containerId: _drop, ...rest } = el;
    return rest as WhiteboardElement;
  });
  return changed ? next : elements;
}

/** 保证与表格相交的对象层级始终高于该表格（仍用空间相交，便于压住表体） */
export function ensureElementsAboveTables(elements: WhiteboardElement[]): WhiteboardElement[] {
  const tables = elements.filter((e): e is TableElement => e.type === 'table');
  if (!tables.length) return elements;

  let changed = false;
  const next = elements.map(el => {
    if (el.type === 'table' || el.type === 'section') return el;

    const box = elementBounds(el);
    let minZ = el.zIndex;
    for (const table of tables) {
      if (rectsIntersect(box, elementBounds(table))) {
        minZ = Math.max(minZ, table.zIndex + 1);
      }
    }
    if (minZ > el.zIndex) {
      changed = true;
      return { ...el, zIndex: minZ };
    }
    return el;
  });

  return changed ? next : elements;
}

export function ensureElementsAboveContainers(elements: WhiteboardElement[]): WhiteboardElement[] {
  return ensureElementsAboveTables(elements);
}
