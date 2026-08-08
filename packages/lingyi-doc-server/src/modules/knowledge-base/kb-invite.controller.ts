import {
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
import { KnowledgeBaseService } from './knowledge-base.service';

@Controller('api/v1/c/kb-invites')
@UseGuards(JwtAuthGuard)
@AuthAudience('consumer')
export class KbInviteController {
  private readonly logger = new Logger(KbInviteController.name);

  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Get(':token')
  async getInfo(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    try {
      return this.knowledgeBaseService.getInviteInfo(user, token);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('getInviteInfo failed', err);
      throw new BusinessException(100005, '获取邀请信息失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':token/join')
  async join(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    try {
      return this.knowledgeBaseService.acceptInvite(user, token);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('acceptInvite failed', err);
      throw new BusinessException(100005, '加入知识库失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
