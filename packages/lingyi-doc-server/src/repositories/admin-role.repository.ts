import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  AdminPermissionEntity,
  AdminRoleEntity,
  AdminRolePermissionEntity,
  UserAdminRoleEntity,
} from '../database/entities/admin.entity';
import { AdminGroupRoleEntity } from '../database/entities/admin-console.entity';
import {
  ADMIN_ROLE_CODES,
  ALL_PERMISSIONS,
  ROLE_PERMISSION_MAP,
  SUPER_ADMIN_ONLY_PERMISSIONS,
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
    @InjectRepository(AdminGroupRoleEntity)
    private readonly groupRoleRepo: Repository<AdminGroupRoleEntity>,
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
    const map = await this.resolveRolesForUsers([userId]);
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

  /**
   * 用户角色（去重）= 直接授予的角色 ∪ 所属管理组携带的角色。
   *
   * 批量版本供管理员列表使用。用 UNION 一次取回两条授予路径，
   * 避免 N+1；UNION 自带去重，同一角色经两条路径授予时只出现一次。
   */
  async resolveRolesForUsers(
    userIds: string[],
  ): Promise<Map<string, Array<{ code: string; name: string }>>> {
    const unique = [...new Set(userIds.filter(Boolean))];
    const map = new Map<string, Array<{ code: string; name: string }>>();
    for (const id of unique) map.set(id, []);
    if (!unique.length) return map;

    const rows: Array<{ user_id: string; code: string; name: string }> =
      await this.userRoleRepo.query(
        `SELECT uar."user_id" AS user_id, r.code, r.name
           FROM "user_admin_roles" uar
           JOIN "admin_roles" r ON r.id = uar."role_id"
          WHERE uar."user_id" = ANY($1::varchar[])
          UNION
         SELECT agm."user_id" AS user_id, r.code, r.name
           FROM "admin_group_members" agm
           JOIN "admin_group_roles" agr ON agr."group_id" = agm."group_id"
           JOIN "admin_roles" r ON r.id = agr."role_id"
          WHERE agm."user_id" = ANY($1::varchar[])`,
        [unique],
      );

    for (const row of rows) {
      const list = map.get(row.user_id);
      if (list) list.push({ code: row.code, name: row.name });
    }
    return map;
  }

  /** 用户有效权限 = 直接角色权限 ∪ 管理组角色权限（P0-3 管理组落地关键路径） */
  async getUserPermissions(userId: string): Promise<string[]> {
    const roleIds = await this.resolveRoleIds([userId]);
    if (!roleIds.length) return [];

    const rows = await this.rolePermRepo
      .createQueryBuilder('arp')
      .innerJoin(AdminPermissionEntity, 'p', 'p.id = arp.permissionId')
      .where('arp.roleId IN (:...roleIds)', { roleIds })
      .select('DISTINCT p.code', 'code')
      .getRawMany<{ code: string }>();

    return rows.map((r) => r.code);
  }

  /** 解析多个用户的有效角色 ID（直接授予 ∪ 管理组） */
  async resolveRoleIds(userIds: string[]): Promise<string[]> {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (!unique.length) return [];

    const rows: Array<{ role_id: string }> = await this.userRoleRepo.query(
      `SELECT uar."role_id" AS role_id
         FROM "user_admin_roles" uar
        WHERE uar."user_id" = ANY($1::varchar[])
        UNION
       SELECT agr."role_id" AS role_id
         FROM "admin_group_members" agm
         JOIN "admin_group_roles" agr ON agr."group_id" = agm."group_id"
        WHERE agm."user_id" = ANY($1::varchar[])`,
      [unique],
    );
    return [...new Set(rows.map((r) => r.role_id))];
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

  // ================================================================
  // P0-3：自定义角色 CRUD 与角色引用统计
  // ================================================================

  /** 权限点目录（按 module 分组），供前端权限勾选面板使用 */
  async listPermissionCatalog(): Promise<
    Array<{ code: string; name: string; module: string }>
  > {
    const rows = await this.permRepo.find({
      select: ['code', 'name', 'module'],
      order: { module: 'ASC', code: 'ASC' },
    });
    return rows.map((r) => ({ code: r.code, name: r.name, module: r.module }));
  }

  /** 角色列表（含权限点、直接授予人数、被管理组引用数） */
  async listRolesDetailed(): Promise<
    Array<{
      id: string;
      code: string;
      name: string;
      description: string | null;
      isSystem: boolean;
      permissions: string[];
      userCount: number;
      groupCount: number;
      memberCount: number;
    }>
  > {
    const roles = await this.roleRepo.find({ order: { createdAt: 'ASC' } });
    if (!roles.length) return [];
    const roleIds = roles.map((r) => r.id);

    const permRows = await this.rolePermRepo
      .createQueryBuilder('arp')
      .innerJoin(AdminPermissionEntity, 'p', 'p.id = arp.permissionId')
      .select('arp.roleId', 'role_id')
      .addSelect('p.code', 'code')
      .where('arp.roleId IN (:...roleIds)', { roleIds })
      .getRawMany<{ role_id: string; code: string }>();

    const permMap = new Map<string, string[]>();
    for (const row of permRows) {
      const list = permMap.get(row.role_id) ?? [];
      list.push(row.code);
      permMap.set(row.role_id, list);
    }

    const userRows = await this.userRoleRepo
      .createQueryBuilder('uar')
      .select('uar.roleId', 'role_id')
      .addSelect('uar.userId', 'user_id')
      .where('uar.roleId IN (:...roleIds)', { roleIds })
      .getRawMany<{ role_id: string; user_id: string }>();

    const directUsers = new Map<string, Set<string>>();
    for (const row of userRows) {
      const set = directUsers.get(row.role_id) ?? new Set<string>();
      set.add(row.user_id);
      directUsers.set(row.role_id, set);
    }

    const groupRows = await this.groupRoleRepo
      .createQueryBuilder('agr')
      .select('agr.roleId', 'role_id')
      .addSelect('agr.groupId', 'group_id')
      .where('agr.roleId IN (:...roleIds)', { roleIds })
      .getRawMany<{ role_id: string; group_id: string }>();

    const groupMap = new Map<string, Set<string>>();
    for (const row of groupRows) {
      const set = groupMap.get(row.role_id) ?? new Set<string>();
      set.add(row.group_id);
      groupMap.set(row.role_id, set);
    }

    return roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: permMap.get(r.id) ?? [],
      userCount: directUsers.get(r.id)?.size ?? 0,
      groupCount: groupMap.get(r.id)?.size ?? 0,
      // memberCount 供前端展示「影响多少管理员」；此处只含直接授予人数，
      // 管理组成员数在列表页由 groupCount 单独提示，避免误导性的求和
      memberCount: directUsers.get(r.id)?.size ?? 0,
    }));
  }

  async findRoleById(id: string): Promise<DbAdminRole | null> {
    const entity = await this.roleRepo.findOne({ where: { id } });
    return entity ? toDbAdminRole(entity) : null;
  }

  /**
   * 自定义角色允许持有的权限点。
   * 等保三级 8.1.4.2 d) 最小权限/权限分离：高危权限不下放给自定义角色，
   * 违规项直接剔除而不是报错，保证「勾选面板」与「存储结果」不会不一致。
   */
  sanitizeCustomRolePermissions(codes: string[]): { accepted: string[]; rejected: string[] } {
    const rejected = codes.filter((c) => SUPER_ADMIN_ONLY_PERMISSIONS.includes(c));
    return { accepted: codes.filter((c) => !SUPER_ADMIN_ONLY_PERMISSIONS.includes(c)), rejected };
  }

  async createRole(input: {
    code: string;
    name: string;
    description?: string | null;
    permissionCodes: string[];
  }): Promise<string> {
    const id = uuidv4();
    await this.roleRepo.save({
      id,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      isSystem: false,
    });
    await this.setRolePermissions(id, input.permissionCodes);
    return id;
  }

  async updateRole(
    id: string,
    patch: { name?: string; description?: string | null; permissionCodes?: string[] },
  ): Promise<void> {
    const entity = await this.roleRepo.findOne({ where: { id } });
    if (!entity) return;
    if (patch.name !== undefined) entity.name = patch.name;
    if (patch.description !== undefined) entity.description = patch.description;
    await this.roleRepo.save(entity);
    if (patch.permissionCodes !== undefined) {
      await this.setRolePermissions(id, patch.permissionCodes);
    }
  }

  async deleteRole(id: string): Promise<void> {
    await this.rolePermRepo.delete({ roleId: id });
    await this.roleRepo.delete({ id });
  }

  /** 覆盖式设置角色权限点；未知 code 静默忽略（种子未跑时的容错） */
  async setRolePermissions(roleId: string, codes: string[]): Promise<void> {
    await this.rolePermRepo.delete({ roleId });
    const unique = [...new Set(codes.filter(Boolean))];
    if (!unique.length) return;

    const perms = await this.permRepo.find({
      where: { code: In(unique) },
      select: ['id', 'code'],
    });
    if (!perms.length) return;
    await this.rolePermRepo
      .createQueryBuilder()
      .insert()
      .into(AdminRolePermissionEntity)
      .values(perms.map((p) => ({ roleId, permissionId: p.id })))
      .orIgnore()
      .execute();
  }

  /** 角色是否被引用（有直接授予的用户，或被管理组引用） */
  async isRoleReferenced(roleId: string): Promise<{ users: number; groups: number }> {
    const [users, groups] = await Promise.all([
      this.userRoleRepo.count({ where: { roleId } }),
      this.groupRoleRepo.count({ where: { roleId } }),
    ]);
    return { users, groups };
  }
}
