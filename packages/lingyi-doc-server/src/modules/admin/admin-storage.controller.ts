import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Logger,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PERMISSIONS } from '../../constants/rbac';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AdminStorageService } from './admin-storage.service';

@Controller('api/v1/admin/storage')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AuthAudience('admin')
export class AdminStorageController {
  private readonly logger = new Logger(AdminStorageController.name);

  constructor(
    private readonly adminStorageService: AdminStorageService,
  ) {}

  @Get('overview')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  async overview() {
    try {
      return await this.adminStorageService.getStorageOverview();
    } catch (err) {
      this.logger.error('storage overview failed', err);
      throw new BusinessException(100005, '获取存储概览失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('tenants/:tenantId')
  @RequirePermissions(PERMISSIONS.PLATFORM_TENANT_READ)
  async tenantStorage(@Param('tenantId') tenantId: string) {
    try {
      return await this.adminStorageService.getTenantStorage(tenantId);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('tenant storage failed', err);
      throw new BusinessException(100005, '获取租户存储详情失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put('tenants/:tenantId/quota')
  @RequirePermissions(PERMISSIONS.CONFIG_WRITE)
  async updateQuota(
    @Param('tenantId') tenantId: string,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const quotaBytes = Number(body.quotaBytes);
      if (!quotaBytes || quotaBytes < 1048576) {
        throw new BusinessException(100002, '配额至少为 1 MB');
      }
      return await this.adminStorageService.updateTenantQuota(tenantId, quotaBytes);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update quota failed', err);
      throw new BusinessException(100005, '更新存储配额失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}