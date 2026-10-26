import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AUDIT_ACTIONS } from '../../constants/audit';
import { PERMISSIONS } from '../../constants/rbac';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { DeployService } from '../../config/deploy.service';
import { AuditWriterService } from '../../services/audit-writer.service';
import { StorageService } from '../../services/storage.service';
import { AdminTenantService } from './admin-tenant.service';

@Controller('api/v1/admin/tenants')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AuthAudience('admin')
export class AdminTenantController {
  private readonly logger = new Logger(AdminTenantController.name);

  constructor(
    private readonly adminTenantService: AdminTenantService,
    private readonly storageService: StorageService,
    private readonly deployService: DeployService,
    private readonly auditWriter: AuditWriterService,
  ) {}

  /**
   * 租户域审计写入（P0-7 / 等保三级 8.1.4.3）。
   *
   * 此前本模块所有写操作都没有审计记录（评审缺陷 F7），补齐后约定：
   * - detail 只放标识类字段，**绝不含初始密码/口令**等凭据
   * - 写入失败不阻断业务（由 AuditWriterService 兜底并记 error 日志）
   */
  private audit(
    req: Request,
    user: AuthUser,
    action: string,
    targetType: string,
    targetId: string | undefined,
    detail?: Record<string, unknown>,
  ): void {
    this.auditWriter.write(req, {
      operatorId: user.userId,
      action,
      targetType,
      targetId,
      detail: detail ?? null,
    });
  }

  /** detail 里记录「改了哪些字段」，但剔除凭据类字段 */
  private static keysOf(body: Record<string, unknown> | undefined): string[] {
    return Object.keys(body ?? {}).filter(k => k !== 'password' && k !== 'initialPassword');
  }

  private static idOf(value: unknown): string | undefined {
    if (value && typeof value === 'object' && 'id' in value) {
      const id = (value as { id?: unknown }).id;
      return id === undefined || id === null ? undefined : String(id);
    }
    return undefined;
  }

