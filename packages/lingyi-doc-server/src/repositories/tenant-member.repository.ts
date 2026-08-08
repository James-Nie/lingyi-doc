import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { OrganizationEntity, TenantMemberEntity } from '../database/entities/tenant.entity';
import { UserEntity } from '../database/entities/user.entity';
import { DeployService } from '../config/deploy.service';
import { TenantRepository } from './tenant.repository';
import type { UserSource } from '../types/database';
import type { DbTenantMember, TenantMemberPublic, TenantRole } from '../types/session';

function toDbTenantMember(entity: TenantMemberEntity): DbTenantMember {
  return {
    id: Number(entity.id),
    tenant_id: entity.tenantId,
    user_id: entity.userId,
    user_source: entity.userSource,
    org_id: entity.orgId,
    tenant_role: entity.tenantRole,
    status: entity.status,
    joined_at: entity.joinedAt,
  };
}

@Injectable()
export class TenantMemberRepository {
  constructor(
    @InjectRepository(TenantMemberEntity)
    private readonly memberRepo: Repository<TenantMemberEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    private readonly tenantRepository: TenantRepository,
    private readonly deployService: DeployService,
  ) {}

  async findMembership(userId: string, tenantId: string): Promise<DbTenantMember | null> {
    const entity = await this.memberRepo.findOne({
      where: { userId, tenantId, status: 1 },
    });
    return entity ? toDbTenantMember(entity) : null;
  }

  async isActiveMember(userId: string, tenantId: string): Promise<boolean> {
    return Boolean(await this.findMembership(userId, tenantId));
  }

  async countByTenant(tenantId: string): Promise<number> {
    return this.memberRepo.count({ where: { tenantId, status: 1 } });
  }

  async addMember(input: {
    tenantId: string;
    userId: string;
    userSource: UserSource;
    orgId?: string | null;
    positionId?: string | null;
    roleId?: string | null;
    employeeId?: string | null;
    gender?: number | null;
    tenantRole?: TenantRole;
    status?: number;
  }): Promise<void> {
    const existing = await this.memberRepo.findOne({
      where: { tenantId: input.tenantId, userId: input.userId },
    });
    if (existing) {
      await this.memberRepo.update(
        { tenantId: input.tenantId, userId: input.userId },
        {
          status: input.status ?? 1,
          orgId: input.orgId ?? null,
          positionId: input.positionId ?? null,
          roleId: input.roleId ?? null,
          employeeId: input.employeeId ?? null,
          gender: input.gender ?? null,
          tenantRole: input.tenantRole ?? 3,
        },
      );
      return;
    }
    await this.memberRepo.save({
      tenantId: input.tenantId,
      userId: input.userId,
      userSource: input.userSource,
      orgId: input.orgId ?? null,
      positionId: input.positionId ?? null,
      roleId: input.roleId ?? null,
      employeeId: input.employeeId ?? null,
      gender: input.gender ?? null,
      tenantRole: input.tenantRole ?? 3,
      status: input.status ?? 1,
    });
  }

  async listByTenant(tenantId: string): Promise<TenantMemberPublic[]> {
    const rows = await this.memberRepo
      .createQueryBuilder('tm')
      .innerJoin(UserEntity, 'u', 'u.id = tm.userId')
      .where('tm.tenantId = :tenantId', { tenantId })
      .select([
        'tm.userId',
        'u.email',
        'u.displayName',
        'u.phone',
        'tm.tenantRole',
        'tm.orgId',
        'tm.positionId',
        'tm.roleId',
        'tm.employeeId',
        'tm.gender',
        'tm.status',
        'tm.joinedAt',
      ])
      .orderBy('tm.tenantRole', 'ASC')
      .addOrderBy('tm.joinedAt', 'ASC')
      .getRawMany<Record<string, unknown>>();

    return rows.map((r) => ({
      userId: (r.tm_user_id ?? r.tm_userId) as string,
      email: r.u_email as string,
      displayName: (r.u_display_name ?? r.u_displayName) as string,
      phone: (r.u_phone ?? null) as string | null,
      tenantRole: (r.tm_tenant_role ?? r.tm_tenantRole) as TenantRole,
      orgId: (r.tm_org_id ?? r.tm_orgId) as string | null,
      positionId: (r.tm_position_id ?? r.tm_positionId ?? null) as string | null,
      roleId: (r.tm_role_id ?? r.tm_roleId ?? null) as string | null,
      employeeId: (r.tm_employee_id ?? r.tm_employeeId ?? null) as string | null,
      gender: r.tm_gender != null ? Number(r.tm_gender) : null,
      status: Number(r.tm_status),
      joinedAt: (() => {
        const v = (r.tm_joined_at ?? r.tm_joinedAt) as Date | string;
        return v instanceof Date ? v.getTime() : new Date(v).getTime();
      })(),
    }));
  }

  async countByPosition(tenantId: string, positionId: string): Promise<number> {
    return this.memberRepo.count({ where: { tenantId, positionId, status: 1 } });
  }

