import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
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
      visibility: KnowledgeBaseVisibility;
      orgId?: string;
    },
  ): Promise<KnowledgeBaseDto & { defaultNodeId: string }> {
    const name = input.name.trim();
    if (!name) throw new BusinessException(100002, '缺少知识库名称');

    const ctx = this.ctx(auth);
    const scope = resolveKbScope(ctx);
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
        visibility: input.visibility,
        createdBy: nowUserId,
        updatedBy: nowUserId,
        isDeleted: 0,
      });

      if (scope === 2 && input.visibility === 'members') {
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
        isHome: 1,
        createdBy: nowUserId,
        isDeleted: 0,
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
    const kb = await this.requireWritableKb(auth, kbId);
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
    await this.kbNodeRepository.softDeleteByKbId(kb.id);
    const ok = await this.kbRepository.softDelete(kb.id, this.ctx(auth));
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
      isHome: 0,
      createdBy: auth.userId,
      isDeleted: 0,
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
    if (node.isHome === 1 && input.title && input.title.trim() !== node.title) {
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
    if (node.isHome === 1) throw new BusinessException(100002, '首页节点不可删除');

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
    input: { title: string; docType: string },
  ): Promise<{ docId: string; nodeId: string; docType: string; title: string }> {
    await this.requireWritableKb(auth, kbId);
    const parent = await this.kbNodeRepository.findById(kbId, parentNodeId);
    if (!parent) throw new BusinessException(100004, '父节点不存在', HttpStatus.NOT_FOUND);

    const title = input.title.trim() || '未命名文档';
    const docType = input.docType || 'freeform';
    const ctx = this.ctx(auth);
    await this.membershipService.assertCanCreateDocument(auth, ctx);
    const scope = resolveKbScope(ctx);
    const docId = `doc_${uuidv4().slice(0, 8)}`;
    const nodeId = uuidv4();

    await this.dataSource.transaction(async () => {
      await this.storageService.createDocument({
        id: docId,
        title,
        docType,
        data: null,
        ownerId: auth.userId,
        scope,
        tenantId: scope === 2 ? ctx.tenantId : null,
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
        isHome: 0,
        createdBy: auth.userId,
        isDeleted: 0,
      });
    });

    return { docId, nodeId, docType, title };
  }

  async listMembers(auth: AuthUser, kbId: string): Promise<{ items: KbMemberDto[]; total: number }> {
    const kb = await this.requireReadableKb(auth, kbId);
    if (kb.visibility !== 'members') {
      return { items: [], total: 0 };
    }
    const members = await this.kbRepository.listMembers(kbId);
    const items: KbMemberDto[] = [];
    for (const member of members) {
      const user = await this.userRepository.findById(member.userId);
      items.push({
        id: member.id,
        kbId: member.kbId,
        userId: member.userId,
        displayName: user?.display_name ?? undefined,
        email: user?.email ?? undefined,
        role: member.role as KbMemberRole,
        createdAt: member.createdAt.toISOString(),
      });
    }
    return { items, total: items.length };
  }

  async addMember(
    auth: AuthUser,
    kbId: string,
    input: { userId: string; role: KbMemberRole },
  ): Promise<KbMemberDto> {
    const kb = await this.requireWritableKb(auth, kbId);
    if (kb.visibility !== 'members') {
      throw new BusinessException(100002, '仅 members 可见性知识库支持成员管理');
    }
    if (!input.userId?.trim()) throw new BusinessException(100002, '缺少成员 userId');
    if (kb.scope === 2 && kb.tenantId) {
      const isMember = await this.tenantMemberRepository.isActiveMember(input.userId, kb.tenantId);
      if (!isMember) throw new BusinessException(100002, '用户不属于当前企业');
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

  async removeMember(auth: AuthUser, kbId: string, userId: string): Promise<{ userId: string }> {
    await this.requireWritableKb(auth, kbId);
    const ok = await this.kbRepository.removeMember(kbId, userId);
    if (!ok) throw new BusinessException(100004, '成员不存在', HttpStatus.NOT_FOUND);
    return { userId };
  }

  private async requireReadableKb(auth: AuthUser, kbId: string): Promise<KnowledgeBaseEntity> {
    const kb = await this.kbRepository.findAccessibleById(kbId, this.ctx(auth));
    if (!kb) throw new BusinessException(100004, '知识库不存在', HttpStatus.NOT_FOUND);

    if (kb.scope === 1) {
      if (kb.ownerId !== auth.userId) {
        throw new BusinessException(100004, '知识库不存在', HttpStatus.NOT_FOUND);
      }
      return kb;
    }

    if (!kb.tenantId) throw new BusinessException(100004, '知识库不存在', HttpStatus.NOT_FOUND);
    const tenantMember = await this.tenantMemberRepository.isActiveMember(auth.userId, kb.tenantId);
    if (!tenantMember) throw new BusinessException(100004, '知识库不存在', HttpStatus.NOT_FOUND);

    if (kb.visibility === 'organization') return kb;
    if (kb.createdBy === auth.userId) return kb;
    const role = await this.kbRepository.getMemberRole(kbId, auth.userId);
    if (!role) throw new BusinessException(100004, '知识库不存在', HttpStatus.NOT_FOUND);
    return kb;
  }

  private async requireWritableKb(
    auth: AuthUser,
    kbId: string,
    ownerOnly = false,
  ): Promise<KnowledgeBaseEntity> {
    const kb = await this.requireReadableKb(auth, kbId);
    if (kb.scope === 1) return kb;

    if (kb.createdBy === auth.userId) return kb;
    if (ownerOnly) throw new BusinessException(100004, '知识库不存在', HttpStatus.NOT_FOUND);

    const role = await this.kbRepository.getMemberRole(kbId, auth.userId);
    if (role === 'owner' || role === 'admin' || role === 'editor') return kb;
    if (kb.visibility === 'organization' && !role) {
      throw new BusinessException(100004, '知识库不存在', HttpStatus.NOT_FOUND);
    }
    throw new BusinessException(100004, '知识库不存在', HttpStatus.NOT_FOUND);
  }

  private async resolveMyRole(kb: KnowledgeBaseEntity, userId: string): Promise<KbMemberRole | null> {
    if (kb.scope === 1) return kb.ownerId === userId ? 'owner' : null;
    if (kb.createdBy === userId) return 'owner';
    return this.kbRepository.getMemberRole(kb.id, userId);
  }

  private async assertDocBelongsToKbScope(auth: AuthUser, docId: string): Promise<void> {
    const doc = await this.storageService.loadDocumentForUser(docId, this.ctx(auth));
    if (!doc) throw new BusinessException(100002, '引用的文档不存在或无权访问');
  }
}
