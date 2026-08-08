import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { BusinessException } from '../../common/exceptions/business.exception';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import { KbNodeRepository } from '../../repositories/kb-node.repository';
import { KnowledgeBaseRepository } from '../../repositories/knowledge-base.repository';
import { TenantMemberRepository } from '../../repositories/tenant-member.repository';
import { UserRepository } from '../../repositories/user.repository';
import { StorageService } from '../../services/storage.service';
import { MembershipService } from '../membership/membership.service';
import {
  hasAtLeastKbRole,
  resolveEffectiveKbRole,
} from '../../utils/kbAccessPolicy';
import type {
  KnowledgeBaseCover,
  KnowledgeBaseDto,
  KnowledgeBaseVisibility,
  KbMemberDto,
  KbMemberRole,
  KbNodeDto,
  KbNodeTreeDto,
  KbNodeType,
} from '../../types/knowledge-base';
import type { DocumentAccessContext } from '../../types/session';
import { resolveKbScope } from '../../utils/kbAccessContext';
import { buildKbNodeTree } from '../../utils/kb-node-tree';
import { KbMemberEntity, KbNodeEntity, KnowledgeBaseEntity } from '../../database/entities/knowledge-base.entity';

@Injectable()
export class KnowledgeBaseService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly kbRepository: KnowledgeBaseRepository,
    private readonly kbNodeRepository: KbNodeRepository,
    private readonly tenantMemberRepository: TenantMemberRepository,
    private readonly userRepository: UserRepository,
    private readonly storageService: StorageService,
    private readonly membershipService: MembershipService,
  ) {}

  private ctx(auth: AuthUser): DocumentAccessContext {
    return this.storageService.accessFromAuth(auth);
  }

  async list(
    auth: AuthUser,
    query?: { keyword?: string; sortBy?: 'updated' | 'created' | 'name' },
  ): Promise<{ items: KnowledgeBaseDto[]; total: number }> {
    const items = await this.kbRepository.list(this.ctx(auth), auth.userId, query);
    return { items, total: items.length };
  }

  async getById(auth: AuthUser, kbId: string): Promise<KnowledgeBaseDto> {
    const kb = await this.requireReadableKb(auth, kbId);
    const myRole = await this.resolveMyRole(kb, auth.userId);
    return this.kbRepository.toDto(kb, myRole ?? undefined);
  }

  async create(
    auth: AuthUser,
    input: {
      name: string;
      description?: string;
      emoji?: string;
      cover?: KnowledgeBaseCover;
      visibility?: KnowledgeBaseVisibility;
      orgId?: string;
    },
  ): Promise<KnowledgeBaseDto & { defaultNodeId: string }> {
    const name = input.name.trim();
    if (!name) throw new BusinessException(100002, '缺少知识库名称');

    const ctx = this.ctx(auth);
    const scope = resolveKbScope(ctx);
    await this.membershipService.assertCanCreateKnowledgeBase(auth);
    // 企业 KB 默认对租户成员公开，避免出现"同租户成员看不到别人新创建的知识库"的体验断层；
    // 个人 KB 默认仅本人可见，保护个人空间隐私。
    const visibility: KnowledgeBaseVisibility = input.visibility
      ?? (scope === 2 ? 'organization' : 'members');
    const kbId = uuidv4();
    const homeNodeId = uuidv4();
    const nowUserId = auth.userId;

    await this.dataSource.transaction(async (manager) => {
      await manager.save(KnowledgeBaseEntity, {
        id: kbId,
        scope,
        ownerId: nowUserId,
        tenantId: scope === 2 ? ctx.tenantId : null,
        orgId: scope === 2 ? (input.orgId ?? null) : null,
        name,
        description: input.description?.trim() || null,
        emoji: input.emoji?.trim() || '📘',
        cover: input.cover ?? (Date.now() % 2 === 0 ? 'blue' : 'sunset'),
        visibility,
        createdBy: nowUserId,
        updatedBy: nowUserId,
        isDeleted: false,
      });

      // 仅在显式选 "仅 KB 成员可见" 时，把创建者写入 kb_members（冗余创建者条目，
      // 主要服务于 `myRole` 等依赖显式成员表的读取路径；访问控制本身由
      // created_by/owner_id/tenant_members 兜底）。
      if (scope === 2 && visibility === 'members') {
        await manager.save(KbMemberEntity, {
          id: uuidv4(),
          kbId,
          userId: nowUserId,
          role: 'owner',
        });
      }

      await manager.save(KbNodeEntity, {
        id: homeNodeId,
        kbId,
        parentId: null,
        title: '首页',
        nodeType: 'page',
        docId: null,
        sortOrder: 0,
        isHome: true,
        createdBy: nowUserId,
        isDeleted: false,
      });
    });

    const kb = await this.kbRepository.findById(kbId);
    if (!kb) throw new BusinessException(100005, '创建知识库失败', HttpStatus.INTERNAL_SERVER_ERROR);
    return { ...this.kbRepository.toDto(kb, 'owner'), defaultNodeId: homeNodeId };
  }

  async update(
    auth: AuthUser,
    kbId: string,
    input: {
      name?: string;
      description?: string;
      emoji?: string;
      cover?: KnowledgeBaseCover;
      visibility?: KnowledgeBaseVisibility;
      orgId?: string | null;
    },
  ): Promise<KnowledgeBaseDto> {
    const kb = await this.requireManageKb(auth, kbId);
    const patch: Partial<KnowledgeBaseEntity> = { updatedBy: auth.userId };

    if (input.name != null) {
      const name = input.name.trim();
      if (!name) throw new BusinessException(100002, '知识库名称不能为空');
      patch.name = name;
    }
    if (input.description != null) patch.description = input.description.trim() || null;
    if (input.emoji != null) patch.emoji = input.emoji.trim() || '📘';
    if (input.cover != null) patch.cover = input.cover;
    if (input.visibility != null) patch.visibility = input.visibility;
    if (input.orgId !== undefined) patch.orgId = input.orgId;

    await this.kbRepository.save({ id: kb.id, ...patch });
    const updated = await this.kbRepository.findById(kbId);
    if (!updated) throw new BusinessException(100004, '知识库不存在', HttpStatus.NOT_FOUND);
    const myRole = await this.resolveMyRole(updated, auth.userId);
    return this.kbRepository.toDto(updated, myRole ?? undefined);
  }

  async remove(auth: AuthUser, kbId: string): Promise<{ id: string }> {
    const kb = await this.requireWritableKb(auth, kbId, true);
    const ctx = this.ctx(auth);
    const docIds = await this.kbNodeRepository.listDocIdsByKbId(kb.id);
    if (docIds.length > 0) {
      await this.storageService.deleteDocuments(docIds, ctx);
    }
    await this.kbNodeRepository.softDeleteByKbId(kb.id);
    const ok = await this.kbRepository.softDelete(kb.id, ctx);
    if (!ok) throw new BusinessException(100004, '知识库不存在', HttpStatus.NOT_FOUND);
    return { id: kbId };
  }

  async listNodes(auth: AuthUser, kbId: string): Promise<{ items: KbNodeTreeDto[]; total: number; home: KbNodeDto | null }> {
    await this.requireReadableKb(auth, kbId);
    const flat = await this.kbNodeRepository.listByKbId(kbId);
    const { items, home } = buildKbNodeTree(flat);
    return { items, total: flat.length, home };
  }

  async createNode(
    auth: AuthUser,
    kbId: string,
    input: {
      title: string;
      nodeType: KbNodeType;
      parentId?: string | null;
      docId?: string;
      sortOrder?: number;
    },
  ): Promise<KbNodeDto> {
    await this.requireWritableKb(auth, kbId);
    const title = input.title.trim();
    if (!title) throw new BusinessException(100002, '缺少节点标题');

    if (input.nodeType === 'doc_ref') {
      if (!input.docId) throw new BusinessException(100002, 'doc_ref 节点缺少 docId');
      await this.assertDocBelongsToKbScope(auth, input.docId);
    }

    if (input.parentId) {
      const parent = await this.kbNodeRepository.findById(kbId, input.parentId);
      if (!parent) throw new BusinessException(100004, '父节点不存在', HttpStatus.NOT_FOUND);
    }

    const sortOrder = input.sortOrder ?? await this.kbNodeRepository.getNextSortOrder(kbId, input.parentId ?? null);
    const nodeId = uuidv4();
    await this.kbNodeRepository.save({
      id: nodeId,
      kbId,
      parentId: input.parentId ?? null,
      title,
      nodeType: input.nodeType,
      docId: input.nodeType === 'doc_ref' ? (input.docId ?? null) : null,
      sortOrder,
      isHome: false,
      createdBy: auth.userId,
      isDeleted: false,
    });

    const items = await this.kbNodeRepository.listByKbId(kbId);
    const created = items.find(item => item.id === nodeId);
    if (!created) throw new BusinessException(100005, '创建节点失败', HttpStatus.INTERNAL_SERVER_ERROR);
    return created;
  }

  async updateNode(
    auth: AuthUser,
    kbId: string,
    nodeId: string,
    input: { title?: string; parentId?: string | null; sortOrder?: number },
  ): Promise<KbNodeDto> {
    await this.requireWritableKb(auth, kbId);
    const node = await this.kbNodeRepository.findById(kbId, nodeId);
    if (!node) throw new BusinessException(100004, '节点不存在', HttpStatus.NOT_FOUND);
    if (node.isHome === true && input.title && input.title.trim() !== node.title) {
      throw new BusinessException(100002, '首页节点不可重命名');
    }

    const ok = await this.kbNodeRepository.updateNode(kbId, nodeId, {
      title: input.title?.trim(),
      parentId: input.parentId,
      sortOrder: input.sortOrder,
    });
    if (!ok) throw new BusinessException(100004, '节点不存在', HttpStatus.NOT_FOUND);

    const items = await this.kbNodeRepository.listByKbId(kbId);
    const updated = items.find(item => item.id === nodeId);
    if (!updated) throw new BusinessException(100004, '节点不存在', HttpStatus.NOT_FOUND);
    return updated;
  }

  async removeNode(
    auth: AuthUser,
    kbId: string,
    nodeId: string,
    deleteDocument = false,
  ): Promise<{ id: string }> {
    await this.requireWritableKb(auth, kbId);
    const node = await this.kbNodeRepository.findById(kbId, nodeId);
    if (!node) throw new BusinessException(100004, '节点不存在', HttpStatus.NOT_FOUND);
    if (node.isHome === true) throw new BusinessException(100002, '首页节点不可删除');

    if (deleteDocument && node.docId) {
      await this.storageService.deleteDocument(node.docId, this.ctx(auth));
    }

    const ok = await this.kbNodeRepository.softDelete(kbId, nodeId);
    if (!ok) throw new BusinessException(100004, '节点不存在', HttpStatus.NOT_FOUND);
    return { id: nodeId };
  }

  async createDocument(
    auth: AuthUser,
    kbId: string,
    parentNodeId: string,
    input: { title: string; docType: string; data?: unknown },
  ): Promise<{ docId: string; nodeId: string; docType: string; title: string }> {
    const kb = await this.requireWritableKb(auth, kbId);
    const parent = await this.kbNodeRepository.findById(kbId, parentNodeId);
    if (!parent) throw new BusinessException(100004, '父节点不存在', HttpStatus.NOT_FOUND);

    const title = input.title.trim() || '未命名文档';
    const docType = input.docType || 'richtext';
    const ctx = this.ctx(auth);
    await this.membershipService.assertCanCreateDocument(auth, ctx, docType);
    // 文档挂载到 KB 下，scope/tenantId 必须跟随 KB，不能使用当前用户上下文，
    // 避免个人空间的用户在企业 KB 中创建出 scope/tenantId 错配的文档。
    const docScope = (kb.scope === 2 ? 2 : 1) as 1 | 2;
    const docTenantId = kb.scope === 2 ? kb.tenantId : null;
    const docId = `doc_${uuidv4().slice(0, 8)}`;
    const nodeId = uuidv4();

    await this.dataSource.transaction(async () => {
      await this.storageService.createDocument({
        id: docId,
        title,
        docType,
        data: input.data ?? null,
        ownerId: auth.userId,
        scope: docScope,
        tenantId: docTenantId,
      });

      const sortOrder = await this.kbNodeRepository.getNextSortOrder(kbId, parentNodeId);
      await this.kbNodeRepository.save({
        id: nodeId,
        kbId,
        parentId: parentNodeId,
        title,
        nodeType: 'doc_ref',
        docId,
        sortOrder,
        isHome: false,
        createdBy: auth.userId,
        isDeleted: false,
      });
    });

    return { docId, nodeId, docType, title };
  }

  async listMembers(auth: AuthUser, kbId: string): Promise<{ items: KbMemberDto[]; total: number }> {
    await this.requireManageKb(auth, kbId);
    const members = await this.kbRepository.listMembers(kbId);
    const users = await this.userRepository.findByIds(members.map((m) => m.userId));
    const userMap = new Map(users.map((u) => [u.id, u]));
    const items: KbMemberDto[] = members.map((member) => {
      const user = userMap.get(member.userId);
      return {
        id: member.id,
        kbId: member.kbId,
        userId: member.userId,
        displayName: user?.display_name ?? undefined,
        email: user?.email ?? undefined,
        role: member.role as KbMemberRole,
        createdAt: member.createdAt.toISOString(),
      };
    });
    return { items, total: items.length };
  }

  async addMember(
    auth: AuthUser,
    kbId: string,
    input: { userId: string; role: KbMemberRole },
  ): Promise<KbMemberDto> {
    const kb = await this.requireManageKb(auth, kbId);
    if (!input.userId?.trim()) throw new BusinessException(100002, '缺少成员 userId');
    if (input.role === 'owner') {
      throw new BusinessException(100002, '不可直接添加所有者');
    }
    if (kb.scope === 2 && kb.tenantId) {
      const isMember = await this.tenantMemberRepository.isActiveMember(input.userId, kb.tenantId);
      if (!isMember) throw new BusinessException(100002, '用户不属于当前企业');
    } else if (kb.scope === 1) {
      const user = await this.userRepository.findById(input.userId);
      if (!user) throw new BusinessException(100004, '用户不存在', HttpStatus.NOT_FOUND);
    }

    const memberId = uuidv4();
    await this.kbRepository.addMember({
      id: memberId,
      kbId,
      userId: input.userId,
      role: input.role,
    });

    const user = await this.userRepository.findById(input.userId);
    return {
      id: memberId,
      kbId,
      userId: input.userId,
      displayName: user?.display_name ?? undefined,
      email: user?.email ?? undefined,
      role: input.role,
      createdAt: new Date().toISOString(),
    };
  }

  async addMembers(
    auth: AuthUser,
    kbId: string,
    input: { userIds: string[]; role: KbMemberRole },
  ): Promise<{ items: KbMemberDto[]; added: number }> {
    const uniqueIds = [...new Set(input.userIds.map(id => id.trim()).filter(Boolean))];
    const items: KbMemberDto[] = [];
    for (const userId of uniqueIds) {
      const item = await this.addMember(auth, kbId, { userId, role: input.role });
      items.push(item);
    }
    return { items, added: items.length };
  }

  /** 生成或刷新邀请链接（按所选角色） */
  async ensureInviteLink(
    auth: AuthUser,
    kbId: string,
    role: Exclude<KbMemberRole, 'owner'>,
  ): Promise<{ token: string; role: string; invitePath: string }> {
    const kb = await this.requireManageKb(auth, kbId);
    let token = kb.inviteToken;
    if (!token) {
      token = randomBytes(24).toString('base64url');
    }
    await this.kbRepository.updateInviteLink(kb.id, {
      inviteToken: token,
      inviteRole: role,
        inviteEnabled: true,
      updatedBy: auth.userId,
    });
    return {
      token,
      role,
      invitePath: `/invite/kb/${token}`,
    };
  }

  async getInviteInfo(
    auth: AuthUser,
    token: string,
  ): Promise<{
    token: string;
    kbId: string;
    kbName: string;
    emoji: string;
    role: Exclude<KbMemberRole, 'owner'>;
    closed: boolean;
    alreadyMember: boolean;
  }> {
    const kb = await this.kbRepository.findByInviteToken(token);
    if (!kb) throw new BusinessException(100004, '邀请链接无效', HttpStatus.NOT_FOUND);

    const closed = kb.inviteEnabled !== true;
    const existingRole = await this.kbRepository.getMemberRole(kb.id, auth.userId);
    const isOwner = (kb.scope === 1 && kb.ownerId === auth.userId)
      || kb.createdBy === auth.userId;
    const role = (['admin', 'editor', 'viewer'].includes(kb.inviteRole)
      ? kb.inviteRole
      : 'editor') as Exclude<KbMemberRole, 'owner'>;

    return {
      token,
      kbId: kb.id,
      kbName: kb.name,
      emoji: kb.emoji || '📘',
      role,
      closed,
      alreadyMember: Boolean(existingRole) || isOwner,
    };
  }

  async acceptInvite(
    auth: AuthUser,
    token: string,
  ): Promise<{ kbId: string; role: Exclude<KbMemberRole, 'owner'> }> {
    const kb = await this.kbRepository.findByInviteToken(token);
    if (!kb) throw new BusinessException(100004, '邀请链接无效', HttpStatus.NOT_FOUND);
    if (kb.inviteEnabled !== true) {
      throw new BusinessException(100002, '邀请已关闭');
    }

    const role = (['admin', 'editor', 'viewer'].includes(kb.inviteRole)
      ? kb.inviteRole
      : 'editor') as Exclude<KbMemberRole, 'owner'>;

    const isOwner = (kb.scope === 1 && kb.ownerId === auth.userId)
      || kb.createdBy === auth.userId;
    if (isOwner) {
      return { kbId: kb.id, role };
    }

    const existing = await this.kbRepository.getMemberRole(kb.id, auth.userId);
    if (existing) {
      return { kbId: kb.id, role: existing === 'owner' ? 'admin' : existing };
    }

    if (kb.scope === 2 && kb.tenantId) {
      const isMember = await this.tenantMemberRepository.isActiveMember(auth.userId, kb.tenantId);
      if (!isMember) {
        throw new BusinessException(100002, '你不属于该知识库所在企业，无法加入');
      }
    }

    await this.kbRepository.addMember({
      id: uuidv4(),
      kbId: kb.id,
      userId: auth.userId,
      role,
    });
    return { kbId: kb.id, role };
  }

  /** 个人版「搜索添加」：按名称/手机号/邮箱查找平台用户 */
  async searchUsersForAdd(
    auth: AuthUser,
    kbId: string,
    keyword: string,
  ): Promise<{ items: Array<{ userId: string; displayName: string; email: string; phone: string | null }> }> {
    const kb = await this.requireManageKb(auth, kbId);
    if (kb.scope !== 1) {
      throw new BusinessException(100002, '搜索添加仅支持个人知识库');
    }
    const q = keyword.trim();
    if (q.length < 2) return { items: [] };

    const existing = new Set((await this.kbRepository.listMembers(kbId)).map(m => m.userId));
    existing.add(auth.userId);

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

  async removeMember(auth: AuthUser, kbId: string, userId: string): Promise<{ userId: string }> {
    await this.requireManageKb(auth, kbId);
    const role = await this.kbRepository.getMemberRole(kbId, userId);
    if (role === 'owner') {
      throw new BusinessException(100002, '不可移除所有者');
    }
    const ok = await this.kbRepository.removeMember(kbId, userId);
    if (!ok) throw new BusinessException(100004, '成员不存在', HttpStatus.NOT_FOUND);
    return { userId };
  }

  /**
   * 校验当前用户对 KB 至少具备"可读"权限。
   * 可读等价于：有效角色 ≠ null（owner/admin/editor/viewer 都算可读）。
   * 不暴露具体角色给前端，详情/列表中由调用方自行 resolve。
   */
  private async requireReadableKb(auth: AuthUser, kbId: string): Promise<KnowledgeBaseEntity> {
    const kb = await this.kbRepository.findById(kbId);
    if (!kb) throw new BusinessException(100004, '知识库不存在', HttpStatus.NOT_FOUND);

    const role = await this.resolveMyRole(kb, auth.userId);
    if (!role) {
      throw new BusinessException(100004, '知识库不存在', HttpStatus.NOT_FOUND);
    }
    return kb;
  }

  /** 设置/成员管理：仅所有者或管理员（含 organization 模式下由租户管理员派生出的 admin） */
  private async requireManageKb(auth: AuthUser, kbId: string): Promise<KnowledgeBaseEntity> {
    const kb = await this.requireReadableKb(auth, kbId);
    const role = await this.resolveMyRole(kb, auth.userId);
    if (!hasAtLeastKbRole(role, 'admin')) {
      throw new BusinessException(100003, '无权管理该知识库', HttpStatus.FORBIDDEN);
    }
    return kb;
  }

  private async requireWritableKb(
    auth: AuthUser,
    kbId: string,
    ownerOnly = false,
  ): Promise<KnowledgeBaseEntity> {
    const kb = await this.requireReadableKb(auth, kbId);

    const role = await this.resolveMyRole(kb, auth.userId);
    if (ownerOnly) {
      if (role !== 'owner') {
        throw new BusinessException(100003, '无权删除该知识库', HttpStatus.FORBIDDEN);
      }
      return kb;
    }
    if (!hasAtLeastKbRole(role, 'editor')) {
      throw new BusinessException(100003, '无权编辑该知识库', HttpStatus.FORBIDDEN);
    }
    return kb;
  }

  /**
   * 派生当前用户对 KB 的有效角色（owner / admin / editor / viewer / null）。
   * 同一规则被 KB 入口、KB 列表 SQL、文档读/写 SQL 共同遵循，避免分头判断导致的「能看不能进」。
   */
  private async resolveMyRole(kb: KnowledgeBaseEntity, userId: string): Promise<KbMemberRole | null> {
    return resolveEffectiveKbRole(this.dataSource, kb, userId);
  }

  private async assertDocBelongsToKbScope(auth: AuthUser, docId: string): Promise<void> {
    const doc = await this.storageService.loadDocumentForUser(docId, this.ctx(auth));
    if (!doc) throw new BusinessException(100002, '引用的文档不存在或无权访问');
  }
}
