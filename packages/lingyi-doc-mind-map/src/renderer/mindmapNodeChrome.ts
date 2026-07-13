import type { MindMapLayoutNode, MindNoteStructure } from '@lingyi-doc/core';

export const QUICK_DOT_SIZE = 8;
export const QUICK_PLUS_SIZE = 20;
export const COLLAPSE_BTN_SIZE = 18;
export const COLLAPSE_BTN_GAP = 6;

/** 子节点方向 + 号圆心距节点边缘（布局坐标） */
const PLUS_LINE_OFFSET = 22;
const COLLAPSE_PLUS_GAP = 8;

/** 节点上方快捷圆点占用高度（布局坐标），工具栏需留出此空间 */
export const MINDMAP_QUICK_ACTION_TOP_EXTENT = QUICK_DOT_SIZE / 2;

export type MindmapGrowDirection = 'up' | 'down' | 'left' | 'right';

export function isTreeStructure(structure: MindNoteStructure): boolean {
  return structure === 'treeRight' || structure === 'treeLeft' || structure === 'treeBalanced';
}

export function isTimelineStructure(structure: MindNoteStructure): boolean {
  return structure === 'timelineH' || structure === 'timelineV';
}

/** 主节点是否展示双侧（或上下双侧）添加子节点按钮 */
export function rootHasDualAddChild(structure: MindNoteStructure): boolean {
  return structure === 'vertical' || structure === 'right' || structure === 'left' || structure === 'balanced';
}

export function rootPrimaryGrowDirection(structure: MindNoteStructure): MindmapGrowDirection {
  if (structure === 'vertical') return 'down';
  if (structure === 'left') return 'left';
  return 'right';
}

export function rootDualGrowDirections(structure: MindNoteStructure): MindmapGrowDirection[] {
  if (structure === 'vertical') return ['up', 'down'];
  return ['left', 'right'];
}

function getAddChildPointForDir(
  ln: MindMapLayoutNode,
  structure: MindNoteStructure,
  dir: MindmapGrowDirection,
): MindmapQuickActionPoint {
  const primaryDir = ln.isRoot && rootHasDualAddChild(structure)
    ? rootPrimaryGrowDirection(structure)
    : resolveMindmapGrowDirection(ln, structure);
  const collapse = ln.childCount && dir === primaryDir
    ? getMindmapCollapseRectForDir(ln, structure, dir)
    : null;
  if (dir === 'down' || dir === 'up') {
    return axisAddChildPoint(ln, dir, !!collapse);
  }
  return lateralAddChildPoint(ln, dir, collapse);
}

/** 指定方向上的折叠按钮（双侧主节点时按方向取，避免与 + 号重叠） */
function getMindmapCollapseRectForDir(
  ln: MindMapLayoutNode,
  structure: MindNoteStructure,
  dir: MindmapGrowDirection,
): { x: number; y: number; width: number; height: number } | null {
  if (!ln.childCount) return null;
  const size = COLLAPSE_BTN_SIZE;
  if (dir === 'down') {
    return { x: ln.x + ln.width / 2 - size / 2, y: ln.y + ln.height + COLLAPSE_BTN_GAP, width: size, height: size };
  }
  if (dir === 'up') {
    return { x: ln.x + ln.width / 2 - size / 2, y: ln.y - COLLAPSE_BTN_GAP - size, width: size, height: size };
  }
  if (dir === 'left') {
    return { x: ln.x - COLLAPSE_BTN_GAP - size, y: ln.y + ln.height / 2 - size / 2, width: size, height: size };
  }
  return { x: ln.x + ln.width + COLLAPSE_BTN_GAP, y: ln.y + ln.height / 2 - size / 2, width: size, height: size };
}

/** 下一级子节点的扩展方向（决定 + 号朝向） */
export function resolveMindmapGrowDirection(
  ln: MindMapLayoutNode,
  structure: MindNoteStructure,
): MindmapGrowDirection {
  if (structure === 'timelineH') {
    if (ln.isRoot) return 'right';
    return ln.childCount % 2 === 0 ? 'up' : 'down';
  }
  if (structure === 'timelineV') {
    if (ln.isRoot) return 'down';
    return ln.childCount % 2 === 0 ? 'left' : 'right';
  }
  if (isTreeStructure(structure)) {
    if (ln.isRoot) return 'down';
    return ln.side ?? 'right';
  }
  if (structure === 'vertical') {
    if (ln.isRoot) return 'down';
    return ln.vertDir ?? 'down';
  }
  return ln.side ?? 'right';
}

function axisAddChildPoint(
  ln: MindMapLayoutNode,
  dir: 'up' | 'down',
  hasCollapse: boolean,
): { x: number; y: number } {
  const cx = ln.x + ln.width / 2;
  if (dir === 'down') {
    const y = hasCollapse
      ? ln.y + ln.height + COLLAPSE_BTN_GAP + COLLAPSE_BTN_SIZE + COLLAPSE_PLUS_GAP + QUICK_PLUS_SIZE / 2
      : ln.y + ln.height + PLUS_LINE_OFFSET;
    return { x: cx, y };
  }
  const y = hasCollapse
    ? ln.y - COLLAPSE_BTN_GAP - COLLAPSE_BTN_SIZE - COLLAPSE_PLUS_GAP - QUICK_PLUS_SIZE / 2
    : ln.y - PLUS_LINE_OFFSET;
  return { x: cx, y };
}

