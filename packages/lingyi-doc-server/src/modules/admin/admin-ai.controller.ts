import {
  Body,
  Controller,
  Get,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PERMISSIONS } from '../../constants/rbac';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AuditLogRepository } from '../../repositories/audit-log.repository';
import { AuthService } from '../../services/auth.service';
import { AIService, type AdminUsageFilter } from '../ai/ai.service';
import { AiConfigService, type UpdateAiModelConfigDto } from '../ai/ai-config.service';

@Controller('api/v1/admin/ai')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AuthAudience('admin')
export class AdminAiController {
  constructor(
    private readonly aiService: AIService,
    private readonly aiConfigService: AiConfigService,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly authService: AuthService,
  ) {}

  private writeAudit(
    req: Request,
    user: AuthUser,
    action: string,
    detail?: unknown,
  ) {
    void this.auditLogRepository.create({
      operatorId: user.userId,
      action,
      targetType: 'ai_config',
      detail,
      ip: this.authService.getClientIp(req),
      userAgent: this.authService.getUserAgent(req),
    });
  }

  private parseFilter(query: {
    tenantId?: string;
    agentId?: string;
    model?: string;
  }): AdminUsageFilter {
    const filter: AdminUsageFilter = {};
    if (query.tenantId) filter.tenantId = query.tenantId;
    if (query.agentId) filter.agentId = query.agentId;
    if (query.model) filter.model = query.model;
    return filter;
  }

  @Get('config')
  @RequirePermissions(PERMISSIONS.AI_CONFIG_READ)
  getConfig() {
    return this.aiConfigService.getConfigForAdmin();
  }

  @Put('config')
  @RequirePermissions(PERMISSIONS.AI_CONFIG_WRITE)
  async updateConfig(
    @Body() body: UpdateAiModelConfigDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const config = await this.aiConfigService.updateConfig(body, user.userId);
    this.writeAudit(req, user, 'ai.config.update', body);
    return config;
  }

  @Get('usage')
  @RequirePermissions(PERMISSIONS.AI_USAGE_READ)
  getUsage(@Query() query: { tenantId?: string; agentId?: string; model?: string }) {
    return this.aiService.getAdminUsageStats(this.parseFilter(query));
  }

  @Get('usage/daily')
  @RequirePermissions(PERMISSIONS.AI_USAGE_READ)
  getDailyUsage(
    @Query() query: { tenantId?: string; agentId?: string; model?: string; period?: string },
  ) {
    const period = query.period === 'week' || query.period === 'month' ? query.period : 'day';
    return this.aiService.getAdminTrendUsageStats(this.parseFilter(query), period);
  }

  @Get('usage/trend')
  @RequirePermissions(PERMISSIONS.AI_USAGE_READ)
  getTrendUsage(
    @Query() query: { tenantId?: string; agentId?: string; model?: string; period?: string },
  ) {
    const period = query.period === 'week' || query.period === 'month' ? query.period : 'day';
    return this.aiService.getAdminTrendUsageStats(this.parseFilter(query), period);
  }

  @Get('usage/by-model')
  @RequirePermissions(PERMISSIONS.AI_USAGE_READ)
  getUsageByModel(@Query() query: { tenantId?: string; agentId?: string; model?: string }) {
    return this.aiService.getAdminUsageByModelStats(this.parseFilter(query));
  }

  @Get('usage/by-agent')
  @RequirePermissions(PERMISSIONS.AI_USAGE_READ)
  getUsageByAgent(@Query() query: { tenantId?: string; agentId?: string; model?: string }) {
    return this.aiService.getAdminUsageByAgentStats(this.parseFilter(query));
  }

  @Get('usage/recent')
  @RequirePermissions(PERMISSIONS.AI_USAGE_READ)
  getRecentUsage(
    @Query('limit') limit?: string,
    @Query() query?: { tenantId?: string; agentId?: string; model?: string },
  ) {
    return this.aiService.getAdminRecentUsage(
      limit ? parseInt(limit, 10) : 30,
      this.parseFilter(query ?? {}),
    );
  }

  @Get('usage/hourly')
  @RequirePermissions(PERMISSIONS.AI_USAGE_READ)
  getHourlyUsage(@Query() query: { tenantId?: string; agentId?: string; model?: string }) {
    return this.aiService.getAdminHourlyUsageStats(this.parseFilter(query));
  }
}
