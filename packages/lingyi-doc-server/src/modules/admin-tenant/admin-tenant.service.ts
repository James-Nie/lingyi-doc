import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { BusinessException } from '../../common/exceptions/business.exception';
import { DeployService } from '../../config/deploy.service';
import { UserEntity } from '../../database/entities/user.entity';
import { TenantMemberEntity } from '../../database/entities/tenant.entity';
import { OrganizationRepository } from '../../repositories/organization.repository';
import { PositionRepository } from '../../repositories/position.repository';
import { TenantRoleRepository } from '../../repositories/tenant-role.repository';
import { TenantMemberRepository } from '../../repositories/tenant-member.repository';
import { TenantRepository } from '../../repositories/tenant.repository';
import { UserRepository } from '../../repositories/user.repository';
import { AuthService } from '../../services/auth.service';
import type { TenantRole } from '../../types/session';
import { hasTenantBackendPermission } from '../../constants/rbac';

// 租户级角色只保留「管理员」(2) 与「成员」(3)；
// 原「超管」(1) 已下线，平台超管通过 user_admin_roles 授予。
const VALID_TENANT_ROLES: TenantRole[] = [2, 3];

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits;
  return null;
}

@Injectable()
export class AdminTenantService {
  constructor(
    private readonly tenantRepository: TenantRepository,
    private readonly organizationRepository: OrganizationRepository,
    private readonly tenantMemberRepository: TenantMemberRepository,
    private readonly positionRepository: PositionRepository,
    private readonly tenantRoleRepository: TenantRoleRepository,
    private readonly userRepository: UserRepository,
    private readonly deployService: DeployService,
    private readonly authService: AuthService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private async assertTenant(tenantId: string) {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) throw new BusinessException(100004, '租户不存在');
    return tenant;
  }

  async listTenants(deployType: number) {
    const items = await this.tenantRepository.listAll();
    return {
      items: items.map(t => ({
        id: t.id,
        name: t.name,
        status: t.status,
        deployType: t.deploy_type,
        adminUserId: t.admin_user_id,
        createdAt: t.created_at instanceof Date ? t.created_at.getTime() : new Date(t.created_at).getTime(),
      })),
      total: items.length,
      deployType,
    };
  }

  /** 当前管理后台可操作的租户空间（私有化默认租户 / SaaS 全部租户 / 租户管理员仅其所管理的租户） */
  async getWorkspaceTenants(currentUserId?: string) {
    // 不传当前用户（平台级入口）或私有化部署：按部署维度返回
    if (!currentUserId || this.deployService.isPrivate()) {
      if (this.deployService.isPrivate()) {
        const tenant = await this.tenantRepository.ensureDefaultPrivateTenant();
        if (!tenant) return { items: [], deployType: this.deployService.type };
        return {
          items: [{ id: tenant.id, name: tenant.name }],
          deployType: this.deployService.type,
        };
      }
      const items = await this.tenantRepository.listAll();
      return {
        items: items.map(t => ({ id: t.id, name: t.name })),
        deployType: this.deployService.type,
      };
    }

    // 租户管理员：仅返回其具备后台管理权限的租户
    const tenants = await this.tenantRepository.listForUser(currentUserId);
    const items = tenants
      .filter(t => t.tenantRole === 2 || hasTenantBackendPermission(t.permissions))
      .map(t => ({ id: t.id, name: t.name }));
    return { items, deployType: this.deployService.type };
  }

  async listMembers(tenantId: string) {
    await this.assertTenant(tenantId);
    const members = await this.tenantMemberRepository.listByTenant(tenantId);
    return { items: members, total: members.length };
  }

