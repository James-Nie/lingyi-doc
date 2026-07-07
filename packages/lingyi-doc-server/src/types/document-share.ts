/** 文档分享权限级别（对标飞书五级权限） */
export type DocSharePermissionLevel = 'none' | 'read' | 'comment' | 'edit' | 'manage';

export type DocShareType = 'link' | 'member';

export type DocShareSubjectType = 'user' | 'dept' | 'group';

export type DocShareVisitStatus = 'success' | 'denied' | 'password_error' | 'expired' | 'closed';

export type DocShareAuditAction =
  | 'create'
  | 'update'
  | 'close'
  | 'add_collaborator'
  | 'remove_collaborator'
  | 'apply_join'
  | 'approve_join'
  | 'reject_join';

export const DOC_SHARE_PERMISSION_LEVELS: DocSharePermissionLevel[] = [
  'none',
  'read',
  'comment',
  'edit',
  'manage',
];

export const DOC_SHARE_PERMISSION_LABELS: Record<DocSharePermissionLevel, string> = {
  none: '禁止访问',
  read: '只读',
  comment: '可评论',
  edit: '可编辑',
  manage: '可管理',
};

export interface DocShareConfigDto {
  docId: string;
  docUrl: string | null;
  shareToken: string | null;
  shareUrl: string | null;
  memberShareToken: string | null;
  memberShareUrl: string | null;
  memberShareStatus: 'active' | 'closed';
  status: 'active' | 'closed';
  permissionLevel: DocSharePermissionLevel;
  memberPermissionLevel: DocSharePermissionLevel;
  expireTime: string | null;
  memberExpireTime: string | null;
  hasPassword: boolean;
  allowDownload: boolean;
  allowPrint: boolean;
  allowCopy: boolean;
  allowReshare: boolean;
  watermarkEnabled: boolean;
}

export interface DocShareJoinRequestDto {
  id: string;
  docId: string;
  applicantId: string;
  applicantName?: string;
  applicantEmail?: string;
  permissionLevel: DocSharePermissionLevel;
  status: 'pending' | 'approved' | 'rejected';
  message?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
}

export interface CollaboratorJoinInfoDto {
  title: string;
  docType: string;
  docUrl: string;
  permissionLevel: DocSharePermissionLevel;
  expired: boolean;
  closed: boolean;
  alreadyCollaborator: boolean;
  joinRequestStatus: 'none' | 'pending' | 'approved' | 'rejected';
}

export interface DocShareCollaboratorDto {
  id: string;
  docId: string;
  userId: string;
  displayName?: string;
  email?: string;
  permissionLevel: DocSharePermissionLevel;
  expireTime: string | null;
  createdAt: string;
}

export interface PublicShareInfoDto {
  title: string;
  docType: string;
  permissionLevel: DocSharePermissionLevel;
  requirePassword: boolean;
  expired: boolean;
  closed: boolean;
}

export interface PublicShareDocumentDto {
  title: string;
  docType: string;
  permissionLevel: DocSharePermissionLevel;
  data: unknown;
}

/** 路径访问需密码时的元信息 */
export interface DocPathAccessPendingDto {
  requirePassword: true;
  title: string;
  docType: string;
  permissionLevel: DocSharePermissionLevel;
}

export interface ShareTokenResolveDto {
  path: string;
}

export interface SharedDocumentListItemDto {
  id: string;
  title: string;
  docType: string;
  ownerId?: string | null;
  ownerName?: string | null;
  location: string;
  createdAt: number;
  updatedAt: number;
  lastVisitedAt: number;
  sharePermission: DocSharePermissionLevel;
  sharedByName?: string;
}
