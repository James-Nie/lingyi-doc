import {
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../common/exceptions/business.exception';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import { DocumentCommentRepository } from '../../repositories/document-comment.repository';
import { DocumentRepository } from '../../repositories/document.repository';
import { DocumentShareRepository } from '../../repositories/document-share.repository';
import { UserRepository } from '../../repositories/user.repository';
import { documentAccessFromAuth } from '../../utils/documentAccessContext';
import { CollabService } from '../collab/collab.service';
import type {
  CommentUpdatePayload,
  DocCommentAnchorDto,
  DocCommentReplyDto,
  DocCommentThreadDto,
} from '../../types/document-comment';

@Injectable()
export class DocumentCommentService implements OnModuleInit {
  private readonly logger = new Logger(DocumentCommentService.name);
  private enabled = false;

  constructor(
    private readonly config: ConfigService,
    private readonly commentRepo: DocumentCommentRepository,
    private readonly documentRepo: DocumentRepository,
    private readonly shareRepo: DocumentShareRepository,
    private readonly userRepo: UserRepository,
    private readonly collabService: CollabService,
  ) {}

  onModuleInit(): void {
    this.enabled = this.config.get<boolean>('comments.enabled', false);
    if (this.enabled) {
      this.logger.log('Document comments API enabled (FEATURE_COMMENTS_ENABLED=true)');
    } else {
      this.logger.log('Document comments API disabled (FEATURE_COMMENTS_ENABLED!=true)');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  assertEnabled(): void {
    if (!this.enabled) {
      throw new BusinessException(220001, '文档评论功能未开启', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  async list(docId: string, auth: AuthUser): Promise<DocCommentThreadDto[]> {
    this.assertEnabled();
    await this.assertCanRead(docId, auth);
    return this.commentRepo.listByDoc(docId, auth.userId);
  }

  async count(docId: string): Promise<number> {
    if (!this.enabled) return 0;
    return this.commentRepo.countByDoc(docId);
  }

  async createThread(
    docId: string,
    auth: AuthUser,
    body: {
      id?: string;
      anchor: DocCommentAnchorDto;
      text?: string;
    },
  ): Promise<DocCommentThreadDto> {
    this.assertEnabled();
    await this.assertCanComment(docId, auth);

    const profile = await this.resolveAuthor(auth);
    const id = typeof body.id === 'string' && body.id.trim()
      ? body.id.trim()
      : `cmt_${Date.now().toString(36)}`;

    const thread = await this.commentRepo.createThread({
      id,
      docId,
      anchor: body.anchor,
      createdBy: auth.userId,
      firstReply: body.text?.trim()
        ? { ...profile, text: body.text }
        : undefined,
    });

    await this.broadcast(docId, auth.userId, {
      action: 'thread_create',
      thread,
    });

    return thread;
  }

  async addReply(
    docId: string,
    threadId: string,
    auth: AuthUser,
    text: string,
  ): Promise<DocCommentReplyDto> {
    this.assertEnabled();
    await this.assertCanComment(docId, auth);

    const existing = await this.commentRepo.findThread(docId, threadId);
    if (!existing || existing.resolved) {
      throw new BusinessException(220002, '评论不存在或已解决', HttpStatus.NOT_FOUND);
    }

    const profile = await this.resolveAuthor(auth);
    const reply = await this.commentRepo.addReply({
      threadId,
      ...profile,
      text,
    });
    if (!reply) {
      throw new BusinessException(220002, '评论不存在或已解决', HttpStatus.NOT_FOUND);
    }

    await this.broadcast(docId, auth.userId, {
      action: 'reply',
      threadId,
      reply,
    });

    return reply;
  }

  async editReply(
    docId: string,
    threadId: string,
    replyId: string,
    auth: AuthUser,
    text: string,
  ): Promise<DocCommentReplyDto> {
    this.assertEnabled();
    await this.assertCanComment(docId, auth);

    const found = await this.commentRepo.findReply(docId, threadId, replyId);
    if (!found) {
      throw new BusinessException(220002, '评论不存在或已解决', HttpStatus.NOT_FOUND);
    }
    if (found.reply.authorId !== auth.userId) {
      throw new BusinessException(220004, '只能编辑自己的评论', HttpStatus.FORBIDDEN);
    }

    const reply = await this.commentRepo.updateReply(docId, threadId, replyId, text, auth.userId);
    if (!reply) {
      throw new BusinessException(220002, '评论不存在或已解决', HttpStatus.NOT_FOUND);
    }

    await this.broadcast(docId, auth.userId, {
      action: 'reply_edit',
      threadId,
      reply,
    });

    return reply;
  }

  async deleteReply(
    docId: string,
    threadId: string,
    replyId: string,
    auth: AuthUser,
  ): Promise<{ threadDeleted: boolean }> {
    this.assertEnabled();
    await this.assertCanComment(docId, auth);

    const found = await this.commentRepo.findReply(docId, threadId, replyId);
    if (!found) {
      throw new BusinessException(220002, '评论不存在或已解决', HttpStatus.NOT_FOUND);
    }
    if (found.reply.authorId !== auth.userId) {
      throw new BusinessException(220004, '只能删除自己的评论', HttpStatus.FORBIDDEN);
    }

    const threadDeleted = await this.commentRepo.deleteReply(docId, threadId, replyId);
    await this.broadcast(docId, auth.userId, threadDeleted
      ? { action: 'thread_delete', threadId }
      : { action: 'reply_delete', threadId, replyId });

    return { threadDeleted };
  }

  async toggleReplyLike(
    docId: string,
    threadId: string,
    replyId: string,
    auth: AuthUser,
  ): Promise<{ liked: boolean; likeCount: number; reply: DocCommentReplyDto }> {
    this.assertEnabled();
    await this.assertCanRead(docId, auth);

    const result = await this.commentRepo.toggleReplyLike(docId, threadId, replyId, auth.userId);
    if (!result) {
      throw new BusinessException(220002, '评论不存在或已解决', HttpStatus.NOT_FOUND);
    }

    await this.broadcast(docId, auth.userId, {
      action: 'reply_like',
      threadId,
      replyId,
      liked: result.liked,
      likeCount: result.likeCount,
      reply: result.reply,
    });

    return result;
  }

  async resolveThread(
    docId: string,
    threadId: string,
    auth: AuthUser,
  ): Promise<DocCommentThreadDto> {
    this.assertEnabled();
    await this.assertCanComment(docId, auth);

    const thread = await this.commentRepo.resolveThread(docId, threadId, auth.userId);
    if (!thread) {
      throw new BusinessException(220002, '评论不存在或已解决', HttpStatus.NOT_FOUND);
    }

    await this.broadcast(docId, auth.userId, {
      action: 'resolve',
      threadId,
      thread,
    });

    return thread;
  }

  async updateAnchor(
    docId: string,
    threadId: string,
    auth: AuthUser,
    pinX: number,
    pinY: number,
    meta?: {
      quote?: string;
      anchorType?: DocCommentAnchorDto['anchorType'];
      elementId?: string;
      mindNodeId?: string;
      pinOffsetX?: number;
      pinOffsetY?: number;
      clearBind?: boolean;
    },
  ): Promise<DocCommentThreadDto> {
    this.assertEnabled();
    await this.assertCanComment(docId, auth);

    const thread = await this.commentRepo.updateAnchorPosition(
      docId,
      threadId,
      pinX,
      pinY,
      auth.userId,
      meta,
    );
    if (!thread) {
      throw new BusinessException(220002, '评论不存在或已解决', HttpStatus.NOT_FOUND);
    }

    await this.broadcast(docId, auth.userId, {
      action: 'anchor_move',
      threadId,
      anchor: thread.anchor,
    });

    return thread;
  }

  private async resolveAuthor(auth: AuthUser): Promise<{
    authorId: string;
    authorName: string;
    authorAvatar: string | null;
  }> {
    const user = await this.userRepo.findById(auth.userId);
    return {
      authorId: auth.userId,
      authorName: user?.display_name?.trim() || auth.email.split('@')[0] || '用户',
      authorAvatar: user?.avatar_url ?? null,
    };
  }

  private async assertCanRead(docId: string, auth: AuthUser): Promise<void> {
    const ctx = documentAccessFromAuth(auth);
    const doc = await this.documentRepo.findAccessibleById(docId, ctx);
    if (!doc) {
      throw new BusinessException(200001, '文档不存在或无权访问', HttpStatus.NOT_FOUND);
    }
  }

  private async assertCanComment(docId: string, auth: AuthUser): Promise<void> {
    await this.assertCanRead(docId, auth);
    const ctx = documentAccessFromAuth(auth);
    const canWrite = await this.documentRepo.hasWriteAccess(docId, ctx);
    if (canWrite) return;

    const sharePermission = await this.shareRepo.getCollaboratorPermission(docId, ctx.userId);
    if (sharePermission === 'comment' || sharePermission === 'edit' || sharePermission === 'manage') {
      return;
    }

    throw new BusinessException(220003, '无评论权限', HttpStatus.FORBIDDEN);
  }

  private async broadcast(
    docId: string,
    senderId: string,
    payload: CommentUpdatePayload,
  ): Promise<void> {
    if (!this.collabService.isEnabled()) return;
    await this.collabService.broadcast(docId, {
      type: 'comment_update',
      senderId,
      payload,
    }, { excludeUserId: senderId });
  }
}
