import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AdminGroupEntity,
  AdminGroupMemberEntity,
  AdminGroupOrgEntity,
  AdminGroupRoleEntity,
} from '../database/entities/admin-console.entity';
import { AdminRoleEntity, UserAdminRoleEntity } from '../database/entities/admin.entity';
import { ADMIN_ROLE_CODES } from '../constants/rbac';
import { AdminRoleRepository } from './admin-role.repository';

/** 管理员的有效管理范围 */
export type AdminScope =
  | { type: 'all' }
  | { type: 'orgs'; orgIds: string[] }
  | { type: 'none' };

/**
 * 管理员「权限 + 管理范围」的统一解析入口（P0-3）。
 *
 * 职责边界：
 * - 权限与角色的解析复用 `AdminRoleRepository`（它已同时覆盖「直接授予」与「管理组」两条路径），
 *   本仓储只负责**管理范围**与**最后超管保护**——这两件事需要同时看到两条授予路径，
 *   放在任一单侧仓储都会造成双向依赖。
 * - 之所以单独成仓储：范围解析要跨 admin_groups / admin_group_orgs / user_admin_roles 三张表，
 *   且被内容治理台、用户管理等模块共用，不能藏在某个业务 service 里。
 *
 * 关联：docs/design/admin-console-p0-p1-design.md §2
 */
@Injectable()
export class AdminAccessRepository {
  constructor(
    @InjectRepository(AdminGroupEntity)
    private readonly groupRepo: Repository<AdminGroupEntity>,
    @InjectRepository(AdminGroupRoleEntity)
    private readonly groupRoleRepo: Repository<AdminGroupRoleEntity>,
    @InjectRepository(AdminGroupMemberEntity)
    private readonly groupMemberRepo: Repository<AdminGroupMemberEntity>,
    @InjectRepository(AdminGroupOrgEntity)
    private readonly groupOrgRepo: Repository<AdminGroupOrgEntity>,
    @InjectRepository(UserAdminRoleEntity)
    private readonly userRoleRepo: Repository<UserAdminRoleEntity>,
    @InjectRepository(AdminRoleEntity)
    private readonly roleRepo: Repository<AdminRoleEntity>,
    private readonly adminRoleRepository: AdminRoleRepository,
  ) {}

  // ---------------------------------------------------------------- 转调（保持调用方语义清晰）

  /** 有效权限 = 直接授予角色 ∪ 管理组角色（实现在 AdminRoleRepository，避免重复口径） */
  async getEffectivePermissions(userId: string): Promise<string[]> {
    return this.adminRoleRepository.getUserPermissions(userId);
  }

  async getEffectiveRoles(userId: string): Promise<Array<{ code: string; name: string }>> {
    return this.adminRoleRepository.getUserRoles(userId);
  }

  // ---------------------------------------------------------------- 范围解析

  /**
   * 管理范围解析规则：
   * 1. 持有「直接授予」的角色  → 全平台（与 user_admin_roles 的历史语义一致，保证向后兼容）
   * 2. 所在管理组 scope_type = 'all' → 全平台
   * 3. 否则按管理组挂的部门取并集；include_children=true 的部门递归展开子树
   * 4. 无任何授予 → none
   */
  async getAdminScope(userId: string): Promise<AdminScope> {
    if (!userId) return { type: 'none' };

    const direct = await this.userRoleRepo.count({ where: { userId } });
    if (direct > 0) return { type: 'all' };

    const groups = await this.groupsOfUser(userId);
    if (!groups.length) return { type: 'none' };
    if (groups.some((g) => g.scopeType === 'all')) return { type: 'all' };

    const orgRows = await this.groupOrgRepo.find({
      where: { groupId: In(groups.map((g) => g.id)) },
    });
    const exact = orgRows.filter((r) => !r.includeChildren).map((r) => r.orgId);
    const expand = orgRows.filter((r) => r.includeChildren).map((r) => r.orgId);

    const expanded = await this.expandOrgSubtree(expand);
    const orgIds = [...new Set([...exact, ...expanded])];
    return { type: 'orgs', orgIds };
  }

  async groupsOfUser(userId: string): Promise<AdminGroupEntity[]> {
    return this.groupRepo
      .createQueryBuilder('g')
      .innerJoin(AdminGroupMemberEntity, 'agm', 'agm.groupId = g.id')
      .where('agm.userId = :userId', { userId })
      .orderBy('g.createdAt', 'ASC')
      .getMany();
  }

  /** 递归展开部门子树（含自身）。空数组直接返回，避免无谓查询 */
  async expandOrgSubtree(rootOrgIds: string[]): Promise<string[]> {
    const roots = [...new Set(rootOrgIds.filter(Boolean))];
    if (!roots.length) return [];
    const rows = await this.groupOrgRepo.query(
      `WITH RECURSIVE sub AS (
         SELECT id FROM organizations WHERE id = ANY($1::varchar[])
         UNION ALL
         SELECT o.id FROM organizations o JOIN sub ON o.parent_id = sub.id
       )
       SELECT DISTINCT id FROM sub`,
      [roots],
    );
    return rows.map((r: { id: string }) => r.id);
  }

  // ---------------------------------------------------------------- 最后超管保护

  /**
   * 列出持有 super_admin 的用户 ID。
   * @param excludeGroupId 计算时忽略该管理组带来的授权（用于「删除管理组」前的前置校验）
   */
  async listSuperAdminUserIds(excludeGroupId?: string): Promise<string[]> {
    const rows: Array<{ user_id: string }> = await this.userRoleRepo.query(
      `SELECT DISTINCT uar."user_id" AS user_id
         FROM "user_admin_roles" uar
         JOIN "admin_roles" r ON r.id = uar."role_id"
        WHERE r.code = $1
        UNION
       SELECT DISTINCT agm."user_id" AS user_id
         FROM "admin_group_members" agm
         JOIN "admin_group_roles" agr ON agr."group_id" = agm."group_id"
         JOIN "admin_roles" r ON r.id = agr."role_id"
        WHERE r.code = $1
          AND ($2::text IS NULL OR agm."group_id" <> $2)`,
      [ADMIN_ROLE_CODES.SUPER_ADMIN, excludeGroupId ?? null],
    );
    return rows.map((r) => r.user_id);
  }

  /** 移除某管理员后是否仍有超管 */
  async hasOtherSuperAdmin(targetUserId: string): Promise<boolean> {
    const ids = await this.listSuperAdminUserIds();
    return ids.some((id) => id !== targetUserId);
  }

  /** 删除某管理组后是否仍有超管 */
  async hasSuperAdminAfterGroupRemoval(groupId: string): Promise<boolean> {
    const ids = await this.listSuperAdminUserIds(groupId);
    return ids.length > 0;
  }

  /** 该管理组当前是否授予了 super_admin */
  async groupGrantsSuperAdmin(groupId: string): Promise<boolean> {
    const count = await this.groupRoleRepo
      .createQueryBuilder('agr')
      .innerJoin(AdminRoleEntity, 'r', 'r.id = agr.roleId')
      .where('agr.groupId = :groupId', { groupId })
      .andWhere('r.code = :code', { code: ADMIN_ROLE_CODES.SUPER_ADMIN })
      .getCount();
    return count > 0;
  }

  /** 目标角色是否是系统超管角色（用于「改角色权限」保护） */
  async isSuperAdminRole(roleId: string): Promise<boolean> {
    const role = await this.roleRepo.findOne({ where: { id: roleId }, select: ['code'] });
    return role?.code === ADMIN_ROLE_CODES.SUPER_ADMIN;
  }
}
