import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  AdminGroupEntity,
  AdminGroupMemberEntity,
  AdminGroupOrgEntity,
  AdminGroupRoleEntity,
} from '../database/entities/admin-console.entity';
import { AdminRoleEntity, UserAdminRoleEntity } from '../database/entities/admin.entity';
import { OrganizationEntity } from '../database/entities/tenant.entity';
import { UserEntity } from '../database/entities/user.entity';

export interface AdminGroupDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  scopeType: 'all' | 'org';
  isSystem: boolean;
  memberCount: number;
  /** 成员用户 ID 列表。必须返回，否则前端「覆盖式保存成员」会因初始值为空而误清空成员 */
  memberIds: string[];
  roles: Array<{ id: string; code: string; name: string }>;
  orgs: Array<{ id: string; name: string; includeChildren: boolean }>;
  createdAt: number;
  updatedAt: number;
}

/**
 * 管理组仓储（P0-3）：成员 + 角色 + 管理范围。
 * 权限与范围的解析不在此处，见 AdminAccessRepository。
 */
@Injectable()
export class AdminGroupRepository {
  constructor(
    @InjectRepository(AdminGroupEntity)
    private readonly groupRepo: Repository<AdminGroupEntity>,
    @InjectRepository(AdminGroupRoleEntity)
    private readonly groupRoleRepo: Repository<AdminGroupRoleEntity>,
    @InjectRepository(AdminGroupMemberEntity)
    private readonly groupMemberRepo: Repository<AdminGroupMemberEntity>,
    @InjectRepository(AdminGroupOrgEntity)
    private readonly groupOrgRepo: Repository<AdminGroupOrgEntity>,
    @InjectRepository(AdminRoleEntity)
    private readonly roleRepo: Repository<AdminRoleEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(UserAdminRoleEntity)
    private readonly userRoleRepo: Repository<UserAdminRoleEntity>,
  ) {}

  async list(): Promise<AdminGroupDto[]> {
    const groups = await this.groupRepo.find({ order: { createdAt: 'ASC' } });
    if (!groups.length) return [];
    const ids = groups.map((g) => g.id);

    const [roleRows, memberRows, orgRows] = await Promise.all([
      this.groupRoleRepo
        .createQueryBuilder('agr')
        .innerJoin(AdminRoleEntity, 'r', 'r.id = agr.roleId')
        .select('agr.groupId', 'group_id')
        .addSelect('r.id', 'role_id')
        .addSelect('r.code', 'role_code')
        .addSelect('r.name', 'role_name')
        .where('agr.groupId IN (:...ids)', { ids })
        .getRawMany<{ group_id: string; role_id: string; role_code: string; role_name: string }>(),
      this.groupMemberRepo
        .createQueryBuilder('agm')
        .select('agm.groupId', 'group_id')
        .addSelect('agm.userId', 'user_id')
        .where('agm.groupId IN (:...ids)', { ids })
        .getRawMany<{ group_id: string; user_id: string }>(),
      this.groupOrgRepo
        .createQueryBuilder('ago')
        .innerJoin(OrganizationEntity, 'o', 'o.id = ago.orgId')
        .select('ago.groupId', 'group_id')
        .addSelect('ago.orgId', 'org_id')
        .addSelect('ago.includeChildren', 'include_children')
        .addSelect('o.name', 'org_name')
        .where('ago.groupId IN (:...ids)', { ids })
        .getRawMany<{ group_id: string; org_id: string; include_children: boolean; org_name: string }>(),
    ]);

    const roleMap = new Map<string, AdminGroupDto['roles']>();
    for (const r of roleRows) {
      const list = roleMap.get(r.group_id) ?? [];
      list.push({ id: r.role_id, code: r.role_code, name: r.role_name });
      roleMap.set(r.group_id, list);
    }

    const memberCountMap = new Map<string, number>();
    const memberIdsMap = new Map<string, string[]>();
    for (const m of memberRows) {
      memberCountMap.set(m.group_id, (memberCountMap.get(m.group_id) ?? 0) + 1);
      const ids = memberIdsMap.get(m.group_id) ?? [];
      ids.push(m.user_id);
      memberIdsMap.set(m.group_id, ids);
    }

    const orgMap = new Map<string, AdminGroupDto['orgs']>();
    for (const o of orgRows) {
      const list = orgMap.get(o.group_id) ?? [];
      list.push({ id: o.org_id, name: o.org_name, includeChildren: o.include_children === true });
      orgMap.set(o.group_id, list);
    }

    return groups.map((g) => ({
      id: g.id,
      code: g.code,
      name: g.name,
      description: g.description,
      scopeType: g.scopeType,
      isSystem: g.isSystem,
      memberCount: memberCountMap.get(g.id) ?? 0,
      memberIds: memberIdsMap.get(g.id) ?? [],
      roles: roleMap.get(g.id) ?? [],
      orgs: orgMap.get(g.id) ?? [],
      createdAt: g.createdAt instanceof Date ? g.createdAt.getTime() : new Date(g.createdAt).getTime(),
      updatedAt: g.updatedAt instanceof Date ? g.updatedAt.getTime() : new Date(g.updatedAt).getTime(),
    }));
  }

