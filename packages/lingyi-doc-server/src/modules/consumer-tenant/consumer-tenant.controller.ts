import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Logger,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConsumerTenantService } from './consumer-tenant.service';

@Controller('api/v1/c/tenants')
@UseGuards(JwtAuthGuard)
@AuthAudience('consumer')
export class ConsumerTenantController {
  private readonly logger = new Logger(ConsumerTenantController.name);

  constructor(private readonly consumerTenantService: ConsumerTenantService) {}

  @Get('invitations')
  async listInvitations(@CurrentUser() user: AuthUser) {
    try {
      return await this.consumerTenantService.listInvitations(user.userId);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('list invitations failed', err);
      throw new BusinessException(100005, '获取邀请列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':tenantId/accept')
  async acceptInvitation(@CurrentUser() user: AuthUser, @Param('tenantId') tenantId: string) {
    try {
      return await this.consumerTenantService.acceptInvitation(user.userId, tenantId);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('accept invitation failed', err);
      throw new BusinessException(100005, '接受邀请失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':tenantId/reject')
  async rejectInvitation(@CurrentUser() user: AuthUser, @Param('tenantId') tenantId: string) {
    try {
      return await this.consumerTenantService.rejectInvitation(user.userId, tenantId);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('reject invitation failed', err);
      throw new BusinessException(100005, '拒绝邀请失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}