import type { KbNodeDto, KbNodeTreeDto } from '../types/knowledge-base';

function compareNodes(a: KbNodeDto, b: KbNodeDto): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.title.localeCompare(b.title, 'zh-CN');
}

function sortTree(nodes: KbNodeTreeDto[]): void {
  nodes.sort(compareNodes);
  nodes.forEach(node => sortTree(node.children));
}

function buildTreeFromNodes(nodes: KbNodeDto[]): KbNodeTreeDto[] {
  const map = new Map<string, KbNodeTreeDto>();
  for (const node of nodes) {
    map.set(node.id, { ...node, children: [] });
  }

  const roots: KbNodeTreeDto[] = [];
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

export interface KbNodeTreeResult {
  items: KbNodeTreeDto[];
  home: KbNodeDto | null;
}

/**
 * 将扁平节点列表组装为目录树。
 * 首页节点（isHome）不作为根节点返回，其子节点提升为顶层 items。
 */
export function buildKbNodeTree(nodes: KbNodeDto[]): KbNodeTreeResult {
  const home = nodes.find(node => node.isHome) ?? null;
  const rest = nodes.filter(node => !node.isHome);
  const normalized = rest.map(node => ({
    ...node,
    parentId: node.parentId === home?.id ? null : node.parentId,
  }));
  return {
    items: buildTreeFromNodes(normalized),
    home,
  };
}
