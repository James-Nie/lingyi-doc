import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { OrganizationEntity, TenantEntity, TenantMemberEntity, TenantRoleEntity } from '../database/entities/tenant.entity';
import { DeployService } from '../config/deploy.service';
import type { UserSource } from '../types/database';
import type { DbTenant, TenantSummary } from '../types/session';
import { TENANT_BACKEND_PERMISSIONS } from '../constants/rbac';

function toDbTenant(entity: TenantEntity): DbTenant {
  return {
    id: entity.id,
    name: entity.name,
    status: entity.status,
    admin_user_id: entity.adminUserId,
    deploy_type: entity.deployType,
    is_physical_isolate: entity.isPhysicalIsolate,
    account_mode: entity.accountMode,
    is_allow_multi_switch: entity.isAllowMultiSwitch,
    db_instance_id: entity.dbInstanceId,
    storage_cluster_id: entity.storageClusterId,
    private_config: entity.privateConfig,
    created_at: entity.createdAt,
    updated_at: entity.updatedAt,
  };
}

function parsePermissions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.length) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toTenantSummary(row: {
  id: string;
  name: string;
  isAllowMultiSwitch: number;
  tenantRole: number;
  permissions: string[] | null;
}): TenantSummary {
  return {
    id: row.id,
    name: row.name,
    tenantRole: (row.tenantRole ?? 3) as TenantSummary['tenantRole'],
    isAllowMultiSwitch: row.isAllowMultiSwitch === 1,
    permissions: parsePermissions(row.permissions),
  };
}

@Injectable()
export class TenantRepository {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly deployService: DeployService,
  ) {}

  async findById(id: string): Promise<DbTenant | null> {
    const entity = await this.tenantRepo.findOne({ where: { id } });
    return entity ? toDbTenant(entity) : null;
  }

  async findEntityById(id: string): Promise<TenantEntity | null> {
    return this.tenantRepo.findOne({ where: { id } });
  }

  async updateMembership(
    tenantId: string,
    patch: { teamPlan?: number; teamVipExpireAt?: Date | null },
  ): Promise<void> {
    await this.tenantRepo.update(tenantId, patch);
  }

  async countAll(): Promise<number> {
    return this.tenantRepo.count({ where: { status: 1 } });
  }

  async listForUser(userId: string): Promise<TenantSummary[]> {
    const rows = await this.tenantRepo
      .createQueryBuilder('t')
      .innerJoin('tenant_members', 'tm', 'tm.tenant_id = t.id')
      .leftJoin(TenantRoleEntity, 'tr', 'tr.id = tm.role_id AND tr.tenant_id = t.id')
      .where('tm.user_id = :userId', { userId })
      .andWhere('tm.status = 1')
      .andWhere('t.status = 1')
      .select([
        't.id AS id',
        't.name AS name',
        't.is_allow_multi_switch AS isAllowMultiSwitch',
        'tm.tenant_role AS tenantRole',
        'tr.permissions AS permissions',
      ])
      .orderBy('t.name', 'ASC')
      .getRawMany<{
        id: string;
        name: string;
        isAllowMultiSwitch: number;
        tenantRole: number;
        permissions: string[] | null;
      }>();

    return rows.map(toTenantSummary);
  }

  /** 用户在全部租户下所属角色含后台管理权限。这些账号在后台当前租户上下文内视为租户管理员 */
  async listUserBackendPermissions(userId: string): Promise<string[]> {
    const tenants = await this.listForUser(userId);
    const set = new Set<string>();
    for (const t of tenants) {
      for (const p of this.backendPermissions(t)) set.add(p);
    }
    return [...set];
  }

  private backendPermissions(tenant: TenantSummary): string[] {
    return (tenant.permissions ?? []).filter(p => TENANT_BACKEND_PERMISSIONS.includes(p));
  }

  async listAll(limit = 100, offset = 0): Promise<DbTenant[]> {
    const entities = await this.tenantRepo.find({
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });
    return entities.map(toDbTenant);
  }

  async create(input: {
    name: string;
    adminUserId: string;
    userSource: UserSource;
    teamPlan?: number;
    teamVipExpireAt?: Date | null;
  }): Promise<DbTenant> {
    const id = uuidv4();
    const name = input.name.trim();

    await this.dataSource.transaction(async (manager) => {
      await manager.save(TenantEntity, {
        id,
        name,
        status: 1,
        adminUserId: input.adminUserId,
        deployType: this.deployService.type,
        isPhysicalIsolate: this.deployService.isPrivate(),
        accountMode: this.deployService.accountMode,
        isAllowMultiSwitch: this.deployService.allowMultiTenantSwitch,
        teamPlan: input.teamPlan ?? 1,
        teamVipExpireAt: input.teamVipExpireAt ?? null,
      });

      const rootOrgId = uuidv4();
      await manager.save(OrganizationEntity, {
        id: rootOrgId,
        tenantId: id,
        parentId: null,
        name,
        sortOrder: 0,
      });

      await manager.save(TenantMemberEntity, {
        tenantId: id,
        userId: input.adminUserId,
        userSource: input.userSource,
        orgId: rootOrgId,
        tenantRole: 1,
        status: 1,
      });
    });

    const tenant = await this.findById(id);
    if (!tenant) throw new Error('创建租户失败');
    return tenant;
  }

  async ensureDefaultPrivateTenant(adminUserId?: string): Promise<DbTenant | null> {
    if (!this.deployService.isPrivate()) return null;

    const existingId = this.deployService.defaultTenantId;
    if (existingId) {
      const byId = await this.findById(existingId);
      if (byId) return byId;
    }

    const count = await this.countAll();
    if (count > 0) {
      const entities = await this.tenantRepo.find({
        order: { createdAt: 'ASC' },
        take: 1,
      });
      return entities[0] ? toDbTenant(entities[0]) : null;
    }

    const id = existingId || uuidv4();
    const name = this.deployService.defaultTenantName;

    await this.dataSource.transaction(async (manager) => {
      await manager.save(TenantEntity, {
        id,
        name,
        status: 1,
        adminUserId: adminUserId ?? null,
        deployType: this.deployService.type,
        isPhysicalIsolate: true,
        accountMode: this.deployService.accountMode,
        isAllowMultiSwitch: false,
      });

      const rootOrgId = uuidv4();
      await manager.save(OrganizationEntity, {
        id: rootOrgId,
        tenantId: id,
        parentId: null,
        name,
        sortOrder: 0,
      });

      if (adminUserId) {
        await manager.save(TenantMemberEntity, {
          tenantId: id,
          userId: adminUserId,
          userSource: this.deployService.defaultUserSource(),
          orgId: rootOrgId,
          tenantRole: 1,
          status: 1,
        });
      }
    });

    return this.findById(id);
  }
}
