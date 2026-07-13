import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../auth/guards/tenant-context.guard';
import { DocumentCommentService } from './document-comment.service';
import type { DocCommentAnchorDto } from '../../types/document-comment';

@Controller(['api/v1/c/docs', 'api/v1/docs'])
@UseGuards(JwtAuthGuard, TenantContextGuard)
@AuthAudience('consumer')
export class DocumentCommentController {
  private readonly logger = new Logger(DocumentCommentController.name);

  constructor(private readonly commentService: DocumentCommentService) {}

  @Get(':docId/comments')
  async list(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
  ) {
    try {
      return await this.commentService.list(docId, user);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('list comments failed', err);
      throw new BusinessException(100005, '获取评论失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':docId/comments')
  async create(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Body() body: { id?: string; anchor?: DocCommentAnchorDto; text?: string },
  ) {
    try {
      if (!body?.anchor?.blockId) {
        throw new BusinessException(100002, '缺少评论锚点');
      }
      return await this.commentService.createThread(docId, user, {
        id: body.id,
        anchor: body.anchor,
        text: body.text,
      });
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('create comment failed', err);
      throw new BusinessException(100005, '创建评论失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':docId/comments/:threadId/replies')
  async reply(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Param('threadId') threadId: string,
    @Body() body: { text?: string },
  ) {
    try {
      const text = typeof body?.text === 'string' ? body.text.trim() : '';
      if (!text) {
        throw new BusinessException(100002, '回复内容不能为空');
      }
      return await this.commentService.addReply(docId, threadId, user, text);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('reply comment failed', err);
      throw new BusinessException(100005, '回复评论失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':docId/comments/:threadId/resolve')
  async resolve(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Param('threadId') threadId: string,
  ) {
    try {
      return await this.commentService.resolveThread(docId, threadId, user);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('resolve comment failed', err);
      throw new BusinessException(100005, '解决评论失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':docId/comments/:threadId/anchor')
  async updateAnchor(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Param('threadId') threadId: string,
    @Body() body: { pinX?: number; pinY?: number },
  ) {
    try {
      const pinX = Number(body?.pinX);
      const pinY = Number(body?.pinY);
      if (!Number.isFinite(pinX) || !Number.isFinite(pinY)) {
        throw new BusinessException(100002, '缺少评论位置');
      }
      return await this.commentService.updateAnchor(docId, threadId, user, pinX, pinY);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update comment anchor failed', err);
      throw new BusinessException(100005, '更新评论位置失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':docId/comments/:threadId/replies/:replyId')
  async editReply(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Param('threadId') threadId: string,
    @Param('replyId') replyId: string,
    @Body() body: { text?: string },
  ) {
    try {
      const text = typeof body?.text === 'string' ? body.text.trim() : '';
      if (!text) {
        throw new BusinessException(100002, '评论内容不能为空');
      }
      return await this.commentService.editReply(docId, threadId, replyId, user, text);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('edit comment failed', err);
      throw new BusinessException(100005, '编辑评论失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':docId/comments/:threadId/replies/:replyId')
  async deleteReply(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Param('threadId') threadId: string,
    @Param('replyId') replyId: string,
  ) {
    try {
      return await this.commentService.deleteReply(docId, threadId, replyId, user);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('delete comment failed', err);
      throw new BusinessException(100005, '删除评论失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':docId/comments/:threadId/replies/:replyId/like')
  async toggleLike(
    @CurrentUser() user: AuthUser,
    @Param('docId') docId: string,
    @Param('threadId') threadId: string,
    @Param('replyId') replyId: string,
  ) {
    try {
      return await this.commentService.toggleReplyLike(docId, threadId, replyId, user);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('like comment failed', err);
      throw new BusinessException(100005, '点赞失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
