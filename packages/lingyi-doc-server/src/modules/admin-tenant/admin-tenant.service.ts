import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { BusinessException } from '../../common/exceptions/business.exception';
import { DeployService } from '../../config/deploy.service';
import { OrganizationRepository } from '../../repositories/organization.repository';
import { PositionRepository } from '../../repositories/position.repository';
import { TenantRoleRepository } from '../../repositories/tenant-role.repository';
import { TenantMemberRepository } from '../../repositories/tenant-member.repository';
import { TenantRepository } from '../../repositories/tenant.repository';
import { UserRepository } from '../../repositories/user.repository';
import type { TenantRole } from '../../types/session';

const VALID_TENANT_ROLES: TenantRole[] = [1, 2, 3];

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits;
  return null;
}

function resolveLoginEmail(username: string, contact: string): { email: string; phone: string | null } {
  if (isEmail(contact)) {
    return { email: contact.toLowerCase(), phone: normalizePhone(username) ?? normalizePhone(contact) };
  }
  const phone = normalizePhone(contact) ?? normalizePhone(username);
  if (phone) {
    return { email: `${phone}@member.local`, phone };
  }
  if (isEmail(username)) {
    return { email: username.toLowerCase(), phone: null };
  }
  return { email: `${username.trim().toLowerCase()}@member.local`, phone: null };
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

  /** 当前管理后台可操作的租户空间（私有化默认租户 / SaaS 全部租户） */
  async getWorkspaceTenants() {
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
      const nextTenantRole = (roleEntity?.systemRole ?? 3) as TenantRole;
      if (member.tenantRole === 1 && nextTenantRole !== 1) {
        const superAdminCount = await this.tenantMemberRepository.countSuperAdmins(tenantId);
        if (superAdminCount <= 1) {
          throw new BusinessException(100003, '至少保留一名超管');
        }
      }
      patch.roleId = roleEntity?.id ?? null;
      patch.tenantRole = nextTenantRole;
    } else if (body.tenantRole !== undefined) {
      const tenantRole = Number(body.tenantRole) as TenantRole;
      if (!VALID_TENANT_ROLES.includes(tenantRole)) {
        throw new BusinessException(100001, '无效的角色');
      }
      if (member.tenantRole === 1 && tenantRole !== 1) {
        const superAdminCount = await this.tenantMemberRepository.countSuperAdmins(tenantId);
        if (superAdminCount <= 1) {
          throw new BusinessException(100003, '至少保留一名超管');
        }
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
      if (member.tenantRole === 1 && body.status !== 1) {
        const superAdminCount = await this.tenantMemberRepository.countSuperAdmins(tenantId);
        if (superAdminCount <= 1) {
          throw new BusinessException(100003, '至少保留一名可用超管');
        }
      }
      patch.status = body.status;
    }

    if (!Object.keys(patch).length) {
      throw new BusinessException(100001, '没有可更新的字段');
    }

    const ok = await this.tenantMemberRepository.updateMember(tenantId, userId, patch);
    if (!ok) throw new BusinessException(100004, '成员不存在');
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
      username?: string;
      contact?: string;
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
    const username = String(body.username ?? '').trim();
    const contact = String(body.contact ?? '').trim();
    const password = String(body.password ?? '');

    if (!displayName) throw new BusinessException(100001, '姓名不能为空');
    if (!username) throw new BusinessException(100001, '登录用户名不能为空');
    if (!contact) throw new BusinessException(100001, '邮箱或手机号不能为空');
    if (!password || password.length < 6) throw new BusinessException(100001, '初始密码至少 6 位');

    const { email, phone } = resolveLoginEmail(username, contact);

    const existingEmail = await this.userRepository.findByEmail(email);
    if (existingEmail) throw new BusinessException(100003, '该账号已存在');
    if (phone) {
      const existingPhone = await this.userRepository.findByPhone(phone);
      if (existingPhone) throw new BusinessException(100003, '该手机号已注册');
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

    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    const userSource = this.deployService.defaultUserSource();

    await this.userRepository.create({
      id: userId,
      email,
      passwordHash,
      displayName,
      phone,
      userSource,
    });

    await this.tenantMemberRepository.addMember({
      tenantId,
      userId,
      userSource,
      orgId: body.orgId ?? null,
      positionId: body.positionId ?? null,
      roleId,
      employeeId: body.employeeId?.trim() || null,
      gender: body.gender ?? null,
      tenantRole,
    });

    return {
      userId,
      displayName,
      email,
      phone,
    };
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

    if (role.systemRole === 1) {
      const superAdminCount = await this.tenantMemberRepository.countSuperAdmins(tenantId);
      if (superAdminCount <= 1) {
        throw new BusinessException(100003, '至少保留一名超管');
      }
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
