import { HttpStatus, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { BusinessException } from '../../common/exceptions/business.exception';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import { DocumentShareRepository } from '../../repositories/document-share.repository';
import { DocumentCommentService } from '../document-comment/document-comment.service';
import { DocumentRepository } from '../../repositories/document.repository';
import { TenantMemberRepository } from '../../repositories/tenant-member.repository';
import { UserRepository } from '../../repositories/user.repository';
import type { DocShareEntity } from '../../database/entities/document-share.entity';
import type {
  CollaboratorJoinInfoDto,
  DocShareCollaboratorDto,
  DocShareConfigDto,
  DocShareJoinRequestDto,
  DocSharePermissionLevel,
  PublicShareDocumentDto,
  PublicShareInfoDto,
  SharedDocumentListItemDto,
  DocPathAccessPendingDto,
  ShareTokenResolveDto,
} from '../../types/document-share';
import { DOC_SHARE_PERMISSION_LEVELS } from '../../types/document-share';
import type { DocumentScope, DocumentPermission, DocumentViewMode, DocumentRecord } from '../../types/database';
import type { DocumentAccessContext } from '../../types/session';
import { documentLocation } from '../../types/session';
import { documentAccessFromAuth } from '../../utils/documentAccessContext';
import { DocPathService } from '../../services/doc-path.service';
import { StorageService } from '../../services/storage.service';
import { generateInviteToken } from '../../utils/docSlug';
import { buildDocOwnerPath } from '../../utils/docPublicPath';
import { buildDocumentRecordJson, wrapApiDataJson, type DocumentLoadHttpResult } from '../../utils/documentRecordJson';
import { computeDocumentStats, formatStorageSize } from '../../utils/documentContentStats';
import { formatAuditOperation } from '../../utils/documentInfoFormat';
import type { DocumentInfoDto } from '../../types/document-info';
import { appendBaseFormRecord } from '../../utils/appendBaseFormRecord';
import {
  assertFormViewShareEnabled,
  countPublicFormSubmissions,
  extractPublicFormSchema,
  getPublicFormSubmissionValues,
  listPublicFormSubmissions,
  listSubmissionCreatedBy,
  type PublicFormSchemaDto,
  type PublicFormSubmissionSummaryDto,
} from '../../utils/publicFormSchema';
import { OssService } from '../../services/oss.service';

function generateShareToken(): string {
  return generateInviteToken();
}

function isShareExpired(share: DocShareEntity): boolean {
  if (!share.expireTime) return false;
  return share.expireTime.getTime() <= Date.now();
}

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

/** 分享给他人时允许的权限（不含 manage，管理权仅拥有者） */
const SHAREE_PERMISSION_LEVELS: DocSharePermissionLevel[] = ['read', 'comment', 'edit'];

const PERMISSION_RANK: Record<DocSharePermissionLevel, number> = {
  none: 0,
  read: 1,
  comment: 2,
  edit: 3,
  manage: 4,
};

function assertPermissionLevel(level: string): DocSharePermissionLevel {
  if (!DOC_SHARE_PERMISSION_LEVELS.includes(level as DocSharePermissionLevel)) {
    throw new BusinessException(100002, '无效的权限级别');
  }
  if (level === 'none' || level === 'manage') {
    throw new BusinessException(100002, '被分享者不支持该权限级别');
  }
  if (!SHAREE_PERMISSION_LEVELS.includes(level as DocSharePermissionLevel)) {
    throw new BusinessException(100002, '无效的权限级别');
  }
  return level as DocSharePermissionLevel;
}

/** 链接/历史 manage 降为可编辑，保证写入协作者表合法 */
function toShareePermissionLevel(level: string): DocSharePermissionLevel {
  if (level === 'manage' || level === 'edit') return 'edit';
  if (level === 'comment') return 'comment';
  return 'read';
}

function shareLevelToAccess(level: DocSharePermissionLevel): {
  permission: DocumentPermission;
  canEdit: boolean;
  viewMode: DocumentViewMode;
} {
  if (level === 'edit' || level === 'manage') {
    return {
      permission: level,
      canEdit: true,
      viewMode: 'edit',
    };
  }
  if (level === 'comment') {
    return { permission: 'comment', canEdit: false, viewMode: 'preview' };
  }
  return { permission: 'read', canEdit: false, viewMode: 'preview' };
}

@Injectable()
export class DocumentShareService {
  constructor(
    private readonly shareRepository: DocumentShareRepository,
    private readonly documentRepository: DocumentRepository,
    private readonly tenantMemberRepository: TenantMemberRepository,
    private readonly userRepository: UserRepository,
    private readonly docPathService: DocPathService,
    private readonly storageService: StorageService,
    private readonly commentService: DocumentCommentService,
    private readonly ossService: OssService,
  ) {}

  private ctx(auth: AuthUser): DocumentAccessContext {
    return documentAccessFromAuth(auth);
  }

  private async buildPathContext(docId: string) {
    return this.docPathService.resolvePathByDocId(docId);
  }

  private async toConfigDto(
    linkShare: DocShareEntity | null,
    memberShare: DocShareEntity | null,
    docId: string,
  ): Promise<DocShareConfigDto> {
    const pathCtx = await this.buildPathContext(docId);
    const docUrl = pathCtx ? this.docPathService.buildOwnerPath(pathCtx) : null;

    const linkActive = !!linkShare && linkShare.status === true;
    const memberActive = !!memberShare && memberShare.status === true;

    return {
      docId,
      docUrl,
      shareToken: linkShare?.shareToken ?? null,
      shareUrl: linkActive && pathCtx
        ? this.docPathService.buildPublicLinkJoinUrl(pathCtx, linkShare!.shareToken, pathCtx.title)
        : null,
      memberShareToken: memberShare?.shareToken ?? null,
      memberShareUrl: memberActive && pathCtx
        ? this.docPathService.buildCollaboratorJoinUrl(pathCtx, memberShare!.shareToken, pathCtx.title)
        : null,
      memberShareStatus: memberActive ? 'active' : 'closed',
      status: linkActive ? 'active' : 'closed',
      permissionLevel: (linkShare?.permissionLevel as DocSharePermissionLevel) ?? 'read',
      memberPermissionLevel: (memberShare?.permissionLevel as DocSharePermissionLevel) ?? 'read',
      expireTime: toIso(linkShare?.expireTime),
      memberExpireTime: toIso(memberShare?.expireTime),
      hasPassword: !!linkShare?.passwordHash,
      allowDownload: linkShare?.allowDownload !== false,
      allowPrint: linkShare?.allowPrint !== false,
      allowCopy: linkShare?.allowCopy !== false,
      allowReshare: linkShare?.allowReshare === true,
      watermarkEnabled: linkShare?.watermarkEnabled === true,
    };
  }

  private async requireManageableDoc(auth: AuthUser, docId: string) {
    const doc = await this.documentRepository.findOwnedById(docId, this.ctx(auth));
    if (!doc) {
      throw new BusinessException(100004, '文档不存在', HttpStatus.NOT_FOUND);
    }
    return doc;
  }

  async getShareConfig(auth: AuthUser, docId: string): Promise<DocShareConfigDto> {
    await this.requireManageableDoc(auth, docId);
    const [linkShare, memberShare] = await Promise.all([
      this.shareRepository.findByDocId(docId),
      this.shareRepository.findMemberShareByDocId(docId),
    ]);
    return this.toConfigDto(linkShare, memberShare, docId);
  }

  async upsertShare(
    auth: AuthUser,
    docId: string,
    input: {
      permissionLevel: string;
      expireTime?: string | null;
      password?: string | null;
      clearPassword?: boolean;
      allowDownload?: boolean;
      allowPrint?: boolean;
      allowCopy?: boolean;
      allowReshare?: boolean;
      watermarkEnabled?: boolean;
    },
    operatorIp?: string | null,
  ): Promise<DocShareConfigDto> {
    await this.requireManageableDoc(auth, docId);
    const permissionLevel = assertPermissionLevel(input.permissionLevel);

    const existing = await this.shareRepository.findByDocId(docId);
    const shareToken = existing?.shareToken ?? generateShareToken();

    let passwordHash: string | null | undefined = existing?.passwordHash ?? null;
    if (input.clearPassword) {
      passwordHash = null;
    } else if (typeof input.password === 'string' && input.password.length > 0) {
      passwordHash = await bcrypt.hash(input.password, 12);
    }

    const expireTime = input.expireTime ? new Date(input.expireTime) : null;
    if (expireTime && Number.isNaN(expireTime.getTime())) {
      throw new BusinessException(100002, '无效的过期时间');
    }

    const saved = await this.shareRepository.upsertShare({
      docId,
      shareType: 'link',
      shareToken,
      permissionLevel,
      expireTime,
      passwordHash,
      allowDownload: input.allowDownload ?? true,
      allowPrint: input.allowPrint ?? true,
      allowCopy: input.allowCopy ?? true,
      allowReshare: input.allowReshare ?? false,
      watermarkEnabled: input.watermarkEnabled ?? false,
      operatorId: auth.userId,
    });

    await this.shareRepository.appendAuditLog({
      docId,
      operatorId: auth.userId,
      operatorIp,
      action: existing ? 'update' : 'create',
      beforeJson: existing ? {
        permissionLevel: existing.permissionLevel,
        expireTime: toIso(existing.expireTime),
        status: existing.status,
      } : null,
      afterJson: {
        permissionLevel: saved.permissionLevel,
        expireTime: toIso(saved.expireTime),
        status: saved.status,
      },
    });

    const memberShare = await this.shareRepository.findMemberShareByDocId(docId);
    return this.toConfigDto(saved, memberShare, docId);
  }

  async upsertMemberShare(
    auth: AuthUser,
    docId: string,
    input: {
      permissionLevel: string;
      expireTime?: string | null;
    },
    operatorIp?: string | null,
  ): Promise<DocShareConfigDto> {
    await this.requireManageableDoc(auth, docId);
    const permissionLevel = assertPermissionLevel(input.permissionLevel);

    const existing = await this.shareRepository.findMemberShareByDocId(docId);
    const shareToken = existing?.shareToken ?? generateShareToken();

    const expireTime = input.expireTime ? new Date(input.expireTime) : null;
    if (expireTime && Number.isNaN(expireTime.getTime())) {
      throw new BusinessException(100002, '无效的过期时间');
    }

    const saved = await this.shareRepository.upsertShare({
      docId,
      shareType: 'member',
      shareToken,
      permissionLevel,
      expireTime,
      passwordHash: null,
      allowDownload: true,
      allowPrint: true,
      allowCopy: true,
      allowReshare: false,
      watermarkEnabled: false,
      operatorId: auth.userId,
    });

    await this.shareRepository.appendAuditLog({
      docId,
      operatorId: auth.userId,
      operatorIp,
      action: existing ? 'update' : 'create',
      afterJson: { shareType: 'member', permissionLevel: saved.permissionLevel },
    });

    const linkShare = await this.shareRepository.findByDocId(docId);
    return this.toConfigDto(linkShare, saved, docId);
  }

  async closeMemberShare(auth: AuthUser, docId: string, operatorIp?: string | null): Promise<{ docId: string; status: 'closed' }> {
    await this.requireManageableDoc(auth, docId);
    const ok = await this.shareRepository.closeShare(docId, auth.userId, 'member');
    if (!ok) {
      throw new BusinessException(100004, '成员分享未开启', HttpStatus.NOT_FOUND);
    }

    await this.shareRepository.appendAuditLog({
      docId,
      operatorId: auth.userId,
      operatorIp,
      action: 'close',
      afterJson: { shareType: 'member', status: 0 },
    });

    return { docId, status: 'closed' };
  }

  async closeShare(auth: AuthUser, docId: string, operatorIp?: string | null): Promise<{ docId: string; status: 'closed' }> {
    await this.requireManageableDoc(auth, docId);
    const existing = await this.shareRepository.findByDocId(docId);
    const ok = await this.shareRepository.closeShare(docId, auth.userId, 'link');
    if (!ok) {
      throw new BusinessException(100004, '分享配置不存在', HttpStatus.NOT_FOUND);
    }

    await this.shareRepository.appendAuditLog({
      docId,
      operatorId: auth.userId,
      operatorIp,
      action: 'close',
      beforeJson: existing ? { status: existing.status } : null,
      afterJson: { status: 0 },
    });

    return { docId, status: 'closed' };
  }

  async listCollaborators(auth: AuthUser, docId: string): Promise<{ items: DocShareCollaboratorDto[]; total: number }> {
    await this.requireManageableDoc(auth, docId);
    const rows = await this.shareRepository.listCollaborators(docId);
    const items = rows.map(row => ({
      id: row.id,
      docId: row.docId,
      userId: row.subjectId,
      displayName: row.displayName ?? undefined,
      email: row.email ?? undefined,
      permissionLevel: row.permissionLevel as DocSharePermissionLevel,
      expireTime: toIso(row.expireTime),
      createdAt: row.createdAt.toISOString(),
    }));
    return { items, total: items.length };
  }

  async addCollaborator(
    auth: AuthUser,
    docId: string,
    input: { userId: string; permissionLevel: string },
    operatorIp?: string | null,
  ): Promise<DocShareCollaboratorDto> {
    const doc = await this.requireManageableDoc(auth, docId);
    const permissionLevel = assertPermissionLevel(input.permissionLevel);
    if (!input.userId) throw new BusinessException(100002, '用户 ID 不能为空');
    if (input.userId === auth.userId) {
      throw new BusinessException(100002, '不能添加自己为协作者');
    }

    if (doc.scope === 2 && doc.tenantId) {
      const isMember = await this.tenantMemberRepository.isActiveMember(input.userId, doc.tenantId);
      if (!isMember) throw new BusinessException(100002, '只能添加租户内成员');
    } else {
      const user = await this.userRepository.findById(input.userId);
      if (!user) throw new BusinessException(100004, '用户不存在', HttpStatus.NOT_FOUND);
    }

    const saved = await this.shareRepository.addCollaborator({
      docId,
      userId: input.userId,
      permissionLevel,
      grantedBy: auth.userId,
    });

    await this.shareRepository.appendAuditLog({
      docId,
      operatorId: auth.userId,
      operatorIp,
      action: 'add_collaborator',
      afterJson: { userId: input.userId, permissionLevel },
    });

    const user = await this.userRepository.findById(input.userId);
    return {
      id: saved.id,
      docId,
      userId: input.userId,
      displayName: user?.display_name ?? undefined,
      email: user?.email ?? undefined,
      permissionLevel,
      expireTime: toIso(saved.expireTime),
      createdAt: saved.createdAt.toISOString(),
    };
  }

  async searchUsersForCollaborator(
    auth: AuthUser,
    docId: string,
    keyword: string,
  ): Promise<{ items: Array<{ userId: string; displayName: string; email: string; phone: string | null }> }> {
    const doc = await this.requireManageableDoc(auth, docId);
    const q = keyword.trim();
    if (q.length < 2) return { items: [] };

    const existing = new Set(
      (await this.shareRepository.listCollaborators(docId)).map(row => row.subjectId),
    );
    existing.add(auth.userId);
    if (doc.ownerId) existing.add(doc.ownerId);

    if (doc.scope === 2 && doc.tenantId) {
      const members = await this.tenantMemberRepository.listByTenant(doc.tenantId);
      const needle = q.toLowerCase();
      const items = members
        .filter(m => (m.status ?? 1) === 1 && !existing.has(m.userId))
        .filter(m =>
          (m.displayName || '').toLowerCase().includes(needle)
          || (m.email || '').toLowerCase().includes(needle)
          || (m.phone || '').toLowerCase().includes(needle),
        )
        .slice(0, 20)
        .map(m => ({
          userId: m.userId,
          displayName: m.displayName || m.email,
          email: m.email,
          phone: m.phone ?? null,
        }));
      return { items };
    }

    const users = await this.userRepository.searchPublic(q, 20);
    return {
      items: users
        .filter(u => !existing.has(u.id))
        .map(u => ({
          userId: u.id,
          displayName: u.display_name,
          email: u.email,
          phone: u.phone ?? null,
        })),
    };
  }

  async removeCollaborator(
    auth: AuthUser,
    docId: string,
    userId: string,
    operatorIp?: string | null,
  ): Promise<{ userId: string }> {
    await this.requireManageableDoc(auth, docId);
    const ok = await this.shareRepository.removeCollaborator(docId, userId);
    if (!ok) throw new BusinessException(100004, '协作者不存在', HttpStatus.NOT_FOUND);

    await this.shareRepository.appendAuditLog({
      docId,
      operatorId: auth.userId,
      operatorIp,
      action: 'remove_collaborator',
      beforeJson: { userId },
    });

    return { userId };
  }

  async listSharedWithMe(
    auth: AuthUser,
    sortBy: 'lastVisited' | 'created' | 'updated' = 'lastVisited',
  ): Promise<{ items: SharedDocumentListItemDto[]; total: number }> {
    // 历史数据回填（clearInheritedLinkExpire / backfillCollaborators）已移出热路径，
    // 避免每次打开「与我共享」都扫 visit_log + N+1 写协作者。
    const rows = await this.shareRepository.listSharedWithUser(auth.userId, sortBy);
    const toMs = (value: Date | string | number | null | undefined, fallback: number): number => {
      if (value instanceof Date) return value.getTime();
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const ms = new Date(value).getTime();
        return Number.isFinite(ms) ? ms : fallback;
      }
      return fallback;
    };
    const items = rows.map(row => {
      const updatedAt = toMs(row.updatedAt, Date.now());
      const createdAt = toMs(row.createdAt, updatedAt);
      const lastVisitedAt = toMs(row.lastVisitedAt, updatedAt);
      const scope = (row.scope ?? 1) as DocumentScope;
      return {
        id: row.id,
        title: row.title || '未命名文档',
        docType: row.docType || 'richtext',
        ownerId: row.ownerId,
        ownerName: row.ownerName ?? '—',
        location: documentLocation(scope, row.tenantName),
        createdAt,
        updatedAt,
        lastVisitedAt,
        docSlug: row.docSlug ?? null,
        spaceSlug: row.spaceSlug ?? null,
        bookSlug: row.bookSlug ?? null,
        sharePermission: toShareePermissionLevel(row.sharePermission || 'read'),
        sharedByName: row.sharedByName ?? undefined,
      };
    }).filter(item => !!item.id);
    return { items, total: items.length };
  }

  private async loadShareForPublic(token: string): Promise<DocShareEntity> {
    const share = await this.shareRepository.findByToken(token);
    if (!share || share.shareType !== 'link') {
      throw new BusinessException(100004, '分享链接不存在', HttpStatus.NOT_FOUND);
    }
    return share;
  }

  /** 表单填写/提交：链接分享与成员分享 token 均可 */
  private async loadShareForFormAccess(token: string): Promise<DocShareEntity> {
    const share = await this.shareRepository.findByToken(token);
    if (!share || (share.shareType !== 'link' && share.shareType !== 'member')) {
      throw new BusinessException(100004, '分享链接不存在', HttpStatus.NOT_FOUND);
    }
    return share;
  }

  private async loadMemberShare(token: string, docId: string): Promise<DocShareEntity> {
    const share = await this.shareRepository.findByToken(token);
    if (!share || share.shareType !== 'member' || share.docId !== docId) {
      throw new BusinessException(100004, '分享链接无效', HttpStatus.NOT_FOUND);
    }
    return share;
  }

  async getPublicShareInfo(token: string, visitorIp?: string | null): Promise<PublicShareInfoDto> {
    const share = await this.loadShareForPublic(token);
    const doc = await this.documentRepository.findById(share.docId);

    if (!doc) {
      await this.shareRepository.appendVisitLog({
        docId: share.docId,
        shareToken: token,
        visitorIp,
        visitStatus: 'denied',
        operateContent: 'document_not_found',
      });
      throw new BusinessException(100004, '文档不存在', HttpStatus.NOT_FOUND);
    }

    const closed = share.status !== true;
    const expired = isShareExpired(share);

    if (closed) {
      await this.shareRepository.appendVisitLog({
        docId: share.docId,
        shareToken: token,
        visitorIp,
        visitStatus: 'closed',
      });
    } else if (expired) {
      await this.shareRepository.appendVisitLog({
        docId: share.docId,
        shareToken: token,
        visitorIp,
        visitStatus: 'expired',
      });
    }

    return {
      title: doc.title,
      docType: doc.docType,
      permissionLevel: share.permissionLevel as DocSharePermissionLevel,
      requirePassword: !!share.passwordHash,
      expired,
      closed,
    };
  }

  async verifyPublicShare(
    token: string,
    password: string | undefined,
    visitorIp?: string | null,
    deviceInfo?: string | null,
    userId?: string | null,
  ): Promise<PublicShareDocumentDto> {
    const share = await this.loadShareForPublic(token);

    if (share.status !== true) {
      await this.shareRepository.appendVisitLog({
        docId: share.docId,
        shareToken: token,
        visitorId: userId ?? null,
        visitorIp,
        deviceInfo,
        visitStatus: 'closed',
      });
      throw new BusinessException(100403, '分享已关闭', HttpStatus.GONE);
    }

    if (isShareExpired(share)) {
      await this.shareRepository.appendVisitLog({
        docId: share.docId,
        shareToken: token,
        visitorId: userId ?? null,
        visitorIp,
        deviceInfo,
        visitStatus: 'expired',
      });
      throw new BusinessException(100403, '分享链接已过期', HttpStatus.GONE);
    }

    if (share.passwordHash) {
      const valid = password ? await bcrypt.compare(password, share.passwordHash) : false;
      if (!valid) {
        await this.shareRepository.appendVisitLog({
          docId: share.docId,
          shareToken: token,
          visitorId: userId ?? null,
          visitorIp,
          deviceInfo,
          visitStatus: 'password_error',
        });
        throw new BusinessException(100401, '访问密码错误', HttpStatus.UNAUTHORIZED);
      }
    }

    const doc = await this.documentRepository.findById(share.docId);
    if (!doc) {
      await this.shareRepository.appendVisitLog({
        docId: share.docId,
        shareToken: token,
        visitorId: userId ?? null,
        visitorIp,
        deviceInfo,
        visitStatus: 'denied',
      });
      throw new BusinessException(100004, '文档不存在', HttpStatus.NOT_FOUND);
    }

    await this.shareRepository.appendVisitLog({
      docId: share.docId,
      shareToken: token,
      visitorId: userId ?? null,
      visitorIp,
      deviceInfo,
      visitStatus: 'success',
    });

    if (userId && userId !== doc.ownerId) {
      await this.grantCollaboratorFromInviteLink({
        docId: share.docId,
        userId,
        permissionLevel: share.permissionLevel as DocSharePermissionLevel,
        grantedBy: share.createdBy || doc.ownerId || userId,
        expireTime: null,
      });
    }

    return {
      title: doc.title,
      docType: doc.docType,
      permissionLevel: share.permissionLevel as DocSharePermissionLevel,
      data: doc.data,
    };
  }

  async resolveDocByPath(spaceSlug: string, bookSlug: string, docSlug: string) {
    const ctx = await this.docPathService.resolveDocIdByPath(spaceSlug, bookSlug, docSlug);
    if (!ctx) {
      throw new BusinessException(100004, '文档不存在', HttpStatus.NOT_FOUND);
    }
    return ctx;
  }

  /** 按 docId 解析 canonical 路径（需有文档访问权限） */
  async resolvePathForUser(user: AuthUser, docId: string) {
    const accessCtx = this.ctx(user);
    const doc = await this.storageService.loadDocumentForUser(docId, accessCtx);
    if (!doc) {
      throw new BusinessException(200001, '文档不存在', HttpStatus.NOT_FOUND);
    }
    const pathCtx = await this.buildPathContext(docId);
    if (!pathCtx) {
      throw new BusinessException(100005, '无法解析文档路径', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return pathCtx;
  }

  /** 旧版 /share/:token 兼容：解析为 canonical 路径 */
  async resolveShareTokenPath(token: string): Promise<ShareTokenResolveDto> {
    const share = await this.loadShareForPublic(token);
    const pathCtx = await this.docPathService.resolvePathByDocId(share.docId);
    if (!pathCtx) {
      throw new BusinessException(100004, '文档不存在', HttpStatus.NOT_FOUND);
    }
    const base = buildDocOwnerPath(pathCtx);
    const params = new URLSearchParams({ token, source: 'doc_link' });
    return { path: `${base}?${params.toString()}` };
  }

  /**
   * 按路径加载文档：已登录用户走协作者/拥有者权限；匿名或未授权用户可凭 link token 访问。
   */
  async loadDocumentByPath(
    spaceSlug: string,
    bookSlug: string,
    docSlug: string,
    options: {
      auth?: AuthUser | null;
      token?: string | null;
      password?: string | null;
      visitorIp?: string | null;
      deviceInfo?: string | null;
    },
  ): Promise<DocumentLoadHttpResult> {
    const pathCtx = await this.docPathService.resolveDocIdByPath(spaceSlug, bookSlug, docSlug);
    if (!pathCtx) {
      throw new BusinessException(100004, '文档不存在', HttpStatus.NOT_FOUND);
    }

    if (options.auth) {
      const accessCtx = documentAccessFromAuth(options.auth);
      const body = await this.storageService.loadDocumentWrappedJson(pathCtx.docId, accessCtx);
      if (body) {
        await this.storageService.touchLastVisitedUnchecked(pathCtx.docId, accessCtx.userId);
        return { type: 'raw', body };
      }
    }

    if (options.token) {
      return this.loadDocumentViaPublicToken(pathCtx.docId, options.token, {
        password: options.password,
        visitorIp: options.visitorIp,
        deviceInfo: options.deviceInfo,
        userId: options.auth?.userId ?? null,
      });
    }

    if (options.auth) {
      throw new BusinessException(100403, '无权访问此文档', HttpStatus.FORBIDDEN);
    }
    throw new BusinessException(110001, '请先登录', HttpStatus.UNAUTHORIZED);
  }

  private async loadDocumentViaPublicToken(
    docId: string,
    token: string,
    options: {
      password?: string | null;
      visitorIp?: string | null;
      deviceInfo?: string | null;
      userId?: string | null;
    },
  ): Promise<DocumentLoadHttpResult> {
    // 表单分享可能使用 link / member 两类 token
    const share = await this.loadShareForFormAccess(token);
    if (share.docId !== docId) {
      throw new BusinessException(100403, '分享链接无效', HttpStatus.FORBIDDEN);
    }

    if (share.status !== true) {
      await this.shareRepository.appendVisitLog({
        docId,
        shareToken: token,
        visitorId: options.userId ?? null,
        visitorIp: options.visitorIp ?? null,
        deviceInfo: options.deviceInfo ?? null,
        visitStatus: 'closed',
      });
      throw new BusinessException(100403, '分享已关闭', HttpStatus.GONE);
    }

    if (isShareExpired(share)) {
      await this.shareRepository.appendVisitLog({
        docId,
        shareToken: token,
        visitorId: options.userId ?? null,
        visitorIp: options.visitorIp ?? null,
        deviceInfo: options.deviceInfo ?? null,
        visitStatus: 'expired',
      });
      throw new BusinessException(100403, '分享链接已过期', HttpStatus.GONE);
    }

    const row = await this.documentRepository.findByIdWithRawContent(docId);
    if (!row) {
      throw new BusinessException(100004, '文档不存在', HttpStatus.NOT_FOUND);
    }

    const level = share.permissionLevel as DocSharePermissionLevel;

    if (share.passwordHash && !options.password) {
      return {
        type: 'data',
        data: {
          requirePassword: true,
          title: row.meta.title,
          docType: row.meta.docType,
          permissionLevel: level,
        },
      };
    }

    if (share.passwordHash) {
      const valid = options.password
        ? await bcrypt.compare(options.password, share.passwordHash)
        : false;
      if (!valid) {
        await this.shareRepository.appendVisitLog({
          docId,
          shareToken: token,
          visitorId: options.userId ?? null,
          visitorIp: options.visitorIp ?? null,
          deviceInfo: options.deviceInfo ?? null,
          visitStatus: 'password_error',
        });
        throw new BusinessException(100403, '访问密码错误', HttpStatus.FORBIDDEN);
      }
    }

    await this.shareRepository.appendVisitLog({
      docId,
      shareToken: token,
      visitorId: options.userId ?? null,
      visitorIp: options.visitorIp ?? null,
      deviceInfo: options.deviceInfo ?? null,
      visitStatus: 'success',
    });

    if (options.userId) {
      await this.documentRepository.upsertUserVisit(docId, options.userId);
    }

    // 已登录用户通过邀请链接打开后，写入协作者，便于「与我共享」列表与后续无 token 访问。
    // 链接过期只约束「能否新开链接」；一旦成为协作者，其权限由协作者记录独立管理（不继承链接过期时间）。
    if (options.userId && options.userId !== row.meta.ownerId) {
      await this.grantCollaboratorFromInviteLink({
        docId,
        userId: options.userId,
        permissionLevel: level,
        grantedBy: share.createdBy || row.meta.ownerId || options.userId,
        expireTime: null,
      });
    }

    const access = shareLevelToAccess(level);
    const body = wrapApiDataJson(
      buildDocumentRecordJson({ ...row.meta, ...access }, row.contentJsonRaw),
    );
    return { type: 'raw', body };
  }

  /** 通过邀请链接获得访问权时写入/升级协作者（不降级已有更高权限） */
  private async grantCollaboratorFromInviteLink(input: {
    docId: string;
    userId: string;
    permissionLevel: DocSharePermissionLevel;
    grantedBy: string;
    expireTime?: Date | null;
  }): Promise<void> {
    const nextLevel = toShareePermissionLevel(input.permissionLevel);
    const existing = await this.shareRepository.findCollaborator(input.docId, input.userId);
    if (existing && existing.permissionLevel !== 'none') {
      const current = existing.permissionLevel as DocSharePermissionLevel;
      const expired = !!(existing.expireTime && existing.expireTime.getTime() <= Date.now());
      const hasLinkExpireCopied = existing.expireTime != null;
      const needUpgrade = (PERMISSION_RANK[current] ?? 0) < (PERMISSION_RANK[nextLevel] ?? 0);
      // 已有更高/同等权限且未过期、且无残留链接过期时间时跳过
      if (!expired && !needUpgrade && !hasLinkExpireCopied) {
        return;
      }
    }
    await this.shareRepository.addCollaborator({
      docId: input.docId,
      userId: input.userId,
      permissionLevel: nextLevel,
      grantedBy: input.grantedBy,
      // 邀请链接过期时间不写入协作者；否则会出现「能打开编辑却无法保存」
      expireTime: null,
    });
  }

  async getCollaboratorJoinInfo(
    spaceSlug: string,
    bookSlug: string,
    docSlug: string,
    token: string,
    auth?: AuthUser | null,
  ): Promise<CollaboratorJoinInfoDto> {
    const pathCtx = await this.docPathService.resolveDocIdByPath(spaceSlug, bookSlug, docSlug);
    if (!pathCtx) {
      throw new BusinessException(100004, '文档不存在', HttpStatus.NOT_FOUND);
    }

    const share = await this.loadMemberShare(token, pathCtx.docId);
    const doc = await this.documentRepository.findById(pathCtx.docId);
    if (!doc) {
      throw new BusinessException(100004, '文档不存在', HttpStatus.NOT_FOUND);
    }

    const closed = share.status !== true;
    const expired = isShareExpired(share);
    const docUrl = this.docPathService.buildOwnerPath(pathCtx);

    let alreadyCollaborator = false;
    let joinRequestStatus: CollaboratorJoinInfoDto['joinRequestStatus'] = 'none';

    if (auth) {
      const collab = await this.shareRepository.findCollaborator(pathCtx.docId, auth.userId);
      alreadyCollaborator = !!collab && collab.permissionLevel !== 'none';
      if (!alreadyCollaborator) {
        const pending = await this.shareRepository.findJoinRequest(pathCtx.docId, auth.userId, 'pending');
        if (pending) joinRequestStatus = 'pending';
        else {
          const approved = await this.shareRepository.findJoinRequest(pathCtx.docId, auth.userId, 'approved');
          if (approved) joinRequestStatus = 'approved';
          else {
            const rejected = await this.shareRepository.findJoinRequest(pathCtx.docId, auth.userId, 'rejected');
            if (rejected) joinRequestStatus = 'rejected';
          }
        }
      }
    }

    return {
      title: doc.title,
      docType: doc.docType,
      docUrl,
      permissionLevel: share.permissionLevel as DocSharePermissionLevel,
      expired,
      closed,
      alreadyCollaborator,
      joinRequestStatus,
    };
  }

  async applyCollaboratorJoin(
    auth: AuthUser,
    spaceSlug: string,
    bookSlug: string,
    docSlug: string,
    token: string,
    message?: string | null,
  ): Promise<{ status: 'pending' | 'approved'; docUrl: string }> {
    const info = await this.getCollaboratorJoinInfo(spaceSlug, bookSlug, docSlug, token, auth);
    if (info.closed) throw new BusinessException(100403, '分享已关闭', HttpStatus.GONE);
    if (info.expired) throw new BusinessException(100403, '分享链接已过期', HttpStatus.GONE);
    if (info.alreadyCollaborator || info.joinRequestStatus === 'approved') {
      return { status: 'approved', docUrl: info.docUrl };
    }
    if (info.joinRequestStatus === 'pending') {
      return { status: 'pending', docUrl: info.docUrl };
    }

    const pathCtx = await this.docPathService.resolveDocIdByPath(spaceSlug, bookSlug, docSlug);
    if (!pathCtx) throw new BusinessException(100004, '文档不存在', HttpStatus.NOT_FOUND);

    const share = await this.loadMemberShare(token, pathCtx.docId);
    const doc = await this.documentRepository.findById(pathCtx.docId);
    if (doc?.ownerId === auth.userId) {
      throw new BusinessException(100002, '不能申请加入自己的文档');
    }

    await this.shareRepository.createJoinRequest({
      docId: pathCtx.docId,
      applicantId: auth.userId,
      permissionLevel: share.permissionLevel as DocSharePermissionLevel,
      message: message ?? null,
    });

    await this.shareRepository.appendAuditLog({
      docId: pathCtx.docId,
      operatorId: auth.userId,
      action: 'apply_join',
      afterJson: { applicantId: auth.userId },
    });

    return { status: 'pending', docUrl: info.docUrl };
  }

  async listJoinRequests(
    auth: AuthUser,
    docId: string,
  ): Promise<{ items: DocShareJoinRequestDto[]; total: number }> {
    await this.requireManageableDoc(auth, docId);
    const rows = await this.shareRepository.listJoinRequests(docId, 'pending');
    const items = rows.map(row => ({
      id: row.id,
      docId: row.docId,
      applicantId: row.applicantId,
      applicantName: row.applicantName ?? undefined,
      applicantEmail: row.applicantEmail ?? undefined,
      permissionLevel: row.permissionLevel as DocSharePermissionLevel,
      status: row.status as DocShareJoinRequestDto['status'],
      message: row.message,
      createdAt: row.createdAt.toISOString(),
      reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    }));
    return { items, total: items.length };
  }

  async approveJoinRequest(
    auth: AuthUser,
    docId: string,
    requestId: string,
    operatorIp?: string | null,
  ): Promise<{ requestId: string; status: 'approved'; docUrl: string | null }> {
    await this.requireManageableDoc(auth, docId);
    const rows = await this.shareRepository.listJoinRequests(docId, 'pending');
    const target = rows.find(row => row.id === requestId);
    if (!target) {
      throw new BusinessException(100004, '申请不存在', HttpStatus.NOT_FOUND);
    }

    const updated = await this.shareRepository.updateJoinRequestStatus({
      requestId,
      status: 'approved',
      reviewedBy: auth.userId,
    });
    if (!updated) {
      throw new BusinessException(100005, '审核失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const rawLevel = target.permissionLevel as DocSharePermissionLevel;
    const joinLevel: DocSharePermissionLevel = SHAREE_PERMISSION_LEVELS.includes(rawLevel)
      ? rawLevel
      : rawLevel === 'manage'
        ? 'edit'
        : 'read';

    await this.shareRepository.addCollaborator({
      docId,
      userId: target.applicantId,
      permissionLevel: joinLevel,
      grantedBy: auth.userId,
    });

    await this.shareRepository.appendAuditLog({
      docId,
      operatorId: auth.userId,
      operatorIp,
      action: 'approve_join',
      afterJson: { requestId, applicantId: target.applicantId, permissionLevel: joinLevel },
    });

    const pathCtx = await this.buildPathContext(docId);
    return {
      requestId,
      status: 'approved',
      docUrl: pathCtx ? this.docPathService.buildOwnerPath(pathCtx) : null,
    };
  }

  async rejectJoinRequest(
    auth: AuthUser,
    docId: string,
    requestId: string,
    operatorIp?: string | null,
  ): Promise<{ requestId: string; status: 'rejected' }> {
    await this.requireManageableDoc(auth, docId);
    const updated = await this.shareRepository.updateJoinRequestStatus({
      requestId,
      status: 'rejected',
      reviewedBy: auth.userId,
    });
    if (!updated || updated.docId !== docId || updated.status !== 'rejected') {
      throw new BusinessException(100004, '申请不存在', HttpStatus.NOT_FOUND);
    }

    await this.shareRepository.appendAuditLog({
      docId,
      operatorId: auth.userId,
      operatorIp,
      action: 'reject_join',
      afterJson: { requestId, applicantId: updated.applicantId },
    });

    return { requestId, status: 'rejected' };
  }

  async logDocumentEditorVisit(docId: string, userId: string, visitorIp?: string | null): Promise<void> {
    await this.shareRepository.appendVisitLog({
      docId,
      shareToken: null,
      visitorId: userId,
      visitorIp: visitorIp ?? null,
      visitStatus: 'success',
      operateContent: 'editor_open',
    });
  }

  async logDocumentOperationAudit(
    docId: string,
    operatorId: string,
    action: string,
    operatorIp?: string | null,
  ): Promise<void> {
    await this.shareRepository.appendAuditLog({
      docId,
      operatorId,
      operatorIp: operatorIp ?? null,
      action,
    });
  }

  async getDocumentInfo(auth: AuthUser, docId: string): Promise<DocumentInfoDto> {
    const ctx = documentAccessFromAuth(auth);
    const meta = await this.documentRepository.findInfoMeta(docId, ctx);
    if (!meta) {
      throw new BusinessException(200001, '文档不存在', HttpStatus.NOT_FOUND);
    }

    const ownerName = meta.ownerName || '未知用户';
    const owner = {
      id: meta.ownerId,
      displayName: ownerName,
      email: meta.ownerEmail,
    };

    const stats = await computeDocumentStats(
      meta.data,
      meta.docType,
      this.ossService.isEnabled()
        ? (objectKey) => this.ossService.headObjectSize(objectKey)
        : undefined,
    );
    const visitStats = await this.shareRepository.getVisitStats(docId);
    const commentCount = await this.commentService.count(docId);
    const visitRecords = await this.shareRepository.listVisitRecords(docId);
    const auditRows = await this.shareRepository.listAuditLogs(docId);
    const operationRecords = auditRows.map(row => formatAuditOperation(row));

    return {
      docId: meta.id,
      title: meta.title,
      overview: {
        owner,
        creator: owner,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
      },
      documentStats: {
        wordCount: stats.wordCount,
        charCount: stats.charCount,
        sizeBytes: stats.totalBytes,
        sizeLabel: formatStorageSize(stats.totalBytes),
      },
      interaction: {
        visitorCount: visitStats.visitorCount,
        visitCount: visitStats.visitCount,
        todayNewVisits: visitStats.todayNewVisits,
        likeCount: 0,
        commentCount,
      },
      visitRecords: visitRecords.map(row => ({
        visitorId: row.visitorId,
        displayName: row.displayName,
        email: row.email,
        lastVisitedAt: row.lastVisitedAt.getTime(),
        visitCount: row.visitCount,
      })),
      operationRecords,
      visitStatsSince: '2021年10月22日',
      privacy: {
        showMyVisitRecord: true,
        showOthersVisitRecord: true,
      },
    };
  }

  /**
   * 表单分享统一鉴权：强制校验 token，不因登录有文档权限而跳过。
   * 需要密码且未提供时返回 requirePassword pending。
   */
  private async assertFormShareAccess(params: {
    spaceSlug: string;
    bookSlug: string;
    docSlug: string;
    token: string;
    password?: string | null;
    sheetId: string;
    viewId: string;
    visitorIp?: string | null;
    deviceInfo?: string | null;
    userId?: string | null;
  }): Promise<
    | { pending: DocPathAccessPendingDto }
    | { docId: string; docData: unknown; shareToken: string; docTitle: string; docType: string }
  > {
    const token = params.token?.trim() ?? '';
    if (!token) {
      throw new BusinessException(100002, '缺少分享 token', HttpStatus.BAD_REQUEST);
    }
    if (!params.sheetId || !params.viewId) {
      throw new BusinessException(100002, '缺少表单参数', HttpStatus.BAD_REQUEST);
    }

    const pathCtx = await this.docPathService.resolveDocIdByPath(
      params.spaceSlug,
      params.bookSlug,
      params.docSlug,
    );
    if (!pathCtx) {
      throw new BusinessException(100004, '文档不存在', HttpStatus.NOT_FOUND);
    }

    const share = await this.loadShareForFormAccess(token);
    if (share.docId !== pathCtx.docId) {
      throw new BusinessException(100403, '分享链接无效', HttpStatus.FORBIDDEN);
    }

    if (share.status !== true) {
      await this.shareRepository.appendVisitLog({
        docId: pathCtx.docId,
        shareToken: token,
        visitorId: params.userId ?? null,
        visitorIp: params.visitorIp ?? null,
        deviceInfo: params.deviceInfo ?? null,
        visitStatus: 'closed',
      });
      throw new BusinessException(100403, '分享已关闭', HttpStatus.GONE);
    }

    if (isShareExpired(share)) {
      await this.shareRepository.appendVisitLog({
        docId: pathCtx.docId,
        shareToken: token,
        visitorId: params.userId ?? null,
        visitorIp: params.visitorIp ?? null,
        deviceInfo: params.deviceInfo ?? null,
        visitStatus: 'expired',
      });
      throw new BusinessException(100403, '分享链接已过期', HttpStatus.GONE);
    }

    const doc = await this.documentRepository.findById(pathCtx.docId);
    if (!doc) {
      throw new BusinessException(100004, '文档不存在', HttpStatus.NOT_FOUND);
    }

    const level = share.permissionLevel as DocSharePermissionLevel;
    if (share.passwordHash && !params.password) {
      return {
        pending: {
          requirePassword: true,
          title: doc.title,
          docType: doc.docType,
          permissionLevel: level,
        },
      };
    }

    if (share.passwordHash) {
      const valid = params.password
        ? await bcrypt.compare(params.password, share.passwordHash)
        : false;
      if (!valid) {
        await this.shareRepository.appendVisitLog({
          docId: pathCtx.docId,
          shareToken: token,
          visitorId: params.userId ?? null,
          visitorIp: params.visitorIp ?? null,
          deviceInfo: params.deviceInfo ?? null,
          visitStatus: 'password_error',
        });
        throw new BusinessException(100401, '访问密码错误', HttpStatus.UNAUTHORIZED);
      }
    }

    assertFormViewShareEnabled(doc.data, params.sheetId, params.viewId);

    return {
      docId: pathCtx.docId,
      docData: doc.data,
      shareToken: token,
      docTitle: doc.title,
      docType: doc.docType,
    };
  }

  private async requireFormManageAccess(
    docId: string,
    auth?: AuthUser | null,
  ): Promise<void> {
    if (!auth) {
      throw new BusinessException(100403, '无权查看表单管理数据', HttpStatus.FORBIDDEN);
    }
    const canWrite = await this.documentRepository.hasWriteAccess(
      docId,
      documentAccessFromAuth(auth),
    );
    if (!canWrite) {
      throw new BusinessException(100403, '无权查看表单管理数据', HttpStatus.FORBIDDEN);
    }
  }

  /** 公开表单 schema（不含多维表记录） */
  async getPublicForm(
    spaceSlug: string,
    bookSlug: string,
    docSlug: string,
    query: {
      token: string;
      password?: string;
      sheetId: string;
      viewId: string;
    },
    visitorIp?: string | null,
    deviceInfo?: string | null,
    auth?: AuthUser | null,
  ): Promise<
    | DocPathAccessPendingDto
    | (PublicFormSchemaDto & { docId: string; canManage: boolean })
  > {
    const access = await this.assertFormShareAccess({
      spaceSlug,
      bookSlug,
      docSlug,
      token: query.token,
      password: query.password,
      sheetId: query.sheetId,
      viewId: query.viewId,
      visitorIp,
      deviceInfo,
      userId: auth?.userId ?? null,
    });
    if ('pending' in access) return access.pending;

    const schema = extractPublicFormSchema(access.docData, query.sheetId, query.viewId);
    let canManage = false;
    if (auth) {
      canManage = await this.documentRepository.hasWriteAccess(
        access.docId,
        documentAccessFromAuth(auth),
      );
    }

    await this.shareRepository.appendVisitLog({
      docId: access.docId,
      shareToken: access.shareToken,
      visitorId: auth?.userId ?? null,
      visitorIp: visitorIp ?? null,
      deviceInfo: deviceInfo ?? null,
      visitStatus: 'success',
      operateContent: 'form_open',
    });

    return { docId: access.docId, canManage, ...schema };
  }

  /** 表单统计（需有效 token + 写权限） */
  async getPublicFormStats(
    spaceSlug: string,
    bookSlug: string,
    docSlug: string,
    query: {
      token: string;
      password?: string;
      sheetId: string;
      viewId: string;
    },
    auth?: AuthUser | null,
  ): Promise<{
    submittedCount: number;
    requiredCount: number;
    submittedPeopleCount: number;
    pendingRequiredCount: number;
  }> {
    const access = await this.assertFormShareAccess({
      spaceSlug,
      bookSlug,
      docSlug,
      token: query.token,
      password: query.password,
      sheetId: query.sheetId,
      viewId: query.viewId,
      userId: auth?.userId ?? null,
    });
    if ('pending' in access) {
      throw new BusinessException(100401, '需要访问密码', HttpStatus.UNAUTHORIZED);
    }
    await this.requireFormManageAccess(access.docId, auth);

    const schema = extractPublicFormSchema(access.docData, query.sheetId, query.viewId);
    const submittedCount = countPublicFormSubmissions(access.docData, query.sheetId, query.viewId);
    const creators = listSubmissionCreatedBy(access.docData, query.sheetId, query.viewId);

    let requiredCount = 0;
    let submittedPeopleCount = 0;
    if (schema.formShareLinkScope === 'collaborators') {
      const collabs = await this.shareRepository.listCollaborators(access.docId);
      requiredCount = collabs.length;
      const submitterSet = new Set(
        creators.map(c => c.trim().toLowerCase()).filter(Boolean),
      );
      for (const c of collabs) {
        const name = (c.displayName || '').trim().toLowerCase();
        const id = (c.subjectId || '').trim().toLowerCase();
        if ((name && submitterSet.has(name)) || (id && submitterSet.has(id))) {
          submittedPeopleCount += 1;
        }
      }
    }

    return {
      submittedCount,
      requiredCount,
      submittedPeopleCount,
      pendingRequiredCount: Math.max(0, requiredCount - submittedPeopleCount),
    };
  }

  /** 提交记录列表（需有效 token + 写权限） */
  async listPublicFormSubmissions(
    spaceSlug: string,
    bookSlug: string,
    docSlug: string,
    query: {
      token: string;
      password?: string;
      sheetId: string;
      viewId: string;
    },
    auth?: AuthUser | null,
  ): Promise<{ items: PublicFormSubmissionSummaryDto[]; total: number }> {
    const access = await this.assertFormShareAccess({
      spaceSlug,
      bookSlug,
      docSlug,
      token: query.token,
      password: query.password,
      sheetId: query.sheetId,
      viewId: query.viewId,
      userId: auth?.userId ?? null,
    });
    if ('pending' in access) {
      throw new BusinessException(100401, '需要访问密码', HttpStatus.UNAUTHORIZED);
    }
    await this.requireFormManageAccess(access.docId, auth);

    const items = listPublicFormSubmissions(access.docData, query.sheetId, query.viewId);
    return { items, total: items.length };
  }

  /** 单条提交详情（需有效 token + 写权限） */
  async getPublicFormSubmissionDetail(
    spaceSlug: string,
    bookSlug: string,
    docSlug: string,
    recordId: string,
    query: {
      token: string;
      password?: string;
      sheetId: string;
      viewId: string;
    },
    auth?: AuthUser | null,
  ): Promise<{ recordId: string; fieldValues: Record<string, unknown> }> {
    const access = await this.assertFormShareAccess({
      spaceSlug,
      bookSlug,
      docSlug,
      token: query.token,
      password: query.password,
      sheetId: query.sheetId,
      viewId: query.viewId,
      userId: auth?.userId ?? null,
    });
    if ('pending' in access) {
      throw new BusinessException(100401, '需要访问密码', HttpStatus.UNAUTHORIZED);
    }
    await this.requireFormManageAccess(access.docId, auth);

    const fieldValues = getPublicFormSubmissionValues(
      access.docData,
      query.sheetId,
      query.viewId,
      recordId,
    );
    return { recordId, fieldValues };
  }

  /** 公开表单填写提交（仅追加记录；必须有效分享 token） */
  async submitPublicForm(
    spaceSlug: string,
    bookSlug: string,
    docSlug: string,
    body: {
      token: string;
      password?: string;
      sheetId: string;
      viewId: string;
      fieldValues: Record<string, unknown>;
    },
    visitorIp?: string | null,
    deviceInfo?: string | null,
    auth?: AuthUser | null,
  ): Promise<{ success: true; version: number }> {
    const access = await this.assertFormShareAccess({
      spaceSlug,
      bookSlug,
      docSlug,
      token: body.token,
      password: body.password,
      sheetId: body.sheetId,
      viewId: body.viewId,
      visitorIp,
      deviceInfo,
      userId: auth?.userId ?? null,
    });
    if ('pending' in access) {
      throw new BusinessException(100401, '需要访问密码', HttpStatus.UNAUTHORIZED);
    }

    let submitterName = '填写者';
    if (auth?.userId) {
      const user = await this.userRepository.findById(auth.userId);
      submitterName =
        user?.display_name?.trim()
        || auth.email?.split('@')[0]
        || '填写者';
    }

    const nextData = appendBaseFormRecord(access.docData, {
      sheetId: body.sheetId,
      viewId: body.viewId,
      fieldValues: body.fieldValues as Record<string, Record<string, unknown> & { type: string }>,
      submitterName,
    });

    const saved = await this.documentRepository.saveContentInternal(access.docId, nextData);
    if (!saved) {
      throw new BusinessException(100005, '保存失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    await this.shareRepository.appendVisitLog({
      docId: access.docId,
      shareToken: access.shareToken,
      visitorId: auth?.userId ?? null,
      visitorIp: visitorIp ?? null,
      deviceInfo: deviceInfo ?? null,
      visitStatus: 'success',
      operateContent: 'form_submit',
    });

    return { success: true, version: saved.version };
  }
}