  async updateMember(
    tenantId: string,
    userId: string,
    body: {
      tenantRole?: number;
      roleId?: string | null;
      orgId?: string | null;
      positionId?: string | null;
      employeeId?: string | null;
      gender?: number | null;
      status?: number;
    },
  ) {
    await this.assertTenant(tenantId);
    const members = await this.tenantMemberRepository.listByTenant(tenantId);
    const member = members.find(m => m.userId === userId);
    if (!member) throw new BusinessException(100004, '成员不存在');

    const patch: {
      tenantRole?: TenantRole;
      roleId?: string | null;
      orgId?: string | null;
      positionId?: string | null;
      employeeId?: string | null;
      gender?: number | null;
      status?: number;
    } = {};

    if (body.roleId !== undefined) {
      const roleEntity = body.roleId
        ? await this.tenantRoleRepository.findById(tenantId, String(body.roleId))
        : null;
      if (body.roleId && !roleEntity) throw new BusinessException(100004, '角色不存在');
      // 租户角色不再支持「超管」(systemRole=1)，若误传则拒绝。
      if (roleEntity && (roleEntity.systemRole as number) === 1) {
        throw new BusinessException(100003, '租户内已下线「超管」角色，请改用系统管理-管理员管理');
      }
      const nextTenantRole = (roleEntity?.systemRole ?? 3) as TenantRole;
      patch.roleId = roleEntity?.id ?? null;
      patch.tenantRole = nextTenantRole;
    } else if (body.tenantRole !== undefined) {
      const tenantRole = Number(body.tenantRole) as TenantRole;
      if (!VALID_TENANT_ROLES.includes(tenantRole)) {
        throw new BusinessException(100001, '无效的角色');
      }
      const matched = (await this.tenantRoleRepository.listByTenant(tenantId))
        .find(r => r.systemRole === tenantRole);
      patch.tenantRole = tenantRole;
      if (matched) patch.roleId = matched.id;
    }

    if (body.orgId !== undefined) {
      if (body.orgId) {
        const org = await this.organizationRepository.findById(tenantId, body.orgId);
        if (!org) throw new BusinessException(100004, '部门不存在');
      }
      patch.orgId = body.orgId;
    }

    if (body.positionId !== undefined) {
      if (body.positionId) {
        const pos = await this.positionRepository.findById(tenantId, body.positionId);
        if (!pos) throw new BusinessException(100004, '职位不存在');
      }
      patch.positionId = body.positionId;
    }

    if (body.employeeId !== undefined) patch.employeeId = body.employeeId?.trim() || null;
    if (body.gender !== undefined) patch.gender = body.gender;
    if (body.status !== undefined) {
      patch.status = body.status;
    }

    if (!Object.keys(patch).length) {
      throw new BusinessException(100001, '没有可更新的字段');
    }

    const ok = await this.tenantMemberRepository.updateMember(tenantId, userId, patch);
    if (!ok) throw new BusinessException(100004, '成员不存在');
    return { success: true };
  }

  async deleteMember(tenantId: string, userId: string) {
    await this.assertTenant(tenantId);
    const members = await this.tenantMemberRepository.listByTenant(tenantId);
    const member = members.find(m => m.userId === userId);
    if (!member) throw new BusinessException(100004, '成员不存在');
    await this.tenantMemberRepository.deleteMember(tenantId, userId);
    return { success: true };
  }

  async listOrganizations(tenantId: string) {
    await this.assertTenant(tenantId);
    const items = await this.organizationRepository.listByTenant(tenantId);
    return { items };
  }

  async createOrganization(
    tenantId: string,
    body: { name?: string; parentId?: string | null; leaderUserId?: string | null },
  ) {
    await this.assertTenant(tenantId);
    const name = String(body.name ?? '').trim();
    if (!name) throw new BusinessException(100001, '部门名称不能为空');

    if (body.parentId) {
      const parent = await this.organizationRepository.findById(tenantId, body.parentId);
      if (!parent) throw new BusinessException(100004, '上级部门不存在');
    }

    const created = await this.organizationRepository.create({
      tenantId,
      name,
      parentId: body.parentId ?? null,
      leaderUserId: body.leaderUserId ?? null,
    });
    return {
      id: created.id,
      tenantId: created.tenant_id,
      parentId: created.parent_id,
      name: created.name,
      sortOrder: created.sort_order,
      leaderUserId: created.leader_user_id ?? null,
    };
  }

  async updateOrganization(
    tenantId: string,
    orgId: string,
    body: { name?: string; parentId?: string | null; leaderUserId?: string | null },
  ) {
    await this.assertTenant(tenantId);
    const updated = await this.organizationRepository.update(tenantId, orgId, {
      name: body.name?.trim(),
      parentId: body.parentId,
      leaderUserId: body.leaderUserId,
    });
    if (!updated) throw new BusinessException(100004, '部门不存在');
    return {
      id: updated.id,
      tenantId: updated.tenant_id,
      parentId: updated.parent_id,
      name: updated.name,
      sortOrder: updated.sort_order,
      leaderUserId: updated.leader_user_id ?? null,
    };
  }

