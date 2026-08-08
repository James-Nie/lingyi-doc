import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PERMISSIONS } from '../../constants/rbac';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AuditLogRepository } from '../../repositories/audit-log.repository';
import { AuthService } from '../../services/auth.service';
import { AdminApiKeyService } from './admin-api-key.service';

@Controller('api/v1/admin/api-keys')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AuthAudience('admin')
export class AdminApiKeyController {
  private readonly logger = new Logger(AdminApiKeyController.name);

  constructor(
    private readonly adminApiKeyService: AdminApiKeyService,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CONFIG_READ)
  async list(@Query('tenantId') tenantId?: string) {
    try {
      return await this.adminApiKeyService.listApiKeys(
        typeof tenantId === 'string' ? tenantId : undefined,
      );
    } catch (err) {
      this.logger.error('list api keys failed', err);
      throw new BusinessException(100005, '获取 API 密钥列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CONFIG_WRITE)
  async create(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const name = String(body.name ?? '').trim();
      if (!name) throw new BusinessException(100002, '名称不能为空');
      const result = await this.adminApiKeyService.createApiKey({
        tenantId: body.tenantId != null ? String(body.tenantId) : null,
        name,
        permissions: Array.isArray(body.permissions) ? body.permissions.map(String) : [],
        expiresAt: body.expiresAt != null ? String(body.expiresAt) : null,
        createdBy: user.userId,
      });
      void this.auditLogRepository.create({
        operatorId: user.userId,
        action: 'api_key.create',
        targetType: 'api_key',
        targetId: result.id,
        detail: { name: result.name },
        ip: this.authService.getClientIp(req),
        userAgent: this.authService.getUserAgent(req),
      });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('create api key failed', err);
      throw new BusinessException(100005, '创建 API 密钥失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CONFIG_WRITE)
  async revoke(
    @Param('id') id: string,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.adminApiKeyService.revokeApiKey(id);
      void this.auditLogRepository.create({
        operatorId: user.userId,
        action: 'api_key.revoke',
        targetType: 'api_key',
        targetId: id,
        ip: this.authService.getClientIp(req),
        userAgent: this.authService.getUserAgent(req),
      });
      return result;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('revoke api key failed', err);
      throw new BusinessException(100005, '撤销 API 密钥失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}