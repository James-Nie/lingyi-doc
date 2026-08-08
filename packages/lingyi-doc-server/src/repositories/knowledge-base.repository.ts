import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { KbMemberEntity, KnowledgeBaseEntity } from '../database/entities/knowledge-base.entity';
import type {
  KnowledgeBaseCover,
  KnowledgeBaseDto,
  KnowledgeBaseVisibility,
  KbMemberRole,
} from '../types/knowledge-base';
import type { DocumentAccessContext } from '../types/session';
import { applyKbAccessToUpdateQueryBuilder, buildKbAccessClause } from '../utils/kbAccessContext';
import { batchResolveEffectiveKbRole, buildKbListAccessSql } from '../utils/kbAccessPolicy';

function toIso(value: Date | string | null | undefined): string {
  if (value == null) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function toDto(entity: KnowledgeBaseEntity, myRole?: KbMemberRole): KnowledgeBaseDto {
  return {
    id: entity.id,
    scope: entity.scope as 1 | 2,
    ownerId: entity.ownerId,
    tenantId: entity.tenantId,
    orgId: entity.orgId,
    name: entity.name,
    description: entity.description,
    emoji: entity.emoji,
    cover: entity.cover as KnowledgeBaseCover,
    visibility: entity.visibility as KnowledgeBaseVisibility,
    myRole,
    createdBy: entity.createdBy,
    updatedBy: entity.updatedBy,
    createdAt: toIso(entity.createdAt),
    updatedAt: toIso(entity.updatedAt),
  };
}

@Injectable()
export class KnowledgeBaseRepository {
  constructor(
    @InjectRepository(KnowledgeBaseEntity)
    private readonly kbRepo: Repository<KnowledgeBaseEntity>,
    @InjectRepository(KbMemberEntity)
    private readonly memberRepo: Repository<KbMemberEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  toDto(entity: KnowledgeBaseEntity, myRole?: KbMemberRole): KnowledgeBaseDto {
    return toDto(entity, myRole);
  }

  async findById(id: string): Promise<KnowledgeBaseEntity | null> {
    return this.kbRepo.findOne({ where: { id, isDeleted: false } });
  }

  async findByInviteToken(token: string): Promise<KnowledgeBaseEntity | null> {
    if (!token.trim()) return null;
    return this.kbRepo.findOne({
      where: { inviteToken: token.trim(), isDeleted: false },
    });
  }

  async findAccessibleById(id: string, ctx: DocumentAccessContext): Promise<KnowledgeBaseEntity | null> {
    const qb = this.kbRepo.createQueryBuilder('kb')
      .where('kb.id = :id', { id })
      .andWhere('kb.isDeleted = false');
    // 所有者范围 OR 显式成员（邀请加入）
    const access = buildKbAccessClause(ctx, 'kb');
    qb.andWhere(
      `(${access.sql} OR EXISTS (
        SELECT 1 FROM kb_members m
        WHERE m.kb_id = kb.id AND m.user_id = :memberUserId
      ))`,
      { ...access.params, memberUserId: ctx.userId },
    );
    return qb.getOne();
  }

  async list(
    ctx: DocumentAccessContext,
    userId: string,
    options?: { keyword?: string; sortBy?: 'updated' | 'created' | 'name' },
  ): Promise<KnowledgeBaseDto[]> {
    const sortBy = options?.sortBy ?? 'updated';
    const orderField = sortBy === 'created'
      ? 'kb.createdAt'
      : sortBy === 'name'
        ? 'kb.name'
        : 'kb.updatedAt';

    const qb = this.kbRepo.createQueryBuilder('kb')
      .where('kb.isDeleted = false');

    // 个人/企业身份空间下分别加上 scope 过滤，再用统一 access 策略决定可见性
    if (ctx.identityType === 'tenant' && ctx.tenantId) {
      qb.andWhere('kb.scope = 2 AND kb.tenantId = :tenantId', { tenantId: ctx.tenantId });
    } else {
      qb.andWhere('(kb.scope = 1 OR kb.tenantId IS NULL)');
    }

    const access = buildKbListAccessSql(userId);
    qb.andWhere(access.sql, access.params);

    const keyword = options?.keyword?.trim();
    if (keyword) {
      qb.andWhere('(kb.name LIKE :keyword OR kb.description LIKE :keyword)', {
        keyword: `${keyword}%`,
      });
    }

    qb.orderBy(orderField, sortBy === 'name' ? 'ASC' : 'DESC');
    qb.take(200);
    const rows = await qb.getMany();
    const roleMap = await batchResolveEffectiveKbRole(this.dataSource, rows, userId);
    return rows.map((row) => {
      const myRole = roleMap.get(row.id) ?? undefined;
      return toDto(row, myRole);
    });
  }

  async save(entity: Partial<KnowledgeBaseEntity> & { id: string }): Promise<KnowledgeBaseEntity> {
    return this.kbRepo.save(entity);
  }

  async updateInviteLink(
    kbId: string,
    input: { inviteToken: string; inviteRole: string; inviteEnabled: boolean; updatedBy: string },
  ): Promise<void> {
    await this.kbRepo.update(
      { id: kbId },
      {
        inviteToken: input.inviteToken,
        inviteRole: input.inviteRole,
        inviteEnabled: input.inviteEnabled,
        updatedBy: input.updatedBy,
      },
    );
  }

  async softDelete(id: string, ctx: DocumentAccessContext): Promise<boolean> {
    const qb = this.dataSource
      .createQueryBuilder()
      .update(KnowledgeBaseEntity)
      .set({ isDeleted: true, deletedAt: () => 'NOW()' })
      .where('id = :id', { id })
      .andWhere('isDeleted = false');
    applyKbAccessToUpdateQueryBuilder(qb, ctx);
    const result = await qb.execute();
    return (result.affected ?? 0) > 0;
  }

  async countByOwner(ownerId: string): Promise<number> {
    return this.kbRepo.count({
      where: { isDeleted: false, scope: 1, ownerId },
    });
  }

  async countByTenant(tenantId: string): Promise<number> {
    return this.kbRepo.count({
      where: { isDeleted: false, scope: 2, tenantId },
    });
  }

  async getMemberRole(kbId: string, userId: string): Promise<KbMemberRole | null> {
    const member = await this.memberRepo.findOne({ where: { kbId, userId } });
    return member ? (member.role as KbMemberRole) : null;
  }

  async addMember(input: { kbId: string; userId: string; role: KbMemberRole; id: string }): Promise<void> {
    const existing = await this.memberRepo.findOne({ where: { kbId: input.kbId, userId: input.userId } });
    if (existing) {
      await this.memberRepo.update({ id: existing.id }, { role: input.role });
      return;
    }
    await this.memberRepo.save({
      id: input.id,
      kbId: input.kbId,
      userId: input.userId,
      role: input.role,
    });
  }

  async listMembers(kbId: string): Promise<KbMemberEntity[]> {
    return this.memberRepo.find({ where: { kbId }, order: { createdAt: 'ASC' } });
  }

  async removeMember(kbId: string, userId: string): Promise<boolean> {
    const result = await this.memberRepo.delete({ kbId, userId });
    return (result.affected ?? 0) > 0;
  }

  private async loadRolesForUser(
    kbIds: string[],
    userId: string,
  ): Promise<Map<string, KbMemberRole>> {
    if (kbIds.length === 0) return new Map();
    const members = await this.memberRepo
      .createQueryBuilder('m')
      .where('m.kb_id IN (:...kbIds)', { kbIds })
      .andWhere('m.user_id = :userId', { userId })
      .getMany();
    return new Map(members.map(member => [member.kbId, member.role as KbMemberRole]));
  }
}
