import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BusinessException } from '../../common/exceptions/business.exception';
import { MembershipService } from './membership.service';

@Controller('api/v1/c/membership')
@UseGuards(JwtAuthGuard)
@AuthAudience('consumer')
export class MembershipController {
  private readonly logger = new Logger(MembershipController.name);

  constructor(private readonly membershipService: MembershipService) {}

  @Get('summary')
  async summary(@CurrentUser() user: AuthUser) {
    try {
      return await this.membershipService.getSummary(user);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('summary failed', err);
      throw new BusinessException(100005, '获取会员信息失败');
    }
  }
}
