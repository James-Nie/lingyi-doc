import type {
  MindMapLayout,
  MindMapLayoutNode,
  MindMapNodeStyle,
  MindMapPath,
  MindNode,
  MindNoteBranchStyle,
  MindNoteStructure,
} from './types';
import {
  getMindNodeFont,
  getMindNodeFontSize,
  getMindNodeLineHeight,
  MIND_NODE_MAX_WIDTH,
} from './utils';

const NODE_MIN_W = 72;
const NODE_MAX_W = MIND_NODE_MAX_WIDTH;
const ROOT_MIN_W = 120;
const PAD_X = 16;
const LEAF_PAD = 0;
const SIBLING_GAP = 14;
const ROOT_PAD = 48;
const H_GAP_L1 = 44;
const H_GAP_L2 = 28;
const V_GAP_L1 = 48;
const V_GAP_L2 = 28;
const BUS_INSET = 16;
/** 向下结构：子节点相对父节点左边缘的水平缩进 */
const CHILD_INDENT = 28;
/** 向下结构：竖向分支线相对父节点左边缘的偏移 */
const BRACKET_LINE_X = 10;
const BRACKET_INSET = 8;
const TREE_H_GAP = 40;
const TREE_V_GAP = 28;
const TIMELINE_H_GAP = 56;
const TIMELINE_V_GAP = 48;
const TIMELINE_SPINE = 20;

type Direction = 'right' | 'left';

interface LTree {
  node: MindNode;
  depth: number;
  style: MindMapNodeStyle;
  side: 'left' | 'right';
  width: number;
  height: number;
  x: number;
  y: number;
  subtreeW: number;
  subtreeH: number;
  children: LTree[];
}

