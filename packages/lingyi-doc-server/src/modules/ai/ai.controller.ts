import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../auth/guards/tenant-context.guard';
import { AIService } from './ai.service';
import { AiConfigService } from './ai-config.service';
import { AIModuleGuard } from './ai.guard';

@Controller('api/v1/ai')
@UseGuards(JwtAuthGuard, TenantContextGuard, AIModuleGuard)
@AuthAudience('consumer')
export class AIController {
  constructor(
    private readonly aiService: AIService,
    private readonly aiConfigService: AiConfigService,
  ) {}

  @Get('models')
  async getModels() {
    const defaultModel = await this.aiConfigService.getDefaultModel();
    const models = await this.aiConfigService.getModels();
    return this.aiService.getAvailableModels(defaultModel, models);
  }

  @Get('usage')
  getUsage(@CurrentUser() user: AuthUser) {
    return this.aiService.getUsageStats(user);
  }

  @Get('usage/daily')
  getDailyUsage(@CurrentUser() user: AuthUser) {
    return this.aiService.getDailyUsageStats(user);
  }

  @Get('usage/by-model')
  getUsageByModel(@CurrentUser() user: AuthUser) {
    return this.aiService.getUsageByModelStats(user);
  }

  @Get('usage/recent')
  getRecentUsage(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
  ) {
    return this.aiService.getRecentUsage(user, limit ? parseInt(limit, 10) : 20);
  }

  @Get('usage/hourly')
  getHourlyUsage(@CurrentUser() user: AuthUser) {
    return this.aiService.getHourlyUsageStats(user);
  }
}
