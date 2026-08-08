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
        isSystem: true,
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
    const map = await this.getUsersRoles([userId]);
    return map.get(userId) ?? [];
  }

  async getUsersRoles(
    userIds: string[],
  ): Promise<Map<string, Array<{ code: string; name: string }>>> {
    const unique = [...new Set(userIds.filter(Boolean))];
    const map = new Map<string, Array<{ code: string; name: string }>>();
    for (const id of unique) map.set(id, []);
    if (!unique.length) return map;

    const rows = await this.userRoleRepo
      .createQueryBuilder('uar')
      .innerJoin(AdminRoleEntity, 'r', 'r.id = uar.roleId')
      .where('uar.userId IN (:...userIds)', { userIds: unique })
      .select(['uar.userId', 'r.code', 'r.name'])
      .getRawMany<{ uar_user_id?: string; uar_userId?: string; r_code: string; r_name: string }>();

    for (const row of rows) {
      const userId = row.uar_user_id ?? row.uar_userId;
      if (!userId) continue;
      const list = map.get(userId) ?? [];
      list.push({ code: row.r_code, name: row.r_name });
      map.set(userId, list);
    }
    return map;
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

  async listAdminUserIds(
    limit: number,
    offset: number,
  ): Promise<{ userIds: string[]; total: number }> {
    // 子查询统计总数
    const countResult = await this.userRoleRepo.query(
      `SELECT COUNT(DISTINCT "user_id") AS "total" FROM "user_admin_roles"`,
    );
    const total = parseInt(countResult?.[0]?.total ?? '0', 10);

    // GROUP BY + MAX 排序避免 DISTINCT + ORDER BY 冲突
    const rows = await this.userRoleRepo.query(
      `SELECT "user_id" AS "userId" FROM "user_admin_roles"
       GROUP BY "user_id" ORDER BY MAX("granted_at") DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    return {
      userIds: rows.map((r: { userId: string }) => r.userId),
      total,
    };
  }
}
