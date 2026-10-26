import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Logger,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PERMISSIONS } from '../../constants/rbac';
import { AUDIT_ACTIONS } from '../../constants/audit';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AdminAccessRepository } from '../../repositories/admin-access.repository';
import { AdminGroupRepository } from '../../repositories/admin-group.repository';
import { AdminRoleRepository } from '../../repositories/admin-role.repository';
import { AuditWriterService } from '../../services/audit-writer.service';

const GROUP_CODE_RE = /^[a-z][a-z0-9_]{2,49}$/;
/** 单次提交的成员上限，避免一次写入过大 */
const MEMBER_LIMIT = 500;

/**
 * 管理组管理（P0-3）：成员 + 角色 + 管理范围。
 *
 * 对应等保三级 8.1.4.2 d)「授予管理用户所需的最小权限，实现管理用户的权限分离」：
 * 不再只能给管理员一个全局角色，而是「一组人可以管哪些部门、能做什么」。
 */
@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AuthAudience('admin')
export class AdminGroupController {
  private readonly logger = new Logger(AdminGroupController.name);

  constructor(
    private readonly groupRepository: AdminGroupRepository,
    private readonly accessRepository: AdminAccessRepository,
    private readonly roleRepository: AdminRoleRepository,
    private readonly auditWriter: AuditWriterService,
  ) {}

  /** 当前管理员的有效权限与管理范围，前端据此做数据可见性提示 */
  @Get('me/scope')
  async meScope(@CurrentUser() user: AuthUser) {
    const [scope, permissions, roles, groups] = await Promise.all([
      this.accessRepository.getAdminScope(user.userId),
      this.accessRepository.getEffectivePermissions(user.userId),
      this.accessRepository.getEffectiveRoles(user.userId),
      this.accessRepository.groupsOfUser(user.userId),
    ]);
    return {
      scope,
      permissions,
      roles,
      groups: groups.map((g) => ({
        id: g.id,
        code: g.code,
        name: g.name,
        scopeType: g.scopeType,
      })),
    };
  }

  @Get('groups')
  @RequirePermissions(PERMISSIONS.ADMIN_GROUP_READ)
  async list() {
    const items = await this.groupRepository.list();
    return { items, total: items.length };
  }

  @Get('groups/:id')
  @RequirePermissions(PERMISSIONS.ADMIN_GROUP_READ)
  async detail(@Param('id') id: string) {
    const group = await this.groupRepository.findById(id);
    if (!group) throw new BusinessException(100004, '管理组不存在', HttpStatus.NOT_FOUND);
    return group;
  }

  @Post('groups')
  @RequirePermissions(PERMISSIONS.ADMIN_GROUP_WRITE)
  async create(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    const code = String(body.code ?? '').trim().toLowerCase();
    const name = String(body.name ?? '').trim();
    const description = body.description === undefined ? null : String(body.description ?? '').trim() || null;
    const scopeType = body.scopeType === 'all' ? 'all' : 'org';

    if (!GROUP_CODE_RE.test(code)) {
      throw new BusinessException(100002, '管理组标识需为 3~50 位小写字母/数字/下划线，且以字母开头');
    }
    if (!name || name.length > 100) throw new BusinessException(100002, '管理组名称必填且不超过 100 字');
    if (await this.groupRepository.findByCode(code)) {
      throw new BusinessException(100002, `管理组标识 ${code} 已存在`);
    }

    const created = await this.groupRepository.create({ code, name, description, scopeType, createdBy: user.userId });

    this.auditWriter.write(req, {
      operatorId: user.userId,
      action: AUDIT_ACTIONS.ADMIN_GROUP_CREATE,
      targetType: 'admin_group',
      targetId: created.id,
      detail: { code, name, scopeType },
    });

    return created;
  }

  @Put('groups/:id')
  @RequirePermissions(PERMISSIONS.ADMIN_GROUP_WRITE)
  async update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    const group = await this.groupRepository.findById(id);
    if (!group) throw new BusinessException(100004, '管理组不存在', HttpStatus.NOT_FOUND);

