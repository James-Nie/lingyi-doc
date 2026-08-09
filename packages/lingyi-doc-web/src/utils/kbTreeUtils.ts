import type { WikiSpaceNode } from '../stores/knowledgeBaseStore';

export interface KbTreeNode extends WikiSpaceNode {
  children: KbTreeNode[];
}

export interface FlatKbTreeItem {
  node: WikiSpaceNode;
  depth: number;
  hasChildren: boolean;
}

function compareNodes(a: WikiSpaceNode, b: WikiSpaceNode): number {
  const ao = a.sortOrder ?? 0;
  const bo = b.sortOrder ?? 0;
  if (ao !== bo) return ao - bo;
  return a.title.localeCompare(b.title, 'zh-CN');
}

function sortTree(list: KbTreeNode[]): void {
  list.sort(compareNodes);
  list.forEach(node => sortTree(node.children));
}

function buildTreeFromNodes(nodes: WikiSpaceNode[]): KbTreeNode[] {
  const map = new Map<string, KbTreeNode>();
  for (const node of nodes) {
    map.set(node.id, { ...node, children: [] });
  }

  const roots: KbTreeNode[] = [];
  for (const node of nodes) {
    const current = map.get(node.id);
    if (!current) continue;
    const parentId = node.parentId;
    if (parentId && map.has(parentId) && parentId !== node.id) {
      map.get(parentId)!.children.push(current);
    } else {
      roots.push(current);
    }
  }

  sortTree(roots);
  return roots;
}

/** 将扁平节点列表组装为树；首页节点不作为根，其子节点提升为顶层 */
export function buildKbTree(nodes: WikiSpaceNode[]): KbTreeNode[] {
  const home = nodes.find(node => node.isHome) ?? null;
  const rest = nodes.filter(node => !node.isHome);
  const normalized = rest.map(node => ({
    ...node,
    parentId: node.parentId === home?.id ? null : node.parentId,
  }));
  return buildTreeFromNodes(normalized);
}

/** 深度优先展开为侧栏展示列表 */
export function flattenKbTree(
  roots: KbTreeNode[],
  expandedIds: Set<string>,
): FlatKbTreeItem[] {
  const result: FlatKbTreeItem[] = [];

  const walk = (list: KbTreeNode[], depth: number) => {
    for (const node of list) {
      const hasChildren = node.children.length > 0;
      result.push({ node, depth, hasChildren });
      if (hasChildren && expandedIds.has(node.id)) {
        walk(node.children, depth + 1);
      }
    }
  };

  walk(roots, 0);
  return result;
}

/** 收集某节点的所有子孙 id（用于移动时排除） */
export function collectDescendantIds(
  nodes: WikiSpaceNode[],
  rootId: string,
): Set<string> {
  const blocked = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parentId && blocked.has(node.parentId) && !blocked.has(node.id)) {
        blocked.add(node.id);
        changed = true;
      }
    }
  }
  return blocked;
}

/** 获取从根到目标节点的祖先链 id */
export function collectAncestorIds(
  nodes: WikiSpaceNode[],
  targetId: string,
): string[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const ids: string[] = [];
  let current = byId.get(targetId);
  while (current?.parentId) {
    ids.push(current.parentId);
    current = byId.get(current.parentId);
  }
  return ids;
}

/** 从根到目标节点的完整路径（含目标节点） */
export function buildKbNodePath(nodes: WikiSpaceNode[], targetId: string): WikiSpaceNode[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const path: WikiSpaceNode[] = [];
  let current = byId.get(targetId);
  while (current) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** 面包屑展示节点：中间路径跳过首页容器，单独查看首页时仍保留 */
export function getKbBreadcrumbPath(path: WikiSpaceNode[]): WikiSpaceNode[] {
  if (path.length === 0) return [];
  if (path.length === 1 && path[0].isHome) return path;
  return path.filter(node => !node.isHome);
}

/** 可作为移动目标的节点（首页 + 文件夹） */
export function listMoveTargets(
  nodes: WikiSpaceNode[],
  movingNodeId: string,
): WikiSpaceNode[] {
  const blocked = collectDescendantIds(nodes, movingNodeId);
  return nodes.filter(node => {
    if (blocked.has(node.id)) return false;
    if (node.isHome) return true;
    return node.type === 'folder';
  });
}
