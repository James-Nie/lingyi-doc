import {
  Body,
  Controller,
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
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../auth/guards/optional-jwt-auth.guard';
import { TenantContextGuard } from '../../auth/guards/tenant-context.guard';
import { DocumentShareService } from './document-share.service';

@Controller('api/v1')
export class DocumentShareJoinController {
  private readonly logger = new Logger(DocumentShareJoinController.name);

  constructor(private readonly documentShareService: DocumentShareService) {}

  @Get('share/join/:spaceSlug/:bookSlug/:docSlug/collaborator')
  @UseGuards(OptionalJwtAuthGuard)
  async getCollaboratorJoinInfo(
    @Param('spaceSlug') spaceSlug: string,
    @Param('bookSlug') bookSlug: string,
    @Param('docSlug') docSlug: string,
    @Query('token') token: string,
    @CurrentUser() user?: AuthUser,
  ) {
    try {
      if (!token) throw new BusinessException(100002, '缺少分享 token');
      return this.documentShareService.getCollaboratorJoinInfo(spaceSlug, bookSlug, docSlug, token, user);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('getCollaboratorJoinInfo failed', err);
      throw new BusinessException(100005, '获取分享信息失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('c/share/join/:spaceSlug/:bookSlug/:docSlug/collaborator')
  @UseGuards(JwtAuthGuard, TenantContextGuard)
  @AuthAudience('consumer')
  async applyCollaboratorJoin(
    @CurrentUser() user: AuthUser,
    @Param('spaceSlug') spaceSlug: string,
    @Param('bookSlug') bookSlug: string,
    @Param('docSlug') docSlug: string,
    @Body() body: Record<string, unknown>,
    @Query('token') tokenQuery: string,
  ) {
    try {
      const token = typeof body.token === 'string' && body.token
        ? body.token
        : tokenQuery;
      if (!token) throw new BusinessException(100002, '缺少分享 token');
      const message = typeof body.message === 'string' ? body.message : undefined;
      return this.documentShareService.applyCollaboratorJoin(
        user,
        spaceSlug,
        bookSlug,
        docSlug,
        token,
        message,
      );
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('applyCollaboratorJoin failed', err);
      throw new BusinessException(100005, '申请加入失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('c/docs/by-path/:spaceSlug/:bookSlug/:docSlug')
  @UseGuards(OptionalJwtAuthGuard)
  async loadDocumentByPath(
    @Param('spaceSlug') spaceSlug: string,
    @Param('bookSlug') bookSlug: string,
    @Param('docSlug') docSlug: string,
    @Query('token') token: string | undefined,
    @CurrentUser() user?: AuthUser,
    @Req() req?: Request,
  ) {
    try {
      const userAgent = req?.headers['user-agent'];
      return this.documentShareService.loadDocumentByPath(spaceSlug, bookSlug, docSlug, {
        auth: user,
        token: token || null,
        visitorIp: req?.ip ?? null,
        deviceInfo: typeof userAgent === 'string' ? userAgent.slice(0, 500) : null,
      });
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('loadDocumentByPath failed', err);
      throw new BusinessException(100005, '加载文档失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('docs/by-path/:spaceSlug/:bookSlug/:docSlug/access')
  @UseGuards(OptionalJwtAuthGuard)
  async verifyDocumentByPath(
    @Param('spaceSlug') spaceSlug: string,
    @Param('bookSlug') bookSlug: string,
    @Param('docSlug') docSlug: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @CurrentUser() user?: AuthUser,
  ) {
    try {
      const token = typeof body.token === 'string' ? body.token : undefined;
      const password = typeof body.password === 'string' ? body.password : undefined;
      const userAgent = req.headers['user-agent'];
      return this.documentShareService.loadDocumentByPath(spaceSlug, bookSlug, docSlug, {
        auth: user,
        token: token || null,
        password,
        visitorIp: req.ip ?? null,
        deviceInfo: typeof userAgent === 'string' ? userAgent.slice(0, 500) : null,
      });
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('verifyDocumentByPath failed', err);
      throw new BusinessException(100005, '验证访问失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** @deprecated 仅解析 docId，请改用 loadDocumentByPath */
  @Get('c/docs/by-path/:spaceSlug/:bookSlug/:docSlug/resolve')
  @UseGuards(JwtAuthGuard, TenantContextGuard)
  @AuthAudience('consumer')
  async resolveDocByPath(
    @Param('spaceSlug') spaceSlug: string,
    @Param('bookSlug') bookSlug: string,
    @Param('docSlug') docSlug: string,
  ) {
    try {
      return this.documentShareService.resolveDocByPath(spaceSlug, bookSlug, docSlug);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('resolveDocByPath failed', err);
      throw new BusinessException(100005, '解析文档路径失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
