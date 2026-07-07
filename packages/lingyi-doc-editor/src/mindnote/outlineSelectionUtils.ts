import type { MindNode } from '@lingyi-doc/core';

export function collectOutlineNodeIds(root: MindNode): string[] {
  const ids: string[] = [];
  const walk = (node: MindNode) => {
    ids.push(node.id);
    if (!node.collapsed) {
      node.children.forEach(walk);
    }
  };
  root.children.forEach(walk);
  return ids;
}

export function countSelectedChars(root: MindNode, ids: string[]): number {
  const set = new Set(ids);
  let total = 0;
  const walk = (node: MindNode) => {
    if (set.has(node.id)) total += node.text.length;
    if (!node.collapsed) node.children.forEach(walk);
  };
  root.children.forEach(walk);
  return total;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    right: Math.max(x1, x2),
    bottom: Math.max(y1, y2),
  };
}

export function rectsIntersect(a: Rect, b: DOMRect): boolean {
  return !(
    a.right < b.left
    || a.left > b.right
    || a.bottom < b.top
    || a.top > b.bottom
  );
}

export function hitTestOutlineRows(container: HTMLElement, rect: Rect): string[] {
  const rows = container.querySelectorAll<HTMLElement>('[data-outline-row]');
  const ids: string[] = [];
  rows.forEach(row => {
    const id = row.getAttribute('data-outline-row') ?? row.dataset.outlineRow;
    if (!id) return;
    if (rectsIntersect(rect, row.getBoundingClientRect())) {
      ids.push(id);
    }
  });
  return ids;
}