  async clearPositionReference(tenantId: string, positionId: string): Promise<void> {
    await this.memberRepo.update({ tenantId, positionId }, { positionId: null });
  }

  async clearPositionReferences(tenantId: string, positionIds: string[]): Promise<void> {
    if (!positionIds.length) return;
    await this.memberRepo
      .createQueryBuilder()
      .update(TenantMemberEntity)
      .set({ positionId: null })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('position_id IN (:...positionIds)', { positionIds })
      .execute();
  }

  async clearOrgReference(tenantId: string, orgId: string): Promise<void> {
    await this.memberRepo.update({ tenantId, orgId }, { orgId: null });
  }

  async assignPositionToMembers(tenantId: string, positionId: string, userIds: string[]): Promise<void> {
    if (!userIds.length) return;
    await this.memberRepo
      .createQueryBuilder()
      .update(TenantMemberEntity)
      .set({ positionId })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('user_id IN (:...userIds)', { userIds })
      .execute();
  }

  async clearMemberPosition(tenantId: string, positionId: string, userId: string): Promise<boolean> {
    const result = await this.memberRepo.update(
      { tenantId, userId, positionId },
      { positionId: null },
    );
    return (result.affected ?? 0) > 0;
  }

  async assignRoleToMembers(
    tenantId: string,
    roleId: string,
    tenantRole: TenantRole,
    userIds: string[],
  ): Promise<void> {
    if (!userIds.length) return;
    await this.memberRepo
      .createQueryBuilder()
      .update(TenantMemberEntity)
      .set({ roleId, tenantRole })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('user_id IN (:...userIds)', { userIds })
      .execute();
  }

  async clearMemberRole(
    tenantId: string,
    roleId: string,
    userId: string,
    fallbackRoleId: string,
    fallbackTenantRole: TenantRole,
  ): Promise<boolean> {
    const result = await this.memberRepo.update(
      { tenantId, userId, roleId },
      { roleId: fallbackRoleId, tenantRole: fallbackTenantRole },
    );
    return (result.affected ?? 0) > 0;
  }

  async countByRole(tenantId: string, roleId: string): Promise<number> {
    return this.memberRepo.count({ where: { tenantId, roleId, status: 1 } });
  }

  async updateMember(
    tenantId: string,
    userId: string,
    patch: {
      tenantRole?: TenantRole;
      roleId?: string | null;
      orgId?: string | null;
      positionId?: string | null;
      employeeId?: string | null;
      gender?: number | null;
      status?: number;
    },
  ): Promise<boolean> {
    const result = await this.memberRepo.update({ tenantId, userId }, patch);
    return (result.affected ?? 0) > 0;
  }

  async countSuperAdmins(tenantId: string): Promise<number> {
    return this.memberRepo.count({ where: { tenantId, tenantRole: 1, status: 1 } });
  }

  async ensurePrivateDefaultMembership(userId: string, userSource: UserSource): Promise<void> {
    if (!this.deployService.isPrivate()) return;

    const tenant = await this.tenantRepository.ensureDefaultPrivateTenant();
    if (!tenant) return;

    const existing = await this.findMembership(userId, tenant.id);
    if (existing) return;

    const rootOrg = await this.orgRepo.findOne({
      where: { tenantId: tenant.id, parentId: IsNull() },
    });

    await this.addMember({
      tenantId: tenant.id,
      userId,
      userSource,
      orgId: rootOrg?.id ?? null,
      tenantRole: 3,
    });
  }

  async listPendingInvitations(userId: string): Promise<TenantMemberPublic[]> {
    const rows = await this.memberRepo
      .createQueryBuilder('tm')
      .innerJoin(UserEntity, 'u', 'u.id = tm.userId')
      .where('tm.userId = :userId', { userId })
      .andWhere('tm.status = 0')
      .select([
        'tm.tenantId',
        'tm.userId',
        'u.email',
        'u.displayName',
        'tm.tenantRole',
        'tm.orgId',
        'tm.status',
        'tm.joinedAt',
      ])
      .orderBy('tm.joinedAt', 'DESC')
      .getRawMany<Record<string, unknown>>();

    return rows.map((r) => ({
      userId: (r.tm_user_id ?? r.tm_userId) as string,
      tenantId: (r.tm_tenant_id ?? r.tm_tenantId) as string,
      email: r.u_email as string,
      displayName: (r.u_display_name ?? r.u_displayName) as string,
      tenantRole: (r.tm_tenant_role ?? r.tm_tenantRole) as TenantRole,
      orgId: (r.tm_org_id ?? r.tm_orgId) as string | null,
      positionId: null,
      roleId: null,
      employeeId: null,
      gender: null,
      phone: null,
      status: Number(r.tm_status),
      joinedAt: (() => {
        const v = (r.tm_joined_at ?? r.tm_joinedAt) as Date | string;
        return v instanceof Date ? v.getTime() : new Date(v).getTime();
      })(),
    }));
  }

  async deleteMember(tenantId: string, userId: string): Promise<void> {
    await this.memberRepo.delete({ tenantId, userId });
  }
}