  async findById(id: string): Promise<AdminGroupDto | null> {
    const all = await this.list();
    return all.find((g) => g.id === id) ?? null;
  }

  async findByCode(code: string): Promise<AdminGroupEntity | null> {
    return this.groupRepo.findOne({ where: { code } });
  }

  async create(input: {
    code: string;
    name: string;
    description?: string | null;
    scopeType: 'all' | 'org';
    createdBy: string;
  }): Promise<AdminGroupDto> {
    const entity = await this.groupRepo.save({
      id: uuidv4(),
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      scopeType: input.scopeType,
      isSystem: false,
      createdBy: input.createdBy,
    });
    return (await this.findById(entity.id))!;
  }

  async update(
    id: string,
    patch: { name?: string; description?: string | null; scopeType?: 'all' | 'org' },
  ): Promise<AdminGroupDto | null> {
    const entity = await this.groupRepo.findOne({ where: { id } });
    if (!entity) return null;
    if (patch.name !== undefined) entity.name = patch.name;
    if (patch.description !== undefined) entity.description = patch.description;
    if (patch.scopeType !== undefined) entity.scopeType = patch.scopeType;
    await this.groupRepo.save(entity);
    return this.findById(id);
  }

  async remove(id: string): Promise<void> {
    // 关联表均为 ON DELETE CASCADE，删主表即可
    await this.groupRepo.delete({ id });
  }

  /** 覆盖式设置角色集合 */
  async setRoles(groupId: string, roleIds: string[]): Promise<void> {
    await this.groupRoleRepo.delete({ groupId });
    const unique = [...new Set(roleIds.filter(Boolean))];
    if (!unique.length) return;
    await this.groupRoleRepo.save(unique.map((roleId) => ({ groupId, roleId })));
  }

  /** 覆盖式设置成员集合 */
  async setMembers(groupId: string, userIds: string[], grantedBy: string): Promise<void> {
    await this.groupMemberRepo.delete({ groupId });
    const unique = [...new Set(userIds.filter(Boolean))];
    if (!unique.length) return;
    await this.groupMemberRepo.save(
      unique.map((userId) => ({ groupId, userId, grantedBy })),
    );
  }

  /** 覆盖式设置管理范围部门 */
  async setOrgs(
    groupId: string,
    orgs: Array<{ orgId: string; includeChildren: boolean }>,
  ): Promise<void> {
    await this.groupOrgRepo.delete({ groupId });
    const dedup = new Map<string, boolean>();
    for (const o of orgs) if (o.orgId) dedup.set(o.orgId, o.includeChildren !== false);
    if (!dedup.size) return;
    await this.groupOrgRepo.save(
      [...dedup.entries()].map(([orgId, includeChildren]) => ({ groupId, orgId, includeChildren })),
    );
  }

  /** 校验用户 ID 是否存在且为管理员（用于成员集合写入前的存在性校验） */
  async filterExistingAdminUserIds(userIds: string[]): Promise<string[]> {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (!unique.length) return [];
    const admins = await this.userRoleRepo
      .createQueryBuilder('uar')
      .where('uar.userId IN (:...unique)', { unique })
      .select('DISTINCT uar.userId', 'userId')
      .getRawMany<{ userId: string }>();
    const adminIds = new Set(admins.map((a) => a.userId));
    // 管理组成员必须是「管理员账号」，否则权限解析会漏掉其 hasTenantAdmin 判定
    const users = await this.userRepo.find({ where: { id: In(unique) }, select: ['id', 'userType'] });
    return users
      .filter((u) => u.userType === 'admin' || adminIds.has(u.id))
      .map((u) => u.id);
  }

  async filterExistingOrgIds(orgIds: string[]): Promise<string[]> {
    const unique = [...new Set(orgIds.filter(Boolean))];
    if (!unique.length) return [];
    const rows = await this.orgRepo.find({ where: { id: In(unique) }, select: ['id'] });
    return rows.map((r) => r.id);
  }

  /** 管理组是否被引用（当前无引用表，预留给后续 D10 的套餐/应用可见范围） */
  async isReferenced(): Promise<boolean> {
    return false;
  }
}