function wrapTextLines(
  measure: (text: string) => number,
  text: string,
  maxContentWidth: number,
): string[] {
  if (!text) return [''];
  if (maxContentWidth <= 0) return [text];

  const lines: string[] = [];
  let line = '';
  for (const char of text) {
    const next = line + char;
    if (line && measure(next) > maxContentWidth) {
      lines.push(line);
      line = char;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function measureNode(
  text: string,
  depth: number,
  style: MindMapNodeStyle,
): { width: number; height: number } {
  const display = text || '输入文字';
  const padX = style === 'leaf' ? LEAF_PAD * 2 : PAD_X * 2;
  const padY = style === 'leaf' ? 8 : depth === 0 ? 20 : 16;
  const minW = depth === 0 ? ROOT_MIN_W : style === 'leaf' ? 48 : NODE_MIN_W;
  const maxW = NODE_MAX_W;
  const maxContentW = maxW - padX;
  const lineHeight = getMindNodeLineHeight(depth);
  const minH = lineHeight + padY;

  if (typeof document === 'undefined') {
    const factor = getMindNodeFontSize(depth) * 0.55;
    const singleLineW = display.length * factor;
    const contentW = Math.min(maxContentW, Math.max(minW - padX, singleLineW));
    const lineCount = Math.max(1, Math.ceil(singleLineW / Math.max(contentW, 1)));
    return {
      width: Math.min(maxW, Math.max(minW, Math.ceil(contentW) + padX)),
      height: Math.max(minH, lineCount * lineHeight + padY),
    };
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { width: minW, height: minH };

  ctx.font = getMindNodeFont(depth);
  const measure = (value: string) => ctx.measureText(value).width;
  const singleLineW = measure(display);

  let contentW = Math.min(maxContentW, Math.max(minW - padX, Math.ceil(singleLineW)));
  let lines = wrapTextLines(measure, display, contentW);

  if (singleLineW > maxContentW) {
    contentW = maxContentW;
    lines = wrapTextLines(measure, display, contentW);
  }

  const lineMaxW = Math.max(...lines.map(measure), minW - padX);
  const width = Math.min(maxW, Math.max(minW, Math.ceil(lineMaxW) + padX));
  const height = Math.max(minH, lines.length * lineHeight + padY);
  return { width, height };
}

function nodeStyle(depth: number): MindMapNodeStyle {
  if (depth === 0) return 'root';
  if (depth === 1) return 'branch';
  return 'leaf';
}

function hGap(depth: number): number {
  return depth === 0 ? H_GAP_L1 : H_GAP_L2;
}

function buildTree(node: MindNode, depth: number, side: 'left' | 'right'): LTree {
  const style = nodeStyle(depth);
  const size = measureNode(node.text, depth, style);
  const visible = node.collapsed ? [] : node.children;
  return {
    node,
    depth,
    style,
    side,
    width: size.width,
    height: size.height,
    x: 0,
    y: 0,
    subtreeW: size.width,
    subtreeH: size.height,
    children: visible.map(c => buildTree(c, depth + 1, side)),
  };
}

function measureHorizontal(tree: LTree, direction: Direction): void {
  if (!tree.children.length) {
    tree.subtreeW = tree.width;
    tree.subtreeH = tree.height;
    return;
  }
  tree.children.forEach(c => measureHorizontal(c, direction));
  const childBlockH = tree.children.reduce((s, c) => s + c.subtreeH, 0)
    + SIBLING_GAP * (tree.children.length - 1);
  const childBlockW = Math.max(...tree.children.map(c => c.subtreeW));
  tree.subtreeH = Math.max(tree.height, childBlockH);
  tree.subtreeW = tree.width + hGap(tree.depth) + childBlockW;
}

function placeHorizontal(tree: LTree, x: number, y: number, direction: Direction): void {
  tree.x = x;
  tree.y = y + (measureBlockH(tree) - tree.height) / 2;

  if (!tree.children.length) return;

  const childBlockH = tree.children.reduce((s, c) => s + c.subtreeH, 0)
    + SIBLING_GAP * (tree.children.length - 1);
  let cy = y + (measureBlockH(tree) - childBlockH) / 2;

  for (const child of tree.children) {
    const childX = direction === 'right'
      ? x + tree.width + hGap(tree.depth)
      : x - hGap(tree.depth) - child.subtreeW;
    placeHorizontal(child, childX, cy, direction);
    cy += child.subtreeH + SIBLING_GAP;
  }
}

function measureBlockH(tree: LTree): number {
  if (!tree.children.length) return tree.height;
  const childBlockH = tree.children.reduce((s, c) => s + c.subtreeH, 0)
    + SIBLING_GAP * (tree.children.length - 1);
  return Math.max(tree.height, childBlockH);
}

function assignSide(tree: LTree, side: 'left' | 'right'): void {
  tree.side = side;
  tree.children.forEach(c => assignSide(c, side));
}

function layoutHorizontalRoot(tree: LTree, direction: Direction): void {
  measureHorizontal(tree, direction);
  assignSide(tree, direction);
  if (direction === 'left') {
    placeHorizontal(tree, ROOT_PAD + tree.subtreeW - tree.width, ROOT_PAD, direction);
  } else {
    placeHorizontal(tree, ROOT_PAD, ROOT_PAD, direction);
  }
}

function layoutBalanced(root: LTree): void {
  const kids = root.children;
  const mid = Math.ceil(kids.length / 2);
  const leftKids = kids.slice(0, mid);
  const rightKids = kids.slice(mid);

  leftKids.forEach(c => { assignSide(c, 'left'); measureHorizontal(c, 'left'); });
  rightKids.forEach(c => { assignSide(c, 'right'); measureHorizontal(c, 'right'); });

  const leftW = leftKids.length ? Math.max(...leftKids.map(c => c.subtreeW)) : 0;
  const rightW = rightKids.length ? Math.max(...rightKids.map(c => c.subtreeW)) : 0;
  const leftH = leftKids.reduce((s, c) => s + c.subtreeH + SIBLING_GAP, 0) - (leftKids.length ? SIBLING_GAP : 0);
  const rightH = rightKids.reduce((s, c) => s + c.subtreeH + SIBLING_GAP, 0) - (rightKids.length ? SIBLING_GAP : 0);

  root.subtreeW = leftW + hGap(0) + root.width + hGap(0) + rightW;
  root.subtreeH = Math.max(root.height, leftH, rightH);
  root.x = ROOT_PAD + leftW + hGap(0);
  root.y = ROOT_PAD + (root.subtreeH - root.height) / 2;

  let cy = ROOT_PAD;
  for (const child of leftKids) {
    placeHorizontal(child, root.x - hGap(0) - child.subtreeW, cy, 'left');
    cy += child.subtreeH + SIBLING_GAP;
  }
  cy = ROOT_PAD;
  for (const child of rightKids) {
    placeHorizontal(child, root.x + root.width + hGap(0), cy, 'right');
    cy += child.subtreeH + SIBLING_GAP;
  }
}

function measureVertical(tree: LTree): void {
  if (!tree.children.length) {
    tree.subtreeW = tree.width;
    tree.subtreeH = tree.height;
    return;
  }
  tree.children.forEach(measureVertical);
  if (tree.depth === 0) {
    const rowW = tree.children.reduce((s, c) => s + c.subtreeW, 0)
      + SIBLING_GAP * (tree.children.length - 1);
    const rowH = Math.max(...tree.children.map(c => c.subtreeH));
    tree.subtreeW = Math.max(tree.width, rowW);
    tree.subtreeH = tree.height + V_GAP_L1 + rowH;
    return;
  }
  const colH = tree.children.reduce((s, c) => s + c.subtreeH, 0)
    + SIBLING_GAP * (tree.children.length - 1);
  const childBlockW = tree.children.length
    ? Math.max(...tree.children.map(c => c.subtreeW))
    : 0;
  tree.subtreeW = Math.max(tree.width, CHILD_INDENT + childBlockW);
  tree.subtreeH = tree.height + V_GAP_L2 + colH;
}

function placeVertical(tree: LTree, x: number, y: number): void {
  if (tree.depth === 1) {
    tree.x = x + Math.max(0, (tree.subtreeW - tree.width) / 2);
  } else {
    tree.x = x;
  }
  tree.y = y;
  if (!tree.children.length) return;

  if (tree.depth === 0) {
    const rowW = tree.children.reduce((s, c) => s + c.subtreeW, 0)
      + SIBLING_GAP * (tree.children.length - 1);
    tree.x = x + Math.max(0, (rowW - tree.width) / 2);
    let cx = x;
    const rowY = y + tree.height + V_GAP_L1;
    for (const child of tree.children) {
      placeVertical(child, cx, rowY);
      cx += child.subtreeW + SIBLING_GAP;
    }
    return;
  }

  let cy = y + tree.height + V_GAP_L2;
  for (const child of tree.children) {
    placeVertical(child, x + CHILD_INDENT, cy);
    cy += child.subtreeH + SIBLING_GAP;
  }
}

function layoutVerticalRoot(tree: LTree): void {
  measureVertical(tree);
  placeVertical(tree, ROOT_PAD, ROOT_PAD);
}

function measureTreeSide(tree: LTree, side: 'left' | 'right'): void {
  if (!tree.children.length) {
    tree.subtreeW = tree.width;
    tree.subtreeH = tree.height;
    return;
  }
  tree.children.forEach(c => measureTreeSide(c, side));
  const childBlockH = tree.children.reduce((s, c) => s + c.subtreeH, 0)
    + SIBLING_GAP * (tree.children.length - 1);
  const childBlockW = Math.max(...tree.children.map(c => c.subtreeW));
  tree.subtreeH = Math.max(tree.height, childBlockH);
  tree.subtreeW = tree.width + TREE_H_GAP + childBlockW;
}

function placeTreeSide(tree: LTree, x: number, y: number, side: 'left' | 'right'): void {
  if (side === 'right') {
    tree.x = x;
  } else {
    tree.x = x + tree.subtreeW - tree.width;
  }
  const childBlockH = tree.children.reduce((s, c) => s + c.subtreeH, 0)
    + SIBLING_GAP * (tree.children.length - 1);
  tree.y = y + Math.max(0, (childBlockH - tree.height) / 2);

  if (!tree.children.length) return;

  let cy = y;
  for (const child of tree.children) {
    const childX = side === 'right'
      ? tree.x + tree.width + TREE_H_GAP
      : tree.x - TREE_H_GAP - child.subtreeW;
    placeTreeSide(child, childX, cy, side);
    cy += child.subtreeH + SIBLING_GAP;
  }
}

function layoutTreeRoot(tree: LTree, side: 'left' | 'right'): void {
  measureTreeSide(tree, side);
  assignSide(tree, side);
  placeTreeSide(tree, ROOT_PAD, ROOT_PAD, side);
}

function layoutTreeBalanced(root: LTree): void {
  const kids = root.children;
  const mid = Math.ceil(kids.length / 2);
  const leftKids = kids.slice(0, mid);
  const rightKids = kids.slice(mid);

  leftKids.forEach(c => { assignSide(c, 'left'); measureTreeSide(c, 'left'); });
  rightKids.forEach(c => { assignSide(c, 'right'); measureTreeSide(c, 'right'); });

  const leftW = leftKids.length ? Math.max(...leftKids.map(c => c.subtreeW)) : 0;
  const rightW = rightKids.length ? Math.max(...rightKids.map(c => c.subtreeW)) : 0;
  const leftH = leftKids.reduce((s, c) => s + c.subtreeH + SIBLING_GAP, 0) - (leftKids.length ? SIBLING_GAP : 0);
  const rightH = rightKids.reduce((s, c) => s + c.subtreeH + SIBLING_GAP, 0) - (rightKids.length ? SIBLING_GAP : 0);

  root.subtreeW = leftW + TREE_H_GAP + root.width + TREE_H_GAP + rightW;
  root.subtreeH = root.height + TREE_V_GAP + Math.max(leftH, rightH, 0);
  root.x = ROOT_PAD + leftW + TREE_H_GAP;
  root.y = ROOT_PAD;

  let cy = ROOT_PAD + root.height + TREE_V_GAP;
  let ly = cy;
  for (const child of leftKids) {
    placeTreeSide(child, ROOT_PAD, ly, 'left');
    ly += child.subtreeH + SIBLING_GAP;
  }
  let ry = cy;
  for (const child of rightKids) {
    placeTreeSide(child, root.x + root.width + TREE_H_GAP, ry, 'right');
    ry += child.subtreeH + SIBLING_GAP;
  }
}

function measureTimelineH(tree: LTree): void {
  if (!tree.children.length) {
    tree.subtreeW = tree.width;
    tree.subtreeH = tree.height;
    return;
  }
  tree.children.forEach(measureTimelineH);
  const spanW = tree.children.reduce((s, c) => s + c.subtreeW + TIMELINE_H_GAP, 0)
    - (tree.children.length ? TIMELINE_H_GAP : 0);
  const above = tree.children.filter((_, i) => i % 2 === 0);
  const below = tree.children.filter((_, i) => i % 2 === 1);
  const aboveH = above.length ? Math.max(...above.map(c => c.subtreeH)) : 0;
  const belowH = below.length ? Math.max(...below.map(c => c.subtreeH)) : 0;
  tree.subtreeW = tree.width + TIMELINE_H_GAP + spanW;
  tree.subtreeH = Math.max(tree.height, aboveH + TIMELINE_SPINE + belowH);
}

function placeTimelineH(tree: LTree, x: number, y: number): void {
  tree.x = x;
  tree.y = y + (tree.subtreeH - tree.height) / 2;
  if (!tree.children.length) return;

  const spineY = tree.y + tree.height / 2;
  let cx = x + tree.width + TIMELINE_H_GAP;
  for (let i = 0; i < tree.children.length; i++) {
    const child = tree.children[i];
    const childY = i % 2 === 0
      ? spineY - TIMELINE_SPINE / 2 - child.subtreeH
      : spineY + TIMELINE_SPINE / 2;
    placeTimelineH(child, cx, childY);
    cx += child.subtreeW + TIMELINE_H_GAP;
  }
}

function layoutTimelineHRoot(tree: LTree): void {
  measureTimelineH(tree);
  assignSide(tree, 'right');
  placeTimelineH(tree, ROOT_PAD, ROOT_PAD);
}

function measureTimelineV(tree: LTree): void {
  if (!tree.children.length) {
    tree.subtreeW = tree.width;
    tree.subtreeH = tree.height;
    return;
  }
  tree.children.forEach(measureTimelineV);
  const spanH = tree.children.reduce((s, c) => s + c.subtreeH + TIMELINE_V_GAP, 0)
    - (tree.children.length ? TIMELINE_V_GAP : 0);
  const left = tree.children.filter((_, i) => i % 2 === 0);
  const right = tree.children.filter((_, i) => i % 2 === 1);
  const leftW = left.length ? Math.max(...left.map(c => c.subtreeW)) : 0;
  const rightW = right.length ? Math.max(...right.map(c => c.subtreeW)) : 0;
  tree.subtreeW = Math.max(tree.width, leftW + TIMELINE_SPINE + rightW);
  tree.subtreeH = tree.height + TIMELINE_V_GAP + spanH;
}

function placeTimelineV(tree: LTree, x: number, y: number): void {
  tree.x = x + (tree.subtreeW - tree.width) / 2;
  tree.y = y;
  if (!tree.children.length) return;

  const spineX = tree.x + tree.width / 2;
  let cy = y + tree.height + TIMELINE_V_GAP;
  for (let i = 0; i < tree.children.length; i++) {
    const child = tree.children[i];
    const childX = i % 2 === 0
      ? spineX - TIMELINE_SPINE / 2 - child.subtreeW
      : spineX + TIMELINE_SPINE / 2;
    placeTimelineV(child, childX, cy);
    cy += child.subtreeH + TIMELINE_V_GAP;
  }
}

function layoutTimelineVRoot(tree: LTree): void {
  measureTimelineV(tree);
  assignSide(tree, 'right');
  placeTimelineV(tree, ROOT_PAD, ROOT_PAD);
}

function collectNodes(tree: LTree, out: MindMapLayoutNode[]): void {
  out.push({
    id: tree.node.id,
    text: tree.node.text,
    completed: tree.node.completed,
    collapsed: tree.node.collapsed,
    childCount: tree.node.children.length,
    depth: tree.depth,
    x: tree.x,
    y: tree.y,
    width: tree.width,
    height: tree.height,
    isRoot: tree.depth === 0,
    style: tree.style,
    side: tree.side,
  });
  tree.children.forEach(c => collectNodes(c, out));
}

function buildTreeSidePath(
  parent: LTree,
  kids: LTree[],
  side: 'left' | 'right',
  style: MindNoteBranchStyle,
): string {
  if (!kids.length) return '';
  const px = side === 'right' ? parent.x + parent.width : parent.x;
  const py = parent.y + parent.height / 2;
  const busX = side === 'right' ? px + TREE_H_GAP / 2 : px - TREE_H_GAP / 2;
  const top = childMidY(kids[0]);
  const bottom = childMidY(kids[kids.length - 1]);
  const parts: string[] = [`M ${px} ${py}`, `L ${busX} ${py}`, `L ${busX} ${top}`];
  for (const child of kids) {
    const cy = childMidY(child);
    const cx = side === 'right' ? child.x : child.x + child.width;
    if (style === 'straight') {
      parts.push(`L ${busX} ${cy}`, `L ${cx} ${cy}`);
    } else {
      parts.push(`L ${busX} ${cy}`, `Q ${(busX + cx) / 2} ${cy} ${cx} ${cy}`);
    }
    parts.push(`M ${busX} ${cy}`);
  }
  parts.push(`L ${busX} ${bottom}`);
  return parts.join(' ');
}

function buildTimelineHPath(parent: LTree, style: MindNoteBranchStyle): string {
  const kids = parent.children;
  if (!kids.length) return '';
  const spineY = parent.y + parent.height / 2;
  const px = parent.x + parent.width;
  const parts: string[] = [`M ${px} ${spineY}`];
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    const cx = child.x;
    const cy = child.y + (i % 2 === 0 ? child.height : 0);
    const joinY = i % 2 === 0 ? child.y + child.height : child.y;
    parts.push(`L ${cx - TIMELINE_H_GAP / 2} ${spineY}`);
    if (style === 'straight') parts.push(`L ${cx - TIMELINE_H_GAP / 2} ${joinY}`, `L ${cx} ${joinY}`);
    else parts.push(`Q ${cx - TIMELINE_H_GAP / 2} ${(spineY + joinY) / 2} ${cx} ${joinY}`);
    parts.push(`M ${cx - TIMELINE_H_GAP / 2} ${spineY}`);
  }
  return parts.join(' ');
}

function buildTimelineVPath(parent: LTree, style: MindNoteBranchStyle): string {
  const kids = parent.children;
  if (!kids.length) return '';
  const spineX = parent.x + parent.width / 2;
  const py = parent.y + parent.height;
  const parts: string[] = [`M ${spineX} ${py}`];
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    const cy = child.y;
    const joinX = i % 2 === 0 ? child.x + child.width : child.x;
    parts.push(`L ${spineX} ${cy - TIMELINE_V_GAP / 2}`);
    if (style === 'straight') parts.push(`L ${joinX} ${cy - TIMELINE_V_GAP / 2}`, `L ${joinX} ${cy}`);
    else parts.push(`Q ${(spineX + joinX) / 2} ${cy - TIMELINE_V_GAP / 2} ${joinX} ${cy}`);
    parts.push(`M ${spineX} ${cy - TIMELINE_V_GAP / 2}`);
  }
  return parts.join(' ');
}

function isTreeStructure(structure: MindNoteStructure): boolean {
  return structure === 'treeRight' || structure === 'treeLeft' || structure === 'treeBalanced';
}

function isTimelineStructure(structure: MindNoteStructure): boolean {
  return structure === 'timelineH' || structure === 'timelineV';
}

function collectPaths(
  tree: LTree,
  structure: MindNoteStructure,
  branchStyle: MindNoteBranchStyle,
  paths: MindMapPath[],
): void {
  if (!tree.children.length) return;

  if (isTimelineStructure(structure)) {
    paths.push({
      id: `path-${tree.node.id}`,
      d: structure === 'timelineH'
        ? buildTimelineHPath(tree, branchStyle)
        : buildTimelineVPath(tree, branchStyle),
    });
  } else if (isTreeStructure(structure)) {
    if (tree.depth === 0 && structure === 'treeBalanced') {
      const leftKids = tree.children.filter(c => c.side === 'left');
      const rightKids = tree.children.filter(c => c.side === 'right');
      if (leftKids.length) {
        paths.push({ id: `path-${tree.node.id}-l`, d: buildTreeSidePath(tree, leftKids, 'left', branchStyle) });
      }
      if (rightKids.length) {
        paths.push({ id: `path-${tree.node.id}-r`, d: buildTreeSidePath(tree, rightKids, 'right', branchStyle) });
      }
    } else {
      const side = structure === 'treeLeft' ? 'left' : 'right';
      paths.push({ id: `path-${tree.node.id}`, d: buildTreeSidePath(tree, tree.children, side, branchStyle) });
    }
  } else if (structure === 'vertical') {
    paths.push({
      id: `path-${tree.node.id}`,
      d: tree.depth === 0
        ? buildVerticalRootBus(tree, branchStyle)
        : buildVerticalBracket(tree, branchStyle),
    });
  } else if (tree.depth === 0) {
    if (structure === 'balanced') {
      const leftKids = tree.children.filter(c => c.side === 'left');
      const rightKids = tree.children.filter(c => c.side === 'right');
      if (rightKids.length) {
        paths.push({ id: `path-${tree.node.id}-r`, d: buildHalfBus(tree, rightKids, 'right', branchStyle) });
      }
      if (leftKids.length) {
        paths.push({ id: `path-${tree.node.id}-l`, d: buildHalfBus(tree, leftKids, 'left', branchStyle) });
      }
    } else {
      const side = structure === 'left' ? 'left' : 'right';
      paths.push({ id: `path-${tree.node.id}`, d: buildHalfBus(tree, tree.children, side, branchStyle) });
    }
  } else {
    paths.push({
      id: `path-${tree.node.id}`,
      d: buildHalfBus(tree, tree.children, tree.side, branchStyle),
    });
  }

  tree.children.forEach(c => collectPaths(c, structure, branchStyle, paths));
}

function childMidY(c: LTree): number {
  return c.y + c.height / 2;
}

function buildHalfBus(
  parent: LTree,
  kids: LTree[],
  side: 'left' | 'right',
  style: MindNoteBranchStyle,
): string {
  if (!kids.length) return '';
  const top = childMidY(kids[0]);
  const bottom = childMidY(kids[kids.length - 1]);
  const py = parent.y + parent.height / 2;
  const px = side === 'right' ? parent.x + parent.width : parent.x;
  const busX = side === 'right' ? px + BUS_INSET : px - BUS_INSET;
  const parts: string[] = [`M ${px} ${py}`];

  if (style === 'straight') {
    parts.push(`L ${busX} ${py}`, `L ${busX} ${top}`);
    for (const child of kids) {
      const cy = childMidY(child);
      const cx = side === 'right' ? child.x : child.x + child.width;
      parts.push(`L ${busX} ${cy}`, `L ${cx} ${cy}`, `M ${busX} ${cy}`);
    }
    parts.push(`L ${busX} ${bottom}`);
  } else {
    parts.push(`L ${busX} ${py}`, `L ${busX} ${top}`);
    for (const child of kids) {
      const cy = childMidY(child);
      const cx = side === 'right' ? child.x : child.x + child.width;
      parts.push(`L ${busX} ${cy}`, `Q ${(busX + cx) / 2} ${cy} ${cx} ${cy}`, `M ${busX} ${cy}`);
    }
    parts.push(`L ${busX} ${bottom}`);
  }
  return parts.join(' ');
}

function buildVerticalRootBus(parent: LTree, style: MindNoteBranchStyle): string {
  const kids = parent.children;
  if (!kids.length) return '';
  const busY = parent.y + parent.height + V_GAP_L1 / 2;
  const px = parent.x + parent.width / 2;
  const parts: string[] = [
    `M ${px} ${parent.y + parent.height}`,
    `L ${px} ${busY}`,
  ];
  for (const child of kids) {
    const cx = child.x + child.width / 2;
    parts.push(`M ${cx} ${busY}`);
    if (style === 'straight') parts.push(`L ${cx} ${child.y}`);
    else parts.push(`Q ${cx} ${(busY + child.y) / 2} ${cx} ${child.y}`);
  }
  return parts.join(' ');
}

function columnOrigin(tree: LTree): number {
  if (tree.depth === 1) {
    return tree.x - Math.max(0, (tree.subtreeW - tree.width) / 2);
  }
  return tree.x;
}

function buildVerticalBracket(parent: LTree, style: MindNoteBranchStyle): string {
  const kids = parent.children;
  if (!kids.length) return '';
  const top = childMidY(kids[0]);
  const bottom = childMidY(kids[kids.length - 1]);
  const colX = columnOrigin(parent);
  const vertX = colX + BRACKET_LINE_X;
  const parentCenterX = parent.x + parent.width / 2;
  const parts: string[] = [
    `M ${parentCenterX} ${parent.y + parent.height}`,
    `L ${parentCenterX} ${top}`,
    `L ${vertX} ${top}`,
  ];
  for (const child of kids) {
    const cy = childMidY(child);
    const cx = child.x;
    if (style === 'straight') parts.push(`L ${vertX} ${cy}`, `L ${cx} ${cy}`);
    else parts.push(`L ${vertX} ${cy}`, `Q ${(vertX + cx) / 2} ${cy} ${cx} ${cy}`);
    parts.push(`M ${vertX} ${cy}`);
  }
  parts.push(`L ${vertX} ${bottom}`);
  return parts.join(' ');
}

function bounds(nodes: MindMapLayoutNode[]): { width: number; height: number } {
  let maxX = ROOT_PAD;
  let maxY = ROOT_PAD;
  for (const n of nodes) {
    maxX = Math.max(maxX, n.x + n.width + ROOT_PAD);
    maxY = Math.max(maxY, n.y + n.height + ROOT_PAD);
  }
  return { width: maxX, height: maxY };
}

export function computeMindMapLayout(
  root: MindNode,
  structure: MindNoteStructure = 'right',
  branchStyle: MindNoteBranchStyle = 'straight',
): MindMapLayout {
  const tree = buildTree(root, 0, 'right');

  if (structure === 'vertical') {
    layoutVerticalRoot(tree);
  } else if (structure === 'balanced') {
    layoutBalanced(tree);
  } else if (structure === 'left') {
    layoutHorizontalRoot(tree, 'left');
  } else if (structure === 'treeRight') {
    layoutTreeRoot(tree, 'right');
  } else if (structure === 'treeLeft') {
    layoutTreeRoot(tree, 'left');
  } else if (structure === 'treeBalanced') {
    layoutTreeBalanced(tree);
  } else if (structure === 'timelineH') {
    layoutTimelineHRoot(tree);
  } else if (structure === 'timelineV') {
    layoutTimelineVRoot(tree);
  } else {
    layoutHorizontalRoot(tree, 'right');
  }

  const nodes: MindMapLayoutNode[] = [];
  const paths: MindMapPath[] = [];
  collectNodes(tree, nodes);
  collectPaths(tree, structure, branchStyle, paths);
  const { width, height } = bounds(nodes);
  return { nodes, paths, width, height };
}

export function buildBranchPath(): string {
  return '';
}
