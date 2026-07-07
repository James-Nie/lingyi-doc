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
    tenantRole?: TenantRole;
  }): Promise<void> {
    const existing = await this.memberRepo.findOne({
      where: { tenantId: input.tenantId, userId: input.userId },
    });
    if (existing) {
      await this.memberRepo.update(
        { tenantId: input.tenantId, userId: input.userId },
        {
          status: 1,
          orgId: input.orgId ?? null,
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
      tenantRole: input.tenantRole ?? 3,
      status: 1,
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
      status: Number(r.tm_status),
      joinedAt: (() => {
        const v = (r.tm_joined_at ?? r.tm_joinedAt) as Date | string;
        return v instanceof Date ? v.getTime() : new Date(v).getTime();
      })(),
    }));
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
}
