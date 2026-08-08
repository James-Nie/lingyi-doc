import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TenantMemberEntity, TenantRoleEntity } from '../database/entities/tenant.entity';
import { PERMISSIONS } from '../constants/rbac';

export interface TenantRoleNode {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  systemRole: number | null;
  sortOrder: number;
  memberCount?: number;
}

/**
 * 租户级内置角色只保留「管理员」与「成员」。
 * 租户内的「超管」概念已下线：原 tenant_role=1 不再作为租户级角色，
 * 平台超管仅通过 user_admin_roles（userType=admin）授予。
 */
const BUILTIN_ROLE_DEFS: Array<{
  systemRole: number;
  name: string;
  description: string;
  permissions: string[];
  sortOrder: number;
}> = [
  {
    systemRole: 2,
    name: '管理员',
    description: '可管理组织与成员，协助日常运营。',
    permissions: [
      PERMISSIONS.TENANT_ORG_READ,
      PERMISSIONS.TENANT_ORG_WRITE,
      PERMISSIONS.TENANT_MEMBER_READ,
      PERMISSIONS.TENANT_MEMBER_WRITE,
    ],
    sortOrder: 1,
  },
  {
    systemRole: 3,
    name: '成员',
    description: '普通成员，使用业务功能，无管理后台权限。',
    permissions: [],
    sortOrder: 2,
  },
];

function toRoleNode(entity: TenantRoleEntity, memberCount = 0): TenantRoleNode {
  return {
    id: entity.id,
    tenantId: entity.tenantId,
    name: entity.name,
    description: entity.description,
    permissions: Array.isArray(entity.permissions) ? entity.permissions : [],
    isSystem: entity.isSystem === 1,
    systemRole: entity.systemRole,
    sortOrder: entity.sortOrder,
    memberCount,
  };
}

@Injectable()
export class TenantRoleRepository {
  constructor(
    @InjectRepository(TenantRoleEntity)
    private readonly roleRepo: Repository<TenantRoleEntity>,
    @InjectRepository(TenantMemberEntity)
    private readonly memberRepo: Repository<TenantMemberEntity>,
  ) {}

  async ensureBuiltinRoles(tenantId: string): Promise<void> {
    const count = await this.roleRepo.count({ where: { tenantId } });
    if (count > 0) {
      await this.backfillMemberRoleIds(tenantId);
      return;
    }

    const roleIdBySystemRole = new Map<number, string>();
    for (const def of BUILTIN_ROLE_DEFS) {
      const id = uuidv4();
      roleIdBySystemRole.set(def.systemRole, id);
      await this.roleRepo.save({
        id,
        tenantId,
        name: def.name,
        description: def.description,
        permissions: def.permissions,
        isSystem: 1,
        systemRole: def.systemRole,
        sortOrder: def.sortOrder,
      });
    }

    const members = await this.memberRepo.find({ where: { tenantId } });
    for (const member of members) {
      // 原 tenantRole=1（租户内超管）已下线，回填时统一落到「管理员」；
      // 找不到匹配的内置角色时再兜底为「成员」。
      const roleId =
        roleIdBySystemRole.get(member.tenantRole)
        ?? roleIdBySystemRole.get(2)
        ?? roleIdBySystemRole.get(3)!;
      await this.memberRepo.update(
        { tenantId, userId: member.userId },
        { roleId },
      );
    }
  }

  async backfillMemberRoleIds(tenantId: string): Promise<void> {
    const roles = await this.roleRepo.find({ where: { tenantId, isSystem: 1 } });
    const roleIdBySystemRole = new Map(
      roles.filter(r => r.systemRole != null).map(r => [r.systemRole!, r.id]),
    );
    if (!roleIdBySystemRole.size) return;

    const members = await this.memberRepo.find({ where: { tenantId } });
    for (const member of members) {
      if (member.roleId) continue;
      const roleId =
        roleIdBySystemRole.get(member.tenantRole)
        ?? roleIdBySystemRole.get(2)
        ?? roleIdBySystemRole.get(3);
      if (roleId) {
        await this.memberRepo.update({ tenantId, userId: member.userId }, { roleId });
      }
    }
  }

  async listByTenant(tenantId: string): Promise<TenantRoleNode[]> {
    await this.ensureBuiltinRoles(tenantId);
    const roles = await this.roleRepo.find({
      where: { tenantId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    const members = await this.memberRepo.find({ where: { tenantId, status: 1 } });
    const countMap = new Map<string, number>();
    for (const m of members) {
      if (m.roleId) countMap.set(m.roleId, (countMap.get(m.roleId) ?? 0) + 1);
    }
    return roles.map(r => toRoleNode(r, countMap.get(r.id) ?? 0));
  }

  async findById(tenantId: string, roleId: string): Promise<TenantRoleEntity | null> {
    return this.roleRepo.findOne({ where: { id: roleId, tenantId } });
  }

  async findMemberRole(tenantId: string): Promise<TenantRoleEntity | null> {
    return this.roleRepo.findOne({ where: { tenantId, systemRole: 3, isSystem: 1 } });
  }

  async create(input: {
    tenantId: string;
    name: string;
    description?: string | null;
    permissions?: string[];
  }): Promise<TenantRoleNode> {
    const id = uuidv4();
    const sortOrder = await this.roleRepo.count({ where: { tenantId: input.tenantId } });
    await this.roleRepo.save({
      id,
      tenantId: input.tenantId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      permissions: input.permissions ?? [],
      isSystem: 0,
      systemRole: null,
      sortOrder,
    });
    const entity = await this.roleRepo.findOne({ where: { id } });
    if (!entity) throw new Error('创建角色失败');
    return toRoleNode(entity, 0);
  }

  async update(
    tenantId: string,
    roleId: string,
    patch: { name?: string; description?: string | null; permissions?: string[] },
  ): Promise<TenantRoleEntity | null> {
    const entity = await this.findById(tenantId, roleId);
    if (!entity) return null;
    if (patch.name !== undefined && !entity.isSystem) entity.name = patch.name.trim();
    if (patch.description !== undefined) entity.description = patch.description?.trim() || null;
    if (patch.permissions !== undefined) entity.permissions = patch.permissions;
    return this.roleRepo.save(entity);
  }

  async delete(tenantId: string, roleId: string): Promise<boolean> {
    const entity = await this.findById(tenantId, roleId);
    if (!entity || entity.isSystem) return false;
    await this.roleRepo.delete({ id: roleId, tenantId });
    return true;
  }

  /** 用户在指定租户下所属角色的权限集合（无下属角色时返回空数组） */
  async getUserTenantPermissions(userId: string, tenantId: string): Promise<string[]> {
    const member = await this.memberRepo.findOne({ where: { tenantId, userId, status: 1 } });
    if (!member || !member.roleId) return [];
    const role = await this.roleRepo.findOne({ where: { id: member.roleId, tenantId } });
    if (!role) return [];
    return Array.isArray(role.permissions) ? role.permissions : [];
  }
}