    const patch: { name?: string; description?: string | null; scopeType?: 'all' | 'org' } = {};
    if (body.name !== undefined) {
      const name = String(body.name ?? '').trim();
      if (!name || name.length > 100) throw new BusinessException(100002, '管理组名称必填且不超过 100 字');
      patch.name = name;
    }
    if (body.description !== undefined) {
      patch.description = String(body.description ?? '').trim() || null;
    }
    if (body.scopeType !== undefined) {
      const next = body.scopeType === 'all' ? 'all' : 'org';
      // 系统管理组的范围不允许收缩/扩张，避免把预置的超管组改成部门组
      if (group.isSystem && next !== group.scopeType) {
        throw new BusinessException(100002, '系统管理组的管理范围不可修改');
      }
      // 从「按部门」改成「全平台」等价于扩大权限，需先确认不会绕过最小权限原则
      if (group.scopeType === 'org' && next === 'all') {
        const grantsSuper = await this.accessRepository.groupGrantsSuperAdmin(id);
        if (grantsSuper && !(await this.accessRepository.hasSuperAdminAfterGroupRemoval(id))) {
          throw new BusinessException(100002, '该管理组是当前唯一的超级管理员来源，不能扩大为全平台范围');
        }
      }
      patch.scopeType = next;
    }

    if (!Object.keys(patch).length) throw new BusinessException(100002, '没有需要更新的字段');

