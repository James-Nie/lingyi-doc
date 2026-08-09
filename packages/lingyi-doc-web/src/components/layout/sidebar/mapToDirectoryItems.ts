import type { DocumentListItem } from '@lingyi-doc/core';
import type { WikiSpaceNode } from '../../../stores/knowledgeBaseStore';
import {
  buildKbTree,
  flattenKbTree,
} from '../../../utils/kbTreeUtils';
import type { SidebarDirectoryItem } from './SidebarDocRow';

/** 我的文档库：扁平文档 → 目录列表项（id = doc.id，与 activeItemId 对齐） */
export function mapDocumentsToDirectoryItems(
  docs: Array<Pick<DocumentListItem, 'id' | 'title' | 'docType'>>,
): SidebarDirectoryItem[] {
  return docs.map(doc => ({
    id: doc.id,
    title: doc.title || '未命名文档',
    docType: doc.docType,
  }));
}

export function getKbNodeDisplayType(
  node: WikiSpaceNode,
  documents: Array<Pick<DocumentListItem, 'id' | 'docType'>>,
): string {
  if (node.isHome || node.type === 'page') return 'page';
  if (node.type === 'folder') return 'folder';
  if (node.docId) {
    const doc = documents.find(item => item.id === node.docId);
    if (doc?.docType) return doc.docType;
  }
  if (node.type === 'sheet') return 'freeform';
  return 'richtext';
}

/** 知识库：节点树/搜索结果 → 目录列表项 */
export function mapKbNodesToDirectoryItems(input: {
  nodes: WikiSpaceNode[];
  documents: Array<Pick<DocumentListItem, 'id' | 'docType'>>;
  expandedIds: Set<string>;
  isSearching: boolean;
}): SidebarDirectoryItem[] {
  const { nodes, documents, expandedIds, isSearching } = input;

  if (isSearching) {
    return nodes.map(node => ({
      id: node.id,
      title: node.title,
      docType: getKbNodeDisplayType(node, documents),
      depth: 0,
      isFolder: node.type === 'folder',
    }));
  }

  const tree = buildKbTree(nodes);
  const flat = flattenKbTree(tree, expandedIds);
  return flat.map(({ node, depth, hasChildren }) => ({
    id: node.id,
    title: node.title,
    docType: getKbNodeDisplayType(node, documents),
    depth,
    hasChildren,
    isFolder: node.type === 'folder',
    expanded: expandedIds.has(node.id),
  }));
}
