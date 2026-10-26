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
import {
  ADMIN_ROLE_CODES,
  PERMISSIONS,
  PERMISSION_GROUPS,
  SUPER_ADMIN_ONLY_PERMISSIONS,
} from '../../constants/rbac';
import { AUDIT_ACTIONS } from '../../constants/audit';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AdminRoleRepository } from '../../repositories/admin-role.repository';
import { AdminAccessRepository } from '../../repositories/admin-access.repository';
import { AuditWriterService } from '../../services/audit-writer.service';

/** 自定义角色 code 白名单式约束 */
const CUSTOM_ROLE_CODE_RE = /^[a-z][a-z0-9_]{2,49}$/;

/**
 * 角色与权限点管理（P0-3）。
 *
 * 等保三级 8.1.4.2 d) 最小权限 / 权限分离：
 * - 系统角色（`is_system=true`）的名称与权限点**不可修改**，只能改描述之外的无操作——本实现直接整体拒绝
 * - 自定义角色不得持有 `SUPER_ADMIN_ONLY_PERMISSIONS` 中的高危权限，提交时静默剔除并在响应中回传被剔除项
 * - 删除角色前校验引用（有直接授予用户或被管理组引用则拒绝），避免「删角色→权限悬空」
 */
@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AuthAudience('admin')
export class AdminRoleController {
  private readonly logger = new Logger(AdminRoleController.name);

  constructor(
    private readonly roleRepository: AdminRoleRepository,
    private readonly accessRepository: AdminAccessRepository,
    private readonly auditWriter: AuditWriterService,
  ) {}

  /** 权限点目录（按业务模块分组），供权限勾选面板渲染 */
  @Get('permissions')
  @RequirePermissions(PERMISSIONS.ADMIN_USER_READ)
  async permissions() {
    const catalog = await this.roleRepository.listPermissionCatalog();
    const known = new Set(catalog.map((c) => c.code));
    const grouped = PERMISSION_GROUPS.map((g) => ({
      group: g.group,
      label: g.label,
      items: g.codes
        .filter((code) => known.has(code))
        .map((code) => {
          const item = catalog.find((c) => c.code === code);
          return {
            code,
            name: item?.name ?? code,
            superAdminOnly: SUPER_ADMIN_ONLY_PERMISSIONS.includes(code),
          };
        }),
    })).filter((g) => g.items.length > 0);

    return { groups: grouped, total: catalog.length };
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.ADMIN_USER_READ)
  async listRoles() {
    const roles = await this.roleRepository.listRolesDetailed();
    return {
      items: roles.map((r) => ({
        ...r,
        superAdminOnlyPermissions: SUPER_ADMIN_ONLY_PERMISSIONS.filter((p) => r.permissions.includes(p)),
      })),
      total: roles.length,
    };
  }

  @Post('roles')
  @RequirePermissions(PERMISSIONS.ADMIN_USER_WRITE)
  async createRole(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    const code = String(body.code ?? '').trim().toLowerCase();
    const name = String(body.name ?? '').trim();
    const description = body.description === undefined ? null : String(body.description ?? '').trim() || null;
    const permissionCodes = Array.isArray(body.permissionCodes) ? body.permissionCodes.map(String) : [];

    if (!CUSTOM_ROLE_CODE_RE.test(code)) {
      throw new BusinessException(100002, '角色标识需为 3~50 位小写字母/数字/下划线，且以字母开头');
    }
    if (!name || name.length > 100) throw new BusinessException(100002, '角色名称必填且不超过 100 字');
    if (Object.values(ADMIN_ROLE_CODES).includes(code as (typeof ADMIN_ROLE_CODES)[keyof typeof ADMIN_ROLE_CODES])) {
      throw new BusinessException(100002, `角色标识 ${code} 为系统保留，不可使用`);
    }
    const existing = await this.roleRepository.findByCode(code);
    if (existing) throw new BusinessException(100002, `角色标识 ${code} 已存在`);

    const { accepted, rejected } = this.roleRepository.sanitizeCustomRolePermissions(permissionCodes);
    const id = await this.roleRepository.createRole({ code, name, description, permissionCodes: accepted });

    this.auditWriter.write(req, {
      operatorId: user.userId,
      action: AUDIT_ACTIONS.ADMIN_ROLE_CREATE,
      targetType: 'admin_role',
      targetId: id,
      detail: { code, name, permissions: accepted, rejectedSuperAdminOnly: rejected },
    });

    return { id, code, name, permissions: accepted, rejectedSuperAdminOnly: rejected };
  }

  @Put('roles/:id')
  @RequirePermissions(PERMISSIONS.ADMIN_USER_WRITE)
  async updateRole(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    const role = await this.roleRepository.findRoleById(id);
    if (!role) throw new BusinessException(100004, '角色不存在', HttpStatus.NOT_FOUND);

    const isSuperAdmin = role.code === ADMIN_ROLE_CODES.SUPER_ADMIN;
    const isSystem = role.is_system;

    if (isSystem && body.permissionCodes !== undefined) {
      throw new BusinessException(100002, '系统角色的权限点不可修改，请新建自定义角色');
    }
    // 兜底：即便调用方绕过上面判断，也不允许把超管权限改空
    if (isSuperAdmin && Array.isArray(body.permissionCodes) && body.permissionCodes.length === 0) {
      throw new BusinessException(100002, '超级管理员角色的权限点不可清空');
    }

    const patch: { name?: string; description?: string | null; permissionCodes?: string[] } = {};
    let rejected: string[] = [];

    if (body.name !== undefined) {
      const name = String(body.name ?? '').trim();
      if (!name || name.length > 100) throw new BusinessException(100002, '角色名称必填且不超过 100 字');
      patch.name = name;
    }
    if (body.description !== undefined) {
      patch.description = String(body.description ?? '').trim() || null;
    }
    if (Array.isArray(body.permissionCodes)) {
      const sanitized = this.roleRepository.sanitizeCustomRolePermissions(body.permissionCodes.map(String));
      patch.permissionCodes = sanitized.accepted;
      rejected = sanitized.rejected;
    }

    await this.roleRepository.updateRole(id, patch);

    this.auditWriter.write(req, {
      operatorId: user.userId,
      action: isSystem ? AUDIT_ACTIONS.ADMIN_ROLE_UPDATE_DEF : AUDIT_ACTIONS.ADMIN_ROLE_PERMS_UPDATE,
      targetType: 'admin_role',
      targetId: id,
      detail: { before: role, patch, rejectedSuperAdminOnly: rejected },
    });

    return { success: true, rejectedSuperAdminOnly: rejected };
  }

  @Delete('roles/:id')
  @RequirePermissions(PERMISSIONS.ADMIN_USER_WRITE)
  async deleteRole(
    @Param('id') id: string,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    const role = await this.roleRepository.findRoleById(id);
    if (!role) throw new BusinessException(100004, '角色不存在', HttpStatus.NOT_FOUND);
    if (role.is_system) throw new BusinessException(100002, '系统角色不可删除');

    const refs = await this.roleRepository.isRoleReferenced(id);
    if (refs.users > 0 || refs.groups > 0) {
      throw new BusinessException(
        100002,
        `该角色仍被引用（${refs.users} 名管理员直接持有、${refs.groups} 个管理组使用），请先解除引用`,
      );
    }

    await this.roleRepository.deleteRole(id);
    this.auditWriter.write(req, {
      operatorId: user.userId,
      action: AUDIT_ACTIONS.ADMIN_ROLE_DELETE,
      targetType: 'admin_role',
      targetId: id,
      detail: { code: role.code, name: role.name },
    });
    return { success: true };
  }
}