  @Get('workspace')
  async workspace(@CurrentUser() user: AuthUser) {
    try {
      return await this.adminTenantService.getWorkspaceTenants(user?.userId);
    } catch (err) {
      this.logger.error('workspace failed', err);
      throw new BusinessException(100005, '获取租户空间失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PLATFORM_TENANT_READ)
  async listAll() {
    try {
      return await this.adminTenantService.listTenants(this.deployService.type);
    } catch (err) {
      this.logger.error('list failed', err);
      throw new BusinessException(100005, '获取租户列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':tenantId/members')
  @RequirePermissions(PERMISSIONS.TENANT_MEMBER_READ)
  async members(@Param('tenantId') tenantId: string) {
    try {
      return await this.adminTenantService.listMembers(tenantId);
    } catch (err) {
      this.logger.error('members failed', err);
      throw new BusinessException(100005, '获取成员失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':tenantId/members')
  @RequirePermissions(PERMISSIONS.TENANT_MEMBER_WRITE)
  async addMember(
    @Param('tenantId') tenantId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminTenantService.addMember(tenantId, body);
      this.audit(req, user, AUDIT_ACTIONS.TENANT_MEMBER_ADD, 'tenant_member', String(body.userId ?? ''), {
        tenantId,
        orgId: body.orgId ?? null,
        positionId: body.positionId ?? null,
        fields: AdminTenantController.keysOf(body),
      });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('add member failed', err);
      throw new BusinessException(100005, '添加成员失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':tenantId/users/search')
  @RequirePermissions(PERMISSIONS.TENANT_MEMBER_READ)
  async searchUsers(
    @Param('tenantId') tenantId: string,
    @Query('phone') phone?: string,
    @Query('email') email?: string,
  ) {
    try {
      return await this.adminTenantService.searchUsers(tenantId, { phone, email });
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('search users failed', err);
      throw new BusinessException(100005, '搜索用户失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':tenantId/members/invite')
  @RequirePermissions(PERMISSIONS.TENANT_MEMBER_WRITE)
  async inviteMember(
    @Param('tenantId') tenantId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminTenantService.inviteMember(tenantId, {
        userId: String(body.userId ?? ''),
        orgId: body.orgId != null ? String(body.orgId) : null,
        positionId: body.positionId != null ? String(body.positionId) : null,
        tenantRole: body.tenantRole != null ? Number(body.tenantRole) : undefined,
      });
      this.audit(req, user, AUDIT_ACTIONS.TENANT_MEMBER_INVITE, 'tenant_member', String(body.userId ?? ''), {
        tenantId,
        orgId: body.orgId ?? null,
        positionId: body.positionId ?? null,
        tenantRole: body.tenantRole ?? null,
      });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('invite member failed', err);
      throw new BusinessException(100005, '邀请成员失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':tenantId/members/:userId')
  @RequirePermissions(PERMISSIONS.TENANT_MEMBER_WRITE)
  async updateMember(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminTenantService.updateMember(tenantId, userId, body);
      this.audit(req, user, AUDIT_ACTIONS.TENANT_MEMBER_UPDATE, 'tenant_member', userId, {
        tenantId,
        fields: AdminTenantController.keysOf(body),
        orgId: body.orgId ?? null,
        positionId: body.positionId ?? null,
        status: body.status ?? null,
      });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update member failed', err);
      throw new BusinessException(100005, '更新成员失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':tenantId/members/:userId')
  @RequirePermissions(PERMISSIONS.TENANT_MEMBER_WRITE)
  async deleteMember(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminTenantService.deleteMember(tenantId, userId);
      this.audit(req, user, AUDIT_ACTIONS.TENANT_MEMBER_REMOVE, 'tenant_member', userId, { tenantId });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('delete member failed', err);
      throw new BusinessException(100005, '删除成员失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':tenantId/organizations')
  @RequirePermissions(PERMISSIONS.TENANT_ORG_READ)
  async organizations(@Param('tenantId') tenantId: string) {
    try {
      return await this.adminTenantService.listOrganizations(tenantId);
    } catch (err) {
      this.logger.error('orgs failed', err);
      throw new BusinessException(100005, '获取组织架构失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':tenantId/organizations')
  @RequirePermissions(PERMISSIONS.TENANT_ORG_WRITE)
  async createOrganization(
    @Param('tenantId') tenantId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminTenantService.createOrganization(tenantId, body);
      this.audit(req, user, AUDIT_ACTIONS.TENANT_ORG_CREATE, 'organization', AdminTenantController.idOf(result), {
        tenantId,
        name: body.name ?? null,
        parentId: body.parentId ?? null,
      });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('create org failed', err);
      throw new BusinessException(100005, '创建部门失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':tenantId/organizations/:orgId')
  @RequirePermissions(PERMISSIONS.TENANT_ORG_WRITE)
  async updateOrganization(
    @Param('tenantId') tenantId: string,
    @Param('orgId') orgId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminTenantService.updateOrganization(tenantId, orgId, body);
      this.audit(req, user, AUDIT_ACTIONS.TENANT_ORG_UPDATE, 'organization', orgId, {
        tenantId,
        fields: AdminTenantController.keysOf(body),
        name: body.name ?? null,
      });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update org failed', err);
      throw new BusinessException(100005, '更新部门失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':tenantId/organizations/:orgId')
  @RequirePermissions(PERMISSIONS.TENANT_ORG_WRITE)
  async deleteOrganization(
    @Param('tenantId') tenantId: string,
    @Param('orgId') orgId: string,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminTenantService.deleteOrganization(tenantId, orgId);
      this.audit(req, user, AUDIT_ACTIONS.TENANT_ORG_DELETE, 'organization', orgId, { tenantId });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('delete org failed', err);
      throw new BusinessException(100005, '删除部门失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':tenantId/positions')
  @RequirePermissions(PERMISSIONS.TENANT_ORG_READ)
  async positions(@Param('tenantId') tenantId: string) {
    try {
      return await this.adminTenantService.listPositions(tenantId);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('positions failed', err);
      throw new BusinessException(100005, '获取职位失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':tenantId/position-groups')
  @RequirePermissions(PERMISSIONS.TENANT_ORG_WRITE)
  async createPositionGroup(
    @Param('tenantId') tenantId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminTenantService.createPositionGroup(tenantId, body);
      this.audit(req, user, AUDIT_ACTIONS.TENANT_POSITION_GROUP_CREATE, 'tenant_position_group', AdminTenantController.idOf(result), {
        tenantId,
        name: body.name ?? null,
      });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('create position group failed', err);
      throw new BusinessException(100005, '创建职位分组失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':tenantId/positions')
  @RequirePermissions(PERMISSIONS.TENANT_ORG_WRITE)
  async createPosition(
    @Param('tenantId') tenantId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminTenantService.createPosition(tenantId, body);
      this.audit(req, user, AUDIT_ACTIONS.TENANT_POSITION_CREATE, 'tenant_position', AdminTenantController.idOf(result), {
        tenantId,
        name: body.name ?? null,
        groupId: body.groupId ?? null,
      });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('create position failed', err);
      throw new BusinessException(100005, '创建职位失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':tenantId/position-groups/:groupId')
  @RequirePermissions(PERMISSIONS.TENANT_ORG_WRITE)
  async updatePositionGroup(
    @Param('tenantId') tenantId: string,
    @Param('groupId') groupId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminTenantService.updatePositionGroup(tenantId, groupId, body);
      this.audit(req, user, AUDIT_ACTIONS.TENANT_POSITION_GROUP_UPDATE, 'tenant_position_group', groupId, {
        tenantId,
        name: body.name ?? null,
      });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update position group failed', err);
      throw new BusinessException(100005, '更新职位分组失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':tenantId/position-groups/:groupId')
  @RequirePermissions(PERMISSIONS.TENANT_ORG_WRITE)
  async deletePositionGroup(
    @Param('tenantId') tenantId: string,
    @Param('groupId') groupId: string,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminTenantService.deletePositionGroup(tenantId, groupId);
      this.audit(req, user, AUDIT_ACTIONS.TENANT_POSITION_GROUP_DELETE, 'tenant_position_group', groupId, { tenantId });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('delete position group failed', err);
      throw new BusinessException(100005, '删除职位分组失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':tenantId/positions/:positionId')
  @RequirePermissions(PERMISSIONS.TENANT_ORG_WRITE)
  async updatePosition(
    @Param('tenantId') tenantId: string,
    @Param('positionId') positionId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminTenantService.updatePosition(tenantId, positionId, body);
      this.audit(req, user, AUDIT_ACTIONS.TENANT_POSITION_UPDATE, 'tenant_position', positionId, {
        tenantId,
        fields: AdminTenantController.keysOf(body),
        name: body.name ?? null,
      });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update position failed', err);
      throw new BusinessException(100005, '更新职位失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':tenantId/positions/:positionId')
  @RequirePermissions(PERMISSIONS.TENANT_ORG_WRITE)
  async deletePosition(
    @Param('tenantId') tenantId: string,
    @Param('positionId') positionId: string,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminTenantService.deletePosition(tenantId, positionId);
      this.audit(req, user, AUDIT_ACTIONS.TENANT_POSITION_DELETE, 'tenant_position', positionId, { tenantId });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('delete position failed', err);
      throw new BusinessException(100005, '删除职位失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':tenantId/positions/:positionId/members')
  @RequirePermissions(PERMISSIONS.TENANT_MEMBER_WRITE)
  async assignPositionMembers(
    @Param('tenantId') tenantId: string,
    @Param('positionId') positionId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminTenantService.assignPositionMembers(tenantId, positionId, body);
      this.audit(req, user, AUDIT_ACTIONS.TENANT_POSITION_ASSIGN, 'tenant_position', positionId, {
        tenantId,
        added: Array.isArray(body.userIds) ? body.userIds.length : null,
      });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('assign position members failed', err);
      throw new BusinessException(100005, '添加职位成员失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':tenantId/positions/:positionId/members/:userId')
  @RequirePermissions(PERMISSIONS.TENANT_MEMBER_WRITE)
  async removePositionMember(
    @Param('tenantId') tenantId: string,
    @Param('positionId') positionId: string,
    @Param('userId') userId: string,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminTenantService.removePositionMember(tenantId, positionId, userId);
      this.audit(req, user, AUDIT_ACTIONS.TENANT_POSITION_ASSIGN, 'tenant_position', positionId, {
        tenantId,
        removedUserId: userId,
      });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('remove position member failed', err);
      throw new BusinessException(100005, '移除职位成员失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':tenantId/roles')
  @RequirePermissions(PERMISSIONS.TENANT_MEMBER_READ)
  async roles(@Param('tenantId') tenantId: string) {
    try {
      return await this.adminTenantService.listRoles(tenantId);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('roles failed', err);
      throw new BusinessException(100005, '获取角色失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':tenantId/roles')
  @RequirePermissions(PERMISSIONS.TENANT_MEMBER_WRITE)
  async createRole(
    @Param('tenantId') tenantId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminTenantService.createRole(tenantId, body);
      this.audit(req, user, AUDIT_ACTIONS.TENANT_ROLE_CREATE, 'tenant_role', AdminTenantController.idOf(result), {
        tenantId,
        name: body.name ?? null,
        permissions: body.permissions ?? null,
      });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('create role failed', err);
      throw new BusinessException(100005, '创建角色失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':tenantId/roles/:roleId')
  @RequirePermissions(PERMISSIONS.TENANT_MEMBER_WRITE)
  async updateRole(
    @Param('tenantId') tenantId: string,
    @Param('roleId') roleId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminTenantService.updateRole(tenantId, roleId, body);
      this.audit(req, user, AUDIT_ACTIONS.TENANT_ROLE_UPDATE, 'tenant_role', roleId, {
        tenantId,
        fields: AdminTenantController.keysOf(body),
        permissions: body.permissions ?? null,
      });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update role failed', err);
      throw new BusinessException(100005, '更新角色失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':tenantId/roles/:roleId')
  @RequirePermissions(PERMISSIONS.TENANT_MEMBER_WRITE)
  async deleteRole(
    @Param('tenantId') tenantId: string,
    @Param('roleId') roleId: string,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminTenantService.deleteRole(tenantId, roleId);
      this.audit(req, user, AUDIT_ACTIONS.TENANT_ROLE_DELETE, 'tenant_role', roleId, { tenantId });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('delete role failed', err);
      throw new BusinessException(100005, '删除角色失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':tenantId/roles/:roleId/members')
  @RequirePermissions(PERMISSIONS.TENANT_MEMBER_WRITE)
  async assignRoleMembers(
    @Param('tenantId') tenantId: string,
    @Param('roleId') roleId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminTenantService.assignRoleMembers(tenantId, roleId, body);
      this.audit(req, user, AUDIT_ACTIONS.TENANT_ROLE_MEMBERS_UPDATE, 'tenant_role', roleId, {
        tenantId,
        added: Array.isArray(body.userIds) ? body.userIds.length : null,
      });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('assign role members failed', err);
      throw new BusinessException(100005, '添加角色成员失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':tenantId/roles/:roleId/members/:userId')
  @RequirePermissions(PERMISSIONS.TENANT_MEMBER_WRITE)
  async removeRoleMember(
    @Param('tenantId') tenantId: string,
    @Param('roleId') roleId: string,
    @Param('userId') userId: string,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminTenantService.removeRoleMember(tenantId, roleId, userId);
      this.audit(req, user, AUDIT_ACTIONS.TENANT_ROLE_MEMBERS_UPDATE, 'tenant_role', roleId, {
        tenantId,
        removedUserId: userId,
      });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('remove role member failed', err);
      throw new BusinessException(100005, '移除角色成员失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':tenantId/documents')
  @RequirePermissions(PERMISSIONS.TENANT_DOCUMENT_READ)
  async documents(@Param('tenantId') tenantId: string) {
    try {
      const items = await this.storageService.listTenantDocuments(tenantId);
      return { items, total: items.length };
    } catch (err) {
      this.logger.error('documents failed', err);
      throw new BusinessException(100005, '获取团队文档失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
