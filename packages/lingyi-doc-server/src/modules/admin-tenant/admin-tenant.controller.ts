import {
  Controller,
  Get,
  HttpStatus,
  Logger,
  Param,
  UseGuards,
} from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PERMISSIONS } from '../../constants/rbac';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { OrganizationRepository } from '../../repositories/organization.repository';
import { TenantMemberRepository } from '../../repositories/tenant-member.repository';
import { TenantRepository } from '../../repositories/tenant.repository';
import { DeployService } from '../../config/deploy.service';
import { StorageService } from '../../services/storage.service';

@Controller('api/v1/admin/tenants')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AuthAudience('admin')
export class AdminTenantController {
  private readonly logger = new Logger(AdminTenantController.name);

  constructor(
    private readonly tenantRepository: TenantRepository,
    private readonly tenantMemberRepository: TenantMemberRepository,
    private readonly organizationRepository: OrganizationRepository,
    private readonly storageService: StorageService,
    private readonly deployService: DeployService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PLATFORM_TENANT_READ)
  async listAll() {
    try {
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
        deployType: this.deployService.type,
      };
    } catch (err) {
      this.logger.error('list failed', err);
      throw new BusinessException(100005, '获取租户列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':tenantId/members')
  @RequirePermissions(PERMISSIONS.TENANT_MEMBER_READ)
  async members(@Param('tenantId') tenantId: string) {
    try {
      const members = await this.tenantMemberRepository.listByTenant(tenantId);
      return { items: members, total: members.length };
    } catch (err) {
      this.logger.error('members failed', err);
      throw new BusinessException(100005, '获取成员失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':tenantId/organizations')
  @RequirePermissions(PERMISSIONS.TENANT_ORG_READ)
  async organizations(@Param('tenantId') tenantId: string) {
    try {
      const items = await this.organizationRepository.listByTenant(tenantId);
      return { items };
    } catch (err) {
      this.logger.error('orgs failed', err);
      throw new BusinessException(100005, '获取组织架构失败', HttpStatus.INTERNAL_SERVER_ERROR);
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
