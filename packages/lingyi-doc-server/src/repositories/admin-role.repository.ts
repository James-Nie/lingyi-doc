import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  AdminPermissionEntity,
  AdminRoleEntity,
  AdminRolePermissionEntity,
  UserAdminRoleEntity,
} from '../database/entities/admin.entity';
import {
  ADMIN_ROLE_CODES,
  ALL_PERMISSIONS,
  ROLE_PERMISSION_MAP,
} from '../constants/rbac';
import type { DbAdminRole } from '../types/database';

function toDbAdminRole(entity: AdminRoleEntity): DbAdminRole {
  return {
    id: entity.id,
    code: entity.code,
    name: entity.name,
    description: entity.description,
    is_system: entity.isSystem,
    created_at: entity.createdAt,
  };
}

@Injectable()
export class AdminRoleRepository {
  constructor(
    @InjectRepository(AdminRoleEntity)
    private readonly roleRepo: Repository<AdminRoleEntity>,
    @InjectRepository(AdminPermissionEntity)
    private readonly permRepo: Repository<AdminPermissionEntity>,
    @InjectRepository(AdminRolePermissionEntity)
    private readonly rolePermRepo: Repository<AdminRolePermissionEntity>,
    @InjectRepository(UserAdminRoleEntity)
    private readonly userRoleRepo: Repository<UserAdminRoleEntity>,
  ) {}

  async seedDefaults(): Promise<void> {
    const roleDefs = [
      { code: ADMIN_ROLE_CODES.SUPER_ADMIN, name: '超级管理员', description: '拥有全部权限' },
      { code: ADMIN_ROLE_CODES.OPERATOR, name: '运营', description: '用户与配置管理' },
      { code: ADMIN_ROLE_CODES.SUPPORT, name: '客服', description: '用户支持与密码重置' },
      { code: ADMIN_ROLE_CODES.AUDITOR, name: '审计员', description: '只读审计与报表' },
    ];

    const roleIdByCode = new Map<string, string>();

    for (const role of roleDefs) {
      const existing = await this.findByCode(role.code);
      if (existing) {
        roleIdByCode.set(role.code, existing.id);
        continue;
      }
      const id = uuidv4();
      await this.roleRepo.save({
        id,
        code: role.code,
        name: role.name,
        description: role.description,
        isSystem: 1,
      });
      roleIdByCode.set(role.code, id);
    }

    const permIdByCode = new Map<string, string>();
    for (const perm of ALL_PERMISSIONS) {
      const existing = await this.findPermissionByCode(perm.code);
      if (existing) {
        permIdByCode.set(perm.code, existing.id);
        continue;
      }
      const id = uuidv4();
      await this.permRepo.save({
        id,
        code: perm.code,
        name: perm.name,
        module: perm.module,
      });
      permIdByCode.set(perm.code, id);
    }

    for (const [roleCode, permCodes] of Object.entries(ROLE_PERMISSION_MAP)) {
      const roleId = roleIdByCode.get(roleCode);
      if (!roleId) continue;
      for (const permCode of permCodes) {
        const permId = permIdByCode.get(permCode);
        if (!permId) continue;
        await this.rolePermRepo
          .createQueryBuilder()
          .insert()
          .into(AdminRolePermissionEntity)
          .values({ roleId, permissionId: permId })
          .orIgnore()
          .execute();
      }
    }
  }

  async findByCode(code: string): Promise<DbAdminRole | null> {
    const entity = await this.roleRepo.findOne({ where: { code } });
    return entity ? toDbAdminRole(entity) : null;
  }

  async findPermissionByCode(code: string): Promise<{ id: string; code: string } | null> {
    const entity = await this.permRepo.findOne({
      where: { code },
      select: ['id', 'code'],
    });
    return entity ? { id: entity.id, code: entity.code } : null;
  }

  async listRoles(): Promise<Array<{ id: string; code: string; name: string; description: string | null }>> {
    const entities = await this.roleRepo.find({
      select: ['id', 'code', 'name', 'description'],
      order: { createdAt: 'ASC' },
    });
    return entities.map((e) => ({
      id: e.id,
      code: e.code,
      name: e.name,
      description: e.description,
    }));
  }

  async getUserRoles(userId: string): Promise<Array<{ code: string; name: string }>> {
    const rows = await this.userRoleRepo
      .createQueryBuilder('uar')
      .innerJoin(AdminRoleEntity, 'r', 'r.id = uar.roleId')
      .where('uar.userId = :userId', { userId })
      .select(['r.code', 'r.name'])
      .getRawMany<{ r_code: string; r_name: string }>();

    return rows.map((r) => ({ code: r.r_code, name: r.r_name }));
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const rows = await this.userRoleRepo
      .createQueryBuilder('uar')
      .innerJoin(AdminRolePermissionEntity, 'arp', 'arp.roleId = uar.roleId')
      .innerJoin(AdminPermissionEntity, 'p', 'p.id = arp.permissionId')
      .where('uar.userId = :userId', { userId })
      .select('DISTINCT p.code', 'code')
      .getRawMany<{ code: string }>();

    return rows.map((r) => r.code);
  }

  async assignRole(userId: string, roleCode: string, grantedBy: string): Promise<void> {
    const role = await this.findByCode(roleCode);
    if (!role) throw new Error(`角色不存在: ${roleCode}`);
    await this.userRoleRepo
      .createQueryBuilder()
      .insert()
      .into(UserAdminRoleEntity)
      .values({ userId, roleId: role.id, grantedBy })
      .orIgnore()
      .execute();
  }

  async removeAllRoles(userId: string): Promise<void> {
    await this.userRoleRepo.delete({ userId });
  }
}
