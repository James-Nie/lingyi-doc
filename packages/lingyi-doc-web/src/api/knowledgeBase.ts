/**
 * 知识库 API 客户端
 * @see docs/knowledge-base-api.openapi.yaml
 * @see docs/knowledge-base-architecture.md
 */
import { authFetch } from '../stores/authStore';

const BASE = '/api/v1/c/knowledge-bases';

// ─── 类型定义（与 OpenAPI Schema 对齐）────────────────────────────────────

export type KnowledgeBaseScope = 1 | 2;

export type KnowledgeBaseVisibility = 'members' | 'organization';

export type KnowledgeBaseCover = 'blue' | 'sunset';

export type KbNodeType = 'page' | 'doc_ref' | 'folder';

export type KbMemberRole = 'owner' | 'admin' | 'editor' | 'viewer';

export type KbDocType = 'freeform' | 'base' | 'richtext' | 'mindnote' | 'slides' | 'standard';

export interface KnowledgeBase {
  id: string;
  scope: KnowledgeBaseScope;
  ownerId: string | null;
  tenantId: string | null;
  orgId: string | null;
  name: string;
  description: string | null;
  emoji: string;
  cover: KnowledgeBaseCover;
  visibility: KnowledgeBaseVisibility;
  myRole?: KbMemberRole;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface KbNode {
  id: string;
  kbId: string;
  parentId: string | null;
  title: string;
  nodeType: KbNodeType;
  docId: string | null;
  docType?: KbDocType | null;
  sortOrder: number;
  isHome: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KbNodeTree extends KbNode {
  children: KbNodeTree[];
}

export interface KbMember {
  id: string;
  kbId: string;
  userId: string;
  displayName?: string;
  email?: string;
  role: KbMemberRole;
  createdAt: string;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
}

export interface KbNodeListResponse {
  items: KbNodeTree[];
  total: number;
  home: KbNode | null;
}

export interface CreateKnowledgeBaseInput {
  name: string;
  description?: string;
  emoji?: string;
  cover?: KnowledgeBaseCover;
  visibility: KnowledgeBaseVisibility;
  orgId?: string;
}

export interface CreateKnowledgeBaseResult extends KnowledgeBase {
  defaultNodeId: string;
}

export interface UpdateKnowledgeBaseInput {
  name?: string;
  description?: string;
  emoji?: string;
  cover?: KnowledgeBaseCover;
  visibility?: KnowledgeBaseVisibility;
  orgId?: string | null;
}

export interface CreateKbNodeInput {
  title: string;
  nodeType: KbNodeType;
  parentId?: string | null;
  docId?: string;
  sortOrder?: number;
}

export interface UpdateKbNodeInput {
  title?: string;
  parentId?: string | null;
  sortOrder?: number;
}

export interface CreateKbDocumentInput {
  title: string;
  docType: KbDocType;
  templateId?: string;
}

export interface CreateKbDocumentResult {
  docId: string;
  nodeId: string;
  docType: KbDocType;
  title: string;
}

export interface AddKbMemberInput {
  userId: string;
  role: KbMemberRole;
}

export interface ListKnowledgeBasesQuery {
  sortBy?: 'updated' | 'created' | 'name';
  keyword?: string;
}

// ─── 兼容现有 localStorage Store 的映射工具 ───────────────────────────────

/** 将 API 节点类型映射为现有 Wiki UI 使用的类型 */
export function mapKbNodeTypeToWiki(node: KbNode): 'page' | 'sheet' | 'doc' | 'folder' {
  if (node.nodeType === 'page') return 'page';
  if (node.nodeType === 'folder') return 'folder';
  if (node.docType === 'freeform' || node.docType === 'standard') return 'sheet';
  return 'doc';
}

/** 将 API 响应转为 knowledgeBaseStore 使用的毫秒时间戳格式 */
export function mapKnowledgeBaseToLegacy(kb: KnowledgeBase) {
  return {
    id: kb.id,
    name: kb.name,
    description: kb.description ?? '',
    emoji: kb.emoji,
    visibility: kb.visibility,
    cover: kb.cover,
    myRole: kb.myRole,
    tag: kb.visibility === 'organization' ? '企业公开' : undefined,
    createdAt: Date.parse(kb.createdAt),
    updatedAt: Date.parse(kb.updatedAt),
  };
}

/** 是否可进入知识库设置（所有者 / 管理员） */
export function canManageKnowledgeBase(role?: KbMemberRole | null): boolean {
  return role === 'owner' || role === 'admin';
}

export function mapKbNodeToLegacy(node: KbNode) {
  return {
    id: node.id,
    kbId: node.kbId,
    title: node.title,
    type: mapKbNodeTypeToWiki(node),
    docId: node.docId ?? undefined,
    parentId: node.parentId,
    sortOrder: node.sortOrder,
    isHome: node.isHome,
    createdAt: Date.parse(node.createdAt),
    updatedAt: Date.parse(node.updatedAt),
  };
}

/** 将 API 返回的树形节点展平为列表 */
export function flattenKbNodeTree(tree: KbNodeTree[]): KbNode[] {
  const result: KbNode[] = [];
  const walk = (nodes: KbNodeTree[]) => {
    for (const { children, ...node } of nodes) {
      result.push(node);
      if (children.length > 0) walk(children);
    }
  };
  walk(tree);
  return result;
}

// ─── API 方法 ─────────────────────────────────────────────────────────────

export const KnowledgeBaseApi = {
  /** GET /knowledge-bases */
  list(query: ListKnowledgeBasesQuery = {}): Promise<ListResponse<KnowledgeBase>> {
    const params = new URLSearchParams();
    if (query.sortBy) params.set('sortBy', query.sortBy);
    if (query.keyword) params.set('keyword', query.keyword);
    const qs = params.toString();
    return authFetch(`${BASE}${qs ? `?${qs}` : ''}`);
  },

  /** POST /knowledge-bases */
  create(input: CreateKnowledgeBaseInput): Promise<CreateKnowledgeBaseResult> {
    return authFetch(BASE, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** GET /knowledge-bases/:kbId */
  get(kbId: string): Promise<KnowledgeBase> {
    return authFetch(`${BASE}/${kbId}`);
  },

  /** PATCH /knowledge-bases/:kbId */
  update(kbId: string, input: UpdateKnowledgeBaseInput): Promise<KnowledgeBase> {
    return authFetch(`${BASE}/${kbId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  /** DELETE /knowledge-bases/:kbId */
  remove(kbId: string): Promise<{ id: string }> {
    return authFetch(`${BASE}/${kbId}`, { method: 'DELETE' });
  },

  /** GET /knowledge-bases/:kbId/nodes */
  listNodes(kbId: string): Promise<KbNodeListResponse> {
    return authFetch(`${BASE}/${kbId}/nodes`);
  },

  /** POST /knowledge-bases/:kbId/nodes */
  createNode(kbId: string, input: CreateKbNodeInput): Promise<KbNode> {
    return authFetch(`${BASE}/${kbId}/nodes`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** PATCH /knowledge-bases/:kbId/nodes/:nodeId */
  updateNode(kbId: string, nodeId: string, input: UpdateKbNodeInput): Promise<KbNode> {
    return authFetch(`${BASE}/${kbId}/nodes/${nodeId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  /** DELETE /knowledge-bases/:kbId/nodes/:nodeId */
  removeNode(
    kbId: string,
    nodeId: string,
    options?: { deleteDocument?: boolean },
  ): Promise<{ id: string }> {
    const params = new URLSearchParams();
    if (options?.deleteDocument) params.set('deleteDocument', 'true');
    const qs = params.toString();
    return authFetch(`${BASE}/${kbId}/nodes/${nodeId}${qs ? `?${qs}` : ''}`, {
      method: 'DELETE',
    });
  },

  /** POST /knowledge-bases/:kbId/nodes/:parentNodeId/doc */
  createDocument(
    kbId: string,
    parentNodeId: string,
    input: CreateKbDocumentInput,
  ): Promise<CreateKbDocumentResult> {
    return authFetch(`${BASE}/${kbId}/nodes/${parentNodeId}/doc`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** GET /knowledge-bases/:kbId/members */
  listMembers(kbId: string): Promise<ListResponse<KbMember>> {
    return authFetch(`${BASE}/${kbId}/members`);
  },

  /** GET /knowledge-bases/:kbId/members/search-users?q= */
  searchUsersForAdd(
    kbId: string,
    q: string,
  ): Promise<{ items: Array<{ userId: string; displayName: string; email: string; phone: string | null }> }> {
    const qs = new URLSearchParams({ q }).toString();
    return authFetch(`${BASE}/${kbId}/members/search-users?${qs}`);
  },

  /** POST /knowledge-bases/:kbId/members */
  addMember(kbId: string, input: AddKbMemberInput): Promise<KbMember> {
    return authFetch(`${BASE}/${kbId}/members`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** POST /knowledge-bases/:kbId/members 批量 */
  addMembers(
    kbId: string,
    input: { userIds: string[]; role: Exclude<KbMemberRole, 'owner'> },
  ): Promise<{ items: KbMember[]; added: number }> {
    return authFetch(`${BASE}/${kbId}/members`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** POST /knowledge-bases/:kbId/invite-link */
  ensureInviteLink(
    kbId: string,
    role: Exclude<KbMemberRole, 'owner'>,
  ): Promise<{ token: string; role: string; invitePath: string }> {
    return authFetch(`${BASE}/${kbId}/invite-link`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
  },

  /** GET /kb-invites/:token */
  getInviteInfo(token: string): Promise<{
    token: string;
    kbId: string;
    kbName: string;
    emoji: string;
    role: Exclude<KbMemberRole, 'owner'>;
    closed: boolean;
    alreadyMember: boolean;
  }> {
    return authFetch(`/api/v1/c/kb-invites/${encodeURIComponent(token)}`);
  },

  /** POST /kb-invites/:token/join */
  acceptInvite(token: string): Promise<{ kbId: string; role: Exclude<KbMemberRole, 'owner'> }> {
    return authFetch(`/api/v1/c/kb-invites/${encodeURIComponent(token)}/join`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  /** DELETE /knowledge-bases/:kbId/members/:userId */
  removeMember(kbId: string, userId: string): Promise<{ userId: string }> {
    return authFetch(`${BASE}/${kbId}/members/${userId}`, { method: 'DELETE' });
  },
} as const;