function lateralAddChildPoint(
  ln: MindMapLayoutNode,
  dir: 'left' | 'right',
  collapseRect: { x: number; y: number; width: number; height: number } | null,
): { x: number; y: number } {
  const cy = ln.y + ln.height / 2;
  const plusHalf = QUICK_PLUS_SIZE / 2;
  if (dir === 'right') {
    const x = collapseRect
      ? collapseRect.x + collapseRect.width + COLLAPSE_PLUS_GAP + plusHalf
      : ln.x + ln.width + PLUS_LINE_OFFSET;
    return { x, y: cy };
  }
  const x = collapseRect
    ? collapseRect.x - COLLAPSE_PLUS_GAP - plusHalf
    : ln.x - PLUS_LINE_OFFSET;
  return { x, y: cy };
}

/** 折叠按钮矩形 */
export function getMindmapCollapseRect(
  ln: MindMapLayoutNode,
  structure: MindNoteStructure,
): { x: number; y: number; width: number; height: number } | null {
  if (!ln.childCount) return null;
  let dir = resolveMindmapGrowDirection(ln, structure);
  if (ln.isRoot && rootHasDualAddChild(structure)) {
    dir = rootPrimaryGrowDirection(structure);
  }
  return getMindmapCollapseRectForDir(ln, structure, dir);
}

/** 添加子节点 + 号圆心（布局坐标） */
export function getMindmapAddChildPoint(
  ln: MindMapLayoutNode,
  structure: MindNoteStructure,
): { x: number; y: number } {
  const dir = resolveMindmapGrowDirection(ln, structure);
  const collapse = getMindmapCollapseRect(ln, structure);

  if (dir === 'down' || dir === 'up') {
    return axisAddChildPoint(ln, dir, !!collapse);
  }
  return lateralAddChildPoint(ln, dir, collapse);
}

export interface MindmapQuickActionPoint {
  x: number;
  y: number;
}

export interface MindmapAddChildSlot {
  point: MindmapQuickActionPoint;
  dir: MindmapGrowDirection;
}

export interface MindmapQuickActionLayout {
  siblingA: MindmapQuickActionPoint;
  siblingB: MindmapQuickActionPoint;
  addChild: MindmapQuickActionPoint;
  /** 子节点扩展方向，用于绘制节点到 + 号的连接线 */
  addChildDir: MindmapGrowDirection;
  /** 主节点双侧添加子节点（上下/左右布局） */
  addChildSlots?: MindmapAddChildSlot[];
}

/** 快捷操作按钮位置（布局坐标系，圆心） */
export function getMindmapQuickActionLayout(
  ln: MindMapLayoutNode,
  structure: MindNoteStructure,
): MindmapQuickActionLayout {
  const cx = ln.x + ln.width / 2;
  const cy = ln.y + ln.height / 2;
  const dir = resolveMindmapGrowDirection(ln, structure);

  if (ln.isRoot && rootHasDualAddChild(structure)) {
    const primaryDir = rootPrimaryGrowDirection(structure);
    const slots = rootDualGrowDirections(structure).map(d => ({
      point: getAddChildPointForDir(ln, structure, d),
      dir: d,
    }));
    const primary = slots.find(s => s.dir === primaryDir) ?? slots[0];
    return {
      siblingA: { x: ln.x - QUICK_DOT_SIZE, y: cy },
      siblingB: { x: ln.x + ln.width + QUICK_DOT_SIZE, y: cy },
      addChild: primary.point,
      addChildDir: primary.dir,
      addChildSlots: slots,
    };
  }

  if (dir === 'down' || dir === 'up') {
    return {
      siblingA: { x: ln.x - QUICK_DOT_SIZE, y: cy },
      siblingB: { x: ln.x + ln.width + QUICK_DOT_SIZE, y: cy },
      addChild: getMindmapAddChildPoint(ln, structure),
      addChildDir: dir,
    };
  }

  const collapse = getMindmapCollapseRect(ln, structure);
  const plusHalf = QUICK_PLUS_SIZE / 2;
  const plusX = dir === 'right'
    ? (collapse
      ? collapse.x + collapse.width + COLLAPSE_PLUS_GAP + plusHalf
      : ln.x + ln.width + PLUS_LINE_OFFSET)
    : (collapse
      ? collapse.x - COLLAPSE_PLUS_GAP - plusHalf
      : ln.x - PLUS_LINE_OFFSET);

  return {
    siblingA: { x: cx, y: ln.y },
    siblingB: { x: cx, y: ln.y + ln.height },
    addChild: { x: plusX, y: cy },
    addChildDir: dir,
  };
}

/** 节点顶边以上快捷操作占用高度（布局坐标），供格式工具栏避让 */
export function computeMindmapQuickActionTopExtent(
  ln: MindMapLayoutNode,
  structure: MindNoteStructure,
): number {
  const actions = getMindmapQuickActionLayout(ln, structure);
  const nodeTop = ln.y;
  const halfPlus = QUICK_PLUS_SIZE / 2;
  const halfDot = QUICK_DOT_SIZE / 2;
  let extent = MINDMAP_QUICK_ACTION_TOP_EXTENT;

  const consider = (pt: MindmapQuickActionPoint, half: number) => {
    if (pt.y < nodeTop) {
      extent = Math.max(extent, nodeTop - pt.y + half);
    }
  };

  consider(actions.siblingA, halfDot);
  consider(actions.siblingB, halfDot);
  consider(actions.addChild, halfPlus);
  actions.addChildSlots?.forEach(s => consider(s.point, halfPlus));

  const collapse = getMindmapCollapseRect(ln, structure);
  if (collapse && collapse.y + collapse.height <= nodeTop) {
    extent = Math.max(extent, nodeTop - collapse.y);
  }

  return extent;
}