    const updated = await this.groupRepository.update(id, patch);
    this.auditWriter.write(req, {
      operatorId: user.userId,
      action: AUDIT_ACTIONS.ADMIN_GROUP_UPDATE,
      targetType: 'admin_group',
      targetId: id,
      detail: { before: group, patch },
    });
    return updated;
  }

  @Delete('groups/:id')
  @RequirePermissions(PERMISSIONS.ADMIN_GROUP_WRITE)
  async remove(
    @Param('id') id: string,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    const group = await this.groupRepository.findById(id);
    if (!group) throw new BusinessException(100004, '管理组不存在', HttpStatus.NOT_FOUND);
    if (group.isSystem) throw new BusinessException(100002, '系统管理组不可删除');

    // 最后超管保护（等保 8.1.4.2 b/c 避免共享账号与失管）
    if (await this.accessRepository.groupGrantsSuperAdmin(id)) {
      const stillHasSuperAdmin = await this.accessRepository.hasSuperAdminAfterGroupRemoval(id);
      if (!stillHasSuperAdmin) {
        throw new BusinessException(110006, '该管理组是当前唯一的超级管理员来源，删除后将无人可管理系统，请先授予其他管理员超级管理员角色');
      }
    }

    await this.groupRepository.remove(id);
    this.auditWriter.write(req, {
      operatorId: user.userId,
      action: AUDIT_ACTIONS.ADMIN_GROUP_DELETE,
      targetType: 'admin_group',
      targetId: id,
      detail: { code: group.code, name: group.name, memberCount: group.memberCount },
    });
    return { success: true };
  }

  /** 覆盖式设置角色集合（传空数组即清空） */
  @Put('groups/:id/roles')
  @RequirePermissions(PERMISSIONS.ADMIN_GROUP_WRITE)
  async setRoles(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    const group = await this.groupRepository.findById(id);
    if (!group) throw new BusinessException(100004, '管理组不存在', HttpStatus.NOT_FOUND);
    if (!Array.isArray(body.roleIds)) throw new BusinessException(100002, 'roleIds 必须为数组');

    const roleIds = [...new Set(body.roleIds.map((v) => String(v ?? '').trim()).filter(Boolean))];
    const roles = await this.roleRepository.listRolesDetailed();
    const known = new Set(roles.map((r) => r.id));
    const unknown = roleIds.filter((rid) => !known.has(rid));
    if (unknown.length) throw new BusinessException(100002, `存在无效的角色 ID：${unknown.join(', ')}`);

    // 若本次会移除本组的 super_admin 授予，需确认移除后仍有超管
    const superAdminRole = roles.find((r) => r.code === 'super_admin');
    const currentlyGrants = group.roles.some((r) => r.code === 'super_admin');
    const willGrant = !!superAdminRole && roleIds.includes(superAdminRole.id);
    if (currentlyGrants && !willGrant) {
      const stillHas = await this.accessRepository.hasSuperAdminAfterGroupRemoval(id);
      if (!stillHas) {
        throw new BusinessException(110006, '移除该管理组的超级管理员角色后将无人可管理系统，操作已拒绝');
      }
    }

    await this.groupRepository.setRoles(id, roleIds);
    this.auditWriter.write(req, {
      operatorId: user.userId,
      action: AUDIT_ACTIONS.ADMIN_GROUP_ROLES_UPDATE,
      targetType: 'admin_group',
      targetId: id,
      detail: { before: group.roles.map((r) => r.code), after: roleIds },
    });
    return { success: true };
  }

  /** 覆盖式设置成员集合 */
  @Put('groups/:id/members')
  @RequirePermissions(PERMISSIONS.ADMIN_GROUP_WRITE)
  async setMembers(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    const group = await this.groupRepository.findById(id);
    if (!group) throw new BusinessException(100004, '管理组不存在', HttpStatus.NOT_FOUND);
    if (!Array.isArray(body.userIds)) throw new BusinessException(100002, 'userIds 必须为数组');

    const userIds = [...new Set(body.userIds.map((v) => String(v ?? '').trim()).filter(Boolean))];
    if (userIds.length > MEMBER_LIMIT) {
      throw new BusinessException(100002, `单个管理组成员上限 ${MEMBER_LIMIT} 人`);
    }

    const valid = await this.groupRepository.filterExistingAdminUserIds(userIds);
    const invalid = userIds.filter((uid) => !valid.includes(uid));

    // 清空超管组成员会导致无人可管理系统
    if (group.roles.some((r) => r.code === 'super_admin') && valid.length === 0) {
      const stillHas = await this.accessRepository.hasSuperAdminAfterGroupRemoval(id);
      if (!stillHas) {
        throw new BusinessException(110006, '清空该管理组成员后将无人可管理系统，操作已拒绝');
      }
    }

    await this.groupRepository.setMembers(id, valid, user.userId);
    this.auditWriter.write(req, {
      operatorId: user.userId,
      action: AUDIT_ACTIONS.ADMIN_GROUP_MEMBERS_UPDATE,
      targetType: 'admin_group',
      targetId: id,
      detail: { beforeCount: group.memberCount, afterCount: valid.length, invalidRejected: invalid },
    });
    return { success: true, memberCount: valid.length, invalidRejected: invalid };
  }

  /** 覆盖式设置管理范围部门 */
  @Put('groups/:id/orgs')
  @RequirePermissions(PERMISSIONS.ADMIN_GROUP_WRITE)
  async setOrgs(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    const group = await this.groupRepository.findById(id);
    if (!group) throw new BusinessException(100004, '管理组不存在', HttpStatus.NOT_FOUND);
    if (!Array.isArray(body.orgs)) throw new BusinessException(100002, 'orgs 必须为 [{ orgId, includeChildren }]');

    const raw = body.orgs as Array<Record<string, unknown>>;
    const requested = raw
      .map((o) => ({ orgId: String(o.orgId ?? '').trim(), includeChildren: o.includeChildren !== false }))
      .filter((o) => o.orgId);
    const valid = await this.groupRepository.filterExistingOrgIds(requested.map((o) => o.orgId));
    const invalid = requested.map((o) => o.orgId).filter((oid) => !valid.includes(oid));
    const orgs = requested.filter((o) => valid.includes(o.orgId));

    if (group.scopeType === 'org' && orgs.length === 0) {
      throw new BusinessException(100002, '按部门范围的管理组至少需要指定一个部门（如需全平台请先切换范围类型）');
    }

    await this.groupRepository.setOrgs(id, orgs);
    this.auditWriter.write(req, {
      operatorId: user.userId,
      action: AUDIT_ACTIONS.ADMIN_GROUP_UPDATE,
      targetType: 'admin_group',
      targetId: id,
      detail: { scopeOrgs: orgs, invalidRejected: invalid },
    });
    return { success: true, orgCount: orgs.length, invalidRejected: invalid };
  }
}
