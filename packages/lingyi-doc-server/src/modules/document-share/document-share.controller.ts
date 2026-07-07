import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Logger,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../auth/guards/tenant-context.guard';
import { DocumentShareService } from './document-share.service';

@Controller('api/v1/c/docs/:docId/share')
@UseGuards(JwtAuthGuard, TenantContextGuard)
@AuthAudience('consumer')
export class DocumentShareController {
  private readonly logger = new Logger(DocumentShareController.name);

  constructor(private readonly documentShareService: DocumentShareService) {}

  @Get()
  async getShareConfig(@CurrentUser() user: AuthUser, @Param('docId') docId: string) {
    try {
      return this.documentShareService.getShareConfig(user, docId);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('getShareConfig failed', err);
      throw new BusinessException(100005, '获取分享配置失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put()
  async upsertShare(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    try {
      return this.documentShareService.upsertShare(user, docId, {
        permissionLevel: typeof body.permissionLevel === 'string' ? body.permissionLevel : 'read',
        expireTime: body.expireTime === null
          ? null
          : typeof body.expireTime === 'string'
            ? body.expireTime
            : undefined,
        password: typeof body.password === 'string' ? body.password : undefined,
        clearPassword: body.clearPassword === true,
        allowDownload: body.allowDownload !== false,
        allowPrint: body.allowPrint !== false,
        allowCopy: body.allowCopy !== false,
        allowReshare: body.allowReshare === true,
        watermarkEnabled: body.watermarkEnabled === true,
      }, req.ip);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('upsertShare failed', err);
      throw new BusinessException(100005, '保存分享配置失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('close')
  async closeShare(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Req() req: Request,
  ) {
    try {
      return this.documentShareService.closeShare(user, docId, req.ip);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('closeShare failed', err);
      throw new BusinessException(100005, '关闭分享失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('collaborators')
  async listCollaborators(@CurrentUser() user: AuthUser, @Param('docId') docId: string) {
    try {
      return this.documentShareService.listCollaborators(user, docId);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('listCollaborators failed', err);
      throw new BusinessException(100005, '获取协作者失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('collaborators')
  async addCollaborator(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    try {
      return this.documentShareService.addCollaborator(user, docId, {
        userId: typeof body.userId === 'string' ? body.userId : '',
        permissionLevel: typeof body.permissionLevel === 'string' ? body.permissionLevel : 'read',
      }, req.ip);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('addCollaborator failed', err);
      throw new BusinessException(100005, '添加协作者失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete('collaborators/:userId')
  async removeCollaborator(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    try {
      return this.documentShareService.removeCollaborator(user, docId, userId, req.ip);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('removeCollaborator failed', err);
      throw new BusinessException(100005, '移除协作者失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put('member')
  async upsertMemberShare(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    try {
      return this.documentShareService.upsertMemberShare(user, docId, {
        permissionLevel: typeof body.permissionLevel === 'string' ? body.permissionLevel : 'read',
        expireTime: body.expireTime === null
          ? null
          : typeof body.expireTime === 'string'
            ? body.expireTime
            : undefined,
      }, req.ip);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('upsertMemberShare failed', err);
      throw new BusinessException(100005, '保存成员分享失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('member/close')
  async closeMemberShare(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Req() req: Request,
  ) {
    try {
      return this.documentShareService.closeMemberShare(user, docId, req.ip);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('closeMemberShare failed', err);
      throw new BusinessException(100005, '关闭成员分享失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('join-requests')
  async listJoinRequests(@CurrentUser() user: AuthUser, @Param('docId') docId: string) {
    try {
      return this.documentShareService.listJoinRequests(user, docId);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('listJoinRequests failed', err);
      throw new BusinessException(100005, '获取加入申请失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('join-requests/:requestId/approve')
  async approveJoinRequest(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Param('requestId') requestId: string,
    @Req() req: Request,
  ) {
    try {
      return this.documentShareService.approveJoinRequest(user, docId, requestId, req.ip);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('approveJoinRequest failed', err);
      throw new BusinessException(100005, '审核失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('join-requests/:requestId/reject')
  async rejectJoinRequest(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Param('requestId') requestId: string,
    @Req() req: Request,
  ) {
    try {
      return this.documentShareService.rejectJoinRequest(user, docId, requestId, req.ip);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('rejectJoinRequest failed', err);
      throw new BusinessException(100005, '拒绝申请失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
