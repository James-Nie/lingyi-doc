export type KnowledgeBaseVisibility = 'members' | 'organization';

export type KnowledgeBaseCover = 'blue' | 'sunset';

export type KbNodeType = 'page' | 'doc_ref' | 'folder';

export type KbMemberRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface KnowledgeBaseDto {
  id: string;
  scope: 1 | 2;
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

export interface KbNodeDto {
  id: string;
  kbId: string;
  parentId: string | null;
  title: string;
  nodeType: KbNodeType;
  docId: string | null;
  docType?: string | null;
  sortOrder: number;
  isHome: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KbMemberDto {
  id: string;
  kbId: string;
  userId: string;
  displayName?: string;
  email?: string;
  role: KbMemberRole;
  createdAt: string;
}
