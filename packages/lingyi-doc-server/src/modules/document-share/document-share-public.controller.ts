import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../../auth/guards/optional-jwt-auth.guard';
import { DocumentShareService } from './document-share.service';

@Controller('api/v1/share')
export class DocumentSharePublicController {
  private readonly logger = new Logger(DocumentSharePublicController.name);

  constructor(private readonly documentShareService: DocumentShareService) {}

  @Get(':token/resolve-path')
  async resolveSharePath(@Param('token') token: string) {
    try {
      return this.documentShareService.resolveShareTokenPath(token);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('resolveSharePath failed', err);
      throw new BusinessException(100005, '解析分享链接失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':token')
  async getPublicInfo(@Param('token') token: string, @Req() req: Request) {
    try {
      return this.documentShareService.getPublicShareInfo(token, req.ip);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('getPublicInfo failed', err);
      throw new BusinessException(100005, '获取分享信息失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':token/verify')
  @UseGuards(OptionalJwtAuthGuard)
  @AuthAudience('consumer')
  async verifyShare(
    @Param('token') token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user?: AuthUser,
  ) {
    try {
      const userAgent = req.headers['user-agent'];
      return this.documentShareService.verifyPublicShare(
        token,
        typeof body.password === 'string' ? body.password : undefined,
        req.ip,
        typeof userAgent === 'string' ? userAgent.slice(0, 500) : null,
        user?.userId ?? null,
      );
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('verifyShare failed', err);
      throw new BusinessException(100005, '验证分享失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