  async deleteOrganization(tenantId: string, orgId: string) {
    await this.assertTenant(tenantId);
    try {
      const org = await this.organizationRepository.findById(tenantId, orgId);
      if (!org) throw new BusinessException(100004, '部门不存在');
      if (!org.parent_id) throw new BusinessException(100003, '不能删除根部门');
      await this.tenantMemberRepository.clearOrgReference(tenantId, orgId);
      const ok = await this.organizationRepository.delete(tenantId, orgId);
      if (!ok) throw new BusinessException(100004, '部门不存在');
      return { success: true };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      throw new BusinessException(100003, err instanceof Error ? err.message : '删除失败');
    }
  }

  async addMember(
    tenantId: string,
    body: {
      displayName?: string;
      email?: string;
      phone?: string;
      password?: string;
      orgId?: string | null;
      positionId?: string | null;
      gender?: number | null;
      employeeId?: string | null;
      tenantRole?: number;
    },
  ) {
    await this.assertTenant(tenantId);

    const displayName = String(body.displayName ?? '').trim();
    const rawEmail = String(body.email ?? '').trim();
    const rawPhone = String(body.phone ?? '').trim();
    const password = String(body.password ?? '');

    if (!displayName) throw new BusinessException(100001, '姓名不能为空');
    if (!rawEmail) throw new BusinessException(100001, '邮箱不能为空');
    if (!isEmail(rawEmail)) throw new BusinessException(100001, '邮箱格式不正确');
    const email = rawEmail.toLowerCase();

    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    if (rawPhone && !phone) throw new BusinessException(100001, '手机号格式不正确');

    if (!password || password.length < 8) throw new BusinessException(100001, '初始密码至少 8 位');

    const pwdError = this.authService.validatePassword(password);
    if (pwdError) throw new BusinessException(100001, pwdError);

    // 严格模式：已注册用户只能通过邀请加入
    const existingByEmail = await this.userRepository.findByEmail(email);
    if (existingByEmail) {
      throw new BusinessException(100003, '该邮箱已在系统注册，请使用「邀请已有用户」功能');
    }
    if (phone) {
      const existingByPhone = await this.userRepository.findByPhone(phone);
      if (existingByPhone) {
        throw new BusinessException(100003, '该手机号已在系统注册，请使用「邀请已有用户」功能');
      }
    }

    if (body.orgId) {
      const org = await this.organizationRepository.findById(tenantId, body.orgId);
      if (!org) throw new BusinessException(100004, '部门不存在');
    }

    if (body.positionId) {
      const pos = await this.positionRepository.findById(tenantId, body.positionId);
      if (!pos) throw new BusinessException(100004, '职位不存在');
    }

    let tenantRole: TenantRole = 3;
    let roleId: string | null = null;
    if (body.tenantRole !== undefined) {
      tenantRole = Number(body.tenantRole) as TenantRole;
      if (!VALID_TENANT_ROLES.includes(tenantRole)) {
        throw new BusinessException(100001, '无效的角色');
      }
    }
    const matchedRole = (await this.tenantRoleRepository.listByTenant(tenantId))
      .find(r => r.systemRole === tenantRole);
    roleId = matchedRole?.id ?? null;

    const passwordHash = await bcrypt.hash(password, 12);
    const userSource = this.deployService.defaultUserSource();

    const result = await this.dataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(UserEntity);
      const memberRepo = manager.getRepository(TenantMemberEntity);

      const userId = uuidv4();
      await userRepo.save({
        id: userId,
        email,
        passwordHash,
        displayName,
        phone,
        userType: 'consumer',
        userSource,
        personalPlan: 1,
        personalVipExpireAt: null,
        canCreateTeam: 0,
        needChangePassword: true,
      });

      await memberRepo.save({
        tenantId,
        userId,
        userSource,
        orgId: body.orgId ?? null,
        positionId: body.positionId ?? null,
        roleId,
        employeeId: body.employeeId?.trim() || null,
        gender: body.gender ?? null,
        tenantRole,
        status: 1,
      });

      return { userId, displayName, email, phone, isNew: true };
    });

    return result;
  }

  /** 按手机号/邮箱搜索已在系统注册的消费者用户（用于邀请已有用户） */
  async searchUsers(
    tenantId: string,
    query: { phone?: string; email?: string },
  ): Promise<{
    users: Array<{
      id: string;
      email: string;
      phone: string | null;
      displayName: string;
      isMember: boolean;
    }>;
  }> {
    await this.assertTenant(tenantId);

    const phone = query.phone ? normalizePhone(query.phone) : null;
    const email = query.email ? query.email.trim().toLowerCase() : null;

    if (!phone && !email) {
      throw new BusinessException(100001, '请输入手机号或邮箱');
    }

    const user = await this.userRepository.findByPhoneOrEmail(phone ?? undefined, email ?? undefined);
    if (!user) {
      return { users: [] };
    }

    const members = await this.tenantMemberRepository.listByTenant(tenantId);
    const isMember = members.some(m => m.userId === user.id);

    return {
      users: [{
        id: user.id,
        email: user.email,
        phone: user.phone ?? null,
        displayName: user.display_name,
        isMember,
      }],
    };
  }

  /** 邀请已有系统用户加入租户（创建 status=0 待确认记录） */
  async inviteMember(
    tenantId: string,
    body: {
      userId: string;
      orgId?: string | null;
      positionId?: string | null;
      tenantRole?: number;
    },
  ) {
    await this.assertTenant(tenantId);

    const user = await this.userRepository.findById(body.userId);
    if (!user) throw new BusinessException(100004, '用户不存在');

    if (body.orgId) {
      const org = await this.organizationRepository.findById(tenantId, body.orgId);
      if (!org) throw new BusinessException(100004, '部门不存在');
    }

    if (body.positionId) {
      const pos = await this.positionRepository.findById(tenantId, body.positionId);
      if (!pos) throw new BusinessException(100004, '职位不存在');
    }

    let tenantRole: TenantRole = 3;
    let roleId: string | null = null;
    if (body.tenantRole !== undefined) {
      tenantRole = Number(body.tenantRole) as TenantRole;
      if (!VALID_TENANT_ROLES.includes(tenantRole)) {
        throw new BusinessException(100001, '无效的角色');
      }
    }
    const matchedRole = (await this.tenantRoleRepository.listByTenant(tenantId))
      .find(r => r.systemRole === tenantRole);
    roleId = matchedRole?.id ?? null;

    const userSource = user.user_source ?? this.deployService.defaultUserSource();

    const existing = await this.tenantMemberRepository.listByTenant(tenantId);
    const alreadyMember = existing.find(m => m.userId === body.userId);
    if (alreadyMember) {
      if (alreadyMember.status === 1) {
        throw new BusinessException(100003, '该用户已是本组织成员');
      }
      // 已有待确认邀请 → 更新信息
      await this.tenantMemberRepository.updateMember(tenantId, body.userId, {
        status: 0,
        orgId: body.orgId ?? null,
        positionId: body.positionId ?? null,
        roleId,
        tenantRole,
      });
      return { userId: body.userId, displayName: user.display_name, status: 0, isNew: false };
    }

    await this.tenantMemberRepository.addMember({
      tenantId,
      userId: body.userId,
      userSource,
      orgId: body.orgId ?? null,
      positionId: body.positionId ?? null,
      roleId,
      tenantRole,
      status: 0,
    });

    return { userId: body.userId, displayName: user.display_name, status: 0, isNew: true };
  }

  async listPositions(tenantId: string) {
    await this.assertTenant(tenantId);
    const groups = await this.positionRepository.listGroupsWithPositions(tenantId);
    const members = await this.tenantMemberRepository.listByTenant(tenantId);
    const countMap = new Map<string, number>();
    for (const m of members) {
      if (m.positionId) countMap.set(m.positionId, (countMap.get(m.positionId) ?? 0) + 1);
    }
    return {
      items: groups.map((g) => ({
        ...g,
        positions: g.positions.map((p) => ({
          ...p,
          memberCount: countMap.get(p.id) ?? 0,
        })),
      })),
    };
  }

  async createPosition(
    tenantId: string,
    body: { name?: string; groupId?: string; avatarKey?: string },
  ) {
    await this.assertTenant(tenantId);
    const name = String(body.name ?? '').trim();
    const groupId = String(body.groupId ?? '').trim();
    if (!name) throw new BusinessException(100001, '职位名称不能为空');
    if (!groupId) throw new BusinessException(100001, '请选择所属分组');

    const position = await this.positionRepository.create({
      tenantId,
      groupId,
      name,
      avatarKey: body.avatarKey ?? 'avatar_0',
    });
    return position;
  }

  async createPositionGroup(tenantId: string, body: { name?: string }) {
    await this.assertTenant(tenantId);
    const name = String(body.name ?? '').trim();
    if (!name) throw new BusinessException(100001, '分组名称不能为空');
    const group = await this.positionRepository.createGroup(tenantId, name);
    return { id: group.id, tenantId: group.tenantId, name: group.name, sortOrder: group.sortOrder, positions: [] };
  }

  async updatePositionGroup(tenantId: string, groupId: string, body: { name?: string }) {
    await this.assertTenant(tenantId);
    const name = String(body.name ?? '').trim();
    if (!name) throw new BusinessException(100001, '分组名称不能为空');
    const group = await this.positionRepository.updateGroup(tenantId, groupId, name);
    if (!group) throw new BusinessException(100004, '分组不存在');
    return group;
  }

  async deletePositionGroup(tenantId: string, groupId: string) {
    await this.assertTenant(tenantId);
    const group = await this.positionRepository.findGroupById(tenantId, groupId);
    if (!group) throw new BusinessException(100004, '分组不存在');
    const positionIds = await this.positionRepository.listPositionIdsByGroup(tenantId, groupId);
    await this.tenantMemberRepository.clearPositionReferences(tenantId, positionIds);
    const ok = await this.positionRepository.deleteGroup(tenantId, groupId);
    if (!ok) throw new BusinessException(100004, '分组不存在');
    return { success: true };
  }

  async updatePosition(
    tenantId: string,
    positionId: string,
    body: { name?: string; groupId?: string; avatarKey?: string },
  ) {
    await this.assertTenant(tenantId);
    const name = body.name !== undefined ? String(body.name).trim() : undefined;
    if (name !== undefined && !name) throw new BusinessException(100001, '职位名称不能为空');
    const groupId = body.groupId !== undefined ? String(body.groupId).trim() : undefined;
    if (groupId !== undefined && !groupId) throw new BusinessException(100001, '请选择所属分组');
    if (groupId) {
      const group = await this.positionRepository.findGroupById(tenantId, groupId);
      if (!group) throw new BusinessException(100004, '分组不存在');
    }
    const position = await this.positionRepository.updatePosition(tenantId, positionId, {
      name,
      groupId,
      avatarKey: body.avatarKey,
    });
    if (!position) throw new BusinessException(100004, '职位不存在');
    return position;
  }

  async deletePosition(tenantId: string, positionId: string) {
    await this.assertTenant(tenantId);
    const position = await this.positionRepository.findById(tenantId, positionId);
    if (!position) throw new BusinessException(100004, '职位不存在');
    await this.tenantMemberRepository.clearPositionReference(tenantId, positionId);
    const ok = await this.positionRepository.deletePosition(tenantId, positionId);
    if (!ok) throw new BusinessException(100004, '职位不存在');
    return { success: true };
  }

  async assignPositionMembers(
    tenantId: string,
    positionId: string,
    body: { userIds?: string[] },
  ) {
    await this.assertTenant(tenantId);
    const position = await this.positionRepository.findById(tenantId, positionId);
    if (!position) throw new BusinessException(100004, '职位不存在');

    const userIds = [...new Set((body.userIds ?? []).map(id => String(id).trim()).filter(Boolean))];
    if (!userIds.length) throw new BusinessException(100001, '请选择成员');

    const members = await this.tenantMemberRepository.listByTenant(tenantId);
    const memberIds = new Set(members.map(m => m.userId));
    for (const userId of userIds) {
      if (!memberIds.has(userId)) throw new BusinessException(100004, '成员不存在');
    }

    await this.tenantMemberRepository.assignPositionToMembers(tenantId, positionId, userIds);
    return { success: true, count: userIds.length };
  }

  async removePositionMember(tenantId: string, positionId: string, userId: string) {
    await this.assertTenant(tenantId);
    const position = await this.positionRepository.findById(tenantId, positionId);
    if (!position) throw new BusinessException(100004, '职位不存在');
    const ok = await this.tenantMemberRepository.clearMemberPosition(tenantId, positionId, userId);
    if (!ok) throw new BusinessException(100004, '成员不在该职位下');
    return { success: true };
  }

  async listRoles(tenantId: string) {
    await this.assertTenant(tenantId);
    const items = await this.tenantRoleRepository.listByTenant(tenantId);
    return { items };
  }

  async createRole(
    tenantId: string,
    body: { name?: string; description?: string | null; permissions?: string[] },
  ) {
    await this.assertTenant(tenantId);
    const name = String(body.name ?? '').trim();
    if (!name) throw new BusinessException(100001, '角色名称不能为空');
    const role = await this.tenantRoleRepository.create({
      tenantId,
      name,
      description: body.description ?? null,
      permissions: Array.isArray(body.permissions) ? body.permissions.map(String) : [],
    });
    return role;
  }

  async updateRole(
    tenantId: string,
    roleId: string,
    body: { name?: string; description?: string | null; permissions?: string[] },
  ) {
    await this.assertTenant(tenantId);
    const name = body.name !== undefined ? String(body.name).trim() : undefined;
    if (name !== undefined && !name) throw new BusinessException(100001, '角色名称不能为空');
    const updated = await this.tenantRoleRepository.update(tenantId, roleId, {
      name,
      description: body.description,
      permissions: Array.isArray(body.permissions) ? body.permissions.map(String) : undefined,
    });
    if (!updated) throw new BusinessException(100004, '角色不存在');
    return {
      id: updated.id,
      tenantId: updated.tenantId,
      name: updated.name,
      description: updated.description,
      permissions: updated.permissions ?? [],
      isSystem: updated.isSystem === 1,
      systemRole: updated.systemRole,
      sortOrder: updated.sortOrder,
    };
  }

  async deleteRole(tenantId: string, roleId: string) {
    await this.assertTenant(tenantId);
    const role = await this.tenantRoleRepository.findById(tenantId, roleId);
    if (!role) throw new BusinessException(100004, '角色不存在');
    if (role.isSystem) throw new BusinessException(100003, '系统角色不可删除');
    const memberCount = await this.tenantMemberRepository.countByRole(tenantId, roleId);
    if (memberCount > 0) throw new BusinessException(100003, '请先移除角色下的成员');
    const ok = await this.tenantRoleRepository.delete(tenantId, roleId);
    if (!ok) throw new BusinessException(100004, '角色不存在');
    return { success: true };
  }

  private async resolveRoleTenantRole(role: { systemRole: number | null }): Promise<TenantRole> {
    return (role.systemRole ?? 3) as TenantRole;
  }

  async assignRoleMembers(
    tenantId: string,
    roleId: string,
    body: { userIds?: string[] },
  ) {
    await this.assertTenant(tenantId);
    const role = await this.tenantRoleRepository.findById(tenantId, roleId);
    if (!role) throw new BusinessException(100004, '角色不存在');

    const userIds = [...new Set((body.userIds ?? []).map(id => String(id).trim()).filter(Boolean))];
    if (!userIds.length) throw new BusinessException(100001, '请选择成员');

    const members = await this.tenantMemberRepository.listByTenant(tenantId);
    const memberIds = new Set(members.map(m => m.userId));
    for (const userId of userIds) {
      if (!memberIds.has(userId)) throw new BusinessException(100004, '成员不存在');
    }

    const tenantRole = await this.resolveRoleTenantRole(role);
    await this.tenantMemberRepository.assignRoleToMembers(tenantId, roleId, tenantRole, userIds);
    return { success: true, count: userIds.length };
  }

  async removeRoleMember(tenantId: string, roleId: string, userId: string) {
    await this.assertTenant(tenantId);
    const role = await this.tenantRoleRepository.findById(tenantId, roleId);
    if (!role) throw new BusinessException(100004, '角色不存在');

    const members = await this.tenantMemberRepository.listByTenant(tenantId);
    const member = members.find(m => m.userId === userId);
    if (!member || member.roleId !== roleId) {
      throw new BusinessException(100004, '成员不在该角色下');
    }

    const fallbackRole = await this.tenantRoleRepository.findMemberRole(tenantId);
    if (!fallbackRole) throw new BusinessException(100004, '默认成员角色不存在');

    const ok = await this.tenantMemberRepository.clearMemberRole(
      tenantId,
      roleId,
      userId,
      fallbackRole.id,
      3,
    );
    if (!ok) throw new BusinessException(100004, '成员不在该角色下');
    return { success: true };
  }
}
