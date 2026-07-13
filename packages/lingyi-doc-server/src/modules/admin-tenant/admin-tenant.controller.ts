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
  UseGuards,
} from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PERMISSIONS } from '../../constants/rbac';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { DeployService } from '../../config/deploy.service';
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
  ) {}

  @Get('workspace')
  async workspace() {
    try {
      return await this.adminTenantService.getWorkspaceTenants();
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
  async addMember(@Param('tenantId') tenantId: string, @Body() body: Record<string, unknown>) {
    try {
      return await this.adminTenantService.addMember(tenantId, body);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('add member failed', err);
      throw new BusinessException(100005, '添加成员失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':tenantId/members/:userId')
  @RequirePermissions(PERMISSIONS.TENANT_MEMBER_WRITE)
  async updateMember(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      return await this.adminTenantService.updateMember(tenantId, userId, body);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update member failed', err);
      throw new BusinessException(100005, '更新成员失败', HttpStatus.INTERNAL_SERVER_ERROR);
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
  async createOrganization(@Param('tenantId') tenantId: string, @Body() body: Record<string, unknown>) {
    try {
      return await this.adminTenantService.createOrganization(tenantId, body);
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
  ) {
    try {
      return await this.adminTenantService.updateOrganization(tenantId, orgId, body);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update org failed', err);
      throw new BusinessException(100005, '更新部门失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':tenantId/organizations/:orgId')
  @RequirePermissions(PERMISSIONS.TENANT_ORG_WRITE)
  async deleteOrganization(@Param('tenantId') tenantId: string, @Param('orgId') orgId: string) {
    try {
      return await this.adminTenantService.deleteOrganization(tenantId, orgId);
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
  async createPositionGroup(@Param('tenantId') tenantId: string, @Body() body: Record<string, unknown>) {
    try {
      return await this.adminTenantService.createPositionGroup(tenantId, body);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('create position group failed', err);
      throw new BusinessException(100005, '创建职位分组失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':tenantId/positions')
  @RequirePermissions(PERMISSIONS.TENANT_ORG_WRITE)
  async createPosition(@Param('tenantId') tenantId: string, @Body() body: Record<string, unknown>) {
    try {
      return await this.adminTenantService.createPosition(tenantId, body);
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
  ) {
    try {
      return await this.adminTenantService.updatePositionGroup(tenantId, groupId, body);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update position group failed', err);
      throw new BusinessException(100005, '更新职位分组失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':tenantId/position-groups/:groupId')
  @RequirePermissions(PERMISSIONS.TENANT_ORG_WRITE)
  async deletePositionGroup(@Param('tenantId') tenantId: string, @Param('groupId') groupId: string) {
    try {
      return await this.adminTenantService.deletePositionGroup(tenantId, groupId);
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
  ) {
    try {
      return await this.adminTenantService.updatePosition(tenantId, positionId, body);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update position failed', err);
      throw new BusinessException(100005, '更新职位失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':tenantId/positions/:positionId')
  @RequirePermissions(PERMISSIONS.TENANT_ORG_WRITE)
  async deletePosition(@Param('tenantId') tenantId: string, @Param('positionId') positionId: string) {
    try {
      return await this.adminTenantService.deletePosition(tenantId, positionId);
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
  ) {
    try {
      return await this.adminTenantService.assignPositionMembers(tenantId, positionId, body);
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
  ) {
    try {
      return await this.adminTenantService.removePositionMember(tenantId, positionId, userId);
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
  async createRole(@Param('tenantId') tenantId: string, @Body() body: Record<string, unknown>) {
    try {
      return await this.adminTenantService.createRole(tenantId, body);
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
  ) {
    try {
      return await this.adminTenantService.updateRole(tenantId, roleId, body);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update role failed', err);
      throw new BusinessException(100005, '更新角色失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':tenantId/roles/:roleId')
  @RequirePermissions(PERMISSIONS.TENANT_MEMBER_WRITE)
  async deleteRole(@Param('tenantId') tenantId: string, @Param('roleId') roleId: string) {
    try {
      return await this.adminTenantService.deleteRole(tenantId, roleId);
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
  ) {
    try {
      return await this.adminTenantService.assignRoleMembers(tenantId, roleId, body);
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
  ) {
    try {
      return await this.adminTenantService.removeRoleMember(tenantId, roleId, userId);
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
