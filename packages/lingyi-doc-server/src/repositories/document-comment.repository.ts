import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  DocCommentReplyEntity,
  DocCommentReplyLikeEntity,
  DocCommentThreadEntity,
} from '../database/entities/document-comment.entity';
import type {
  DocCommentAnchorDto,
  DocCommentReplyDto,
  DocCommentThreadDto,
} from '../types/document-comment';

function toTs(value: Date | string | null | undefined): number {
  if (!value) return Date.now();
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? Date.now() : d.getTime();
}

interface ReplyLikeMeta {
  likeCount: number;
  likedByMe: boolean;
}

interface AnchorMeta {
  anchorType?: 'text' | 'sheet_cell' | 'sheet_record' | 'freeform_cell' | 'whiteboard_element' | 'whiteboard_mind_node';
  sheetId?: string;
  recordId?: string;
  fieldId?: string;
  viewId?: string;
  elementId?: string;
  mindNodeId?: string;
}

function serializeAnchorMeta(anchor: {
  anchorType?: string;
  sheetId?: string;
  recordId?: string;
  fieldId?: string;
  viewId?: string;
  elementId?: string;
  mindNodeId?: string;
}): string | null {
  if (!anchor.anchorType || anchor.anchorType === 'text') return null;
  return JSON.stringify({
    anchorType: anchor.anchorType,
    sheetId: anchor.sheetId,
    recordId: anchor.recordId,
    fieldId: anchor.fieldId,
    viewId: anchor.viewId,
    elementId: anchor.elementId,
    mindNodeId: anchor.mindNodeId,
  });
}

function deserializeAnchorMeta(raw: string | null | undefined): AnchorMeta {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as AnchorMeta;
  } catch {
    return {};
  }
}

function buildAnchorDto(
  entity: DocCommentThreadEntity,
): DocCommentAnchorDto {
  const meta = deserializeAnchorMeta(entity.anchorMeta);
  return {
    blockId: entity.blockId,
    start: entity.anchorStart,
    end: entity.anchorEnd,
    quote: entity.quote,
    ...meta,
  };
}

@Injectable()
export class DocumentCommentRepository {
  constructor(
    @InjectRepository(DocCommentThreadEntity)
    private readonly threadRepo: Repository<DocCommentThreadEntity>,
    @InjectRepository(DocCommentReplyEntity)
    private readonly replyRepo: Repository<DocCommentReplyEntity>,
    @InjectRepository(DocCommentReplyLikeEntity)
    private readonly likeRepo: Repository<DocCommentReplyLikeEntity>,
  ) {}

  private replyEntityToDto(
    entity: DocCommentReplyEntity,
    likeMeta?: ReplyLikeMeta,
  ): DocCommentReplyDto {
    return {
      id: entity.id,
      authorId: entity.authorId,
      authorName: entity.authorName,
      authorAvatar: entity.authorAvatar,
      text: entity.text,
      createdAt: toTs(entity.createdAt),
      updatedAt: entity.updatedAt ? toTs(entity.updatedAt) : undefined,
      likeCount: likeMeta?.likeCount ?? 0,
      likedByMe: likeMeta?.likedByMe ?? false,
    };
  }

  private async loadReplyLikeMeta(
    replyIds: string[],
    currentUserId?: string,
  ): Promise<Map<string, ReplyLikeMeta>> {
    const meta = new Map<string, ReplyLikeMeta>();
    if (!replyIds.length) return meta;

    const counts = await this.likeRepo.createQueryBuilder('l')
      .select('l.reply_id', 'replyId')
      .addSelect('COUNT(*)', 'cnt')
      .where('l.reply_id IN (:...replyIds)', { replyIds })
      .groupBy('l.reply_id')
      .getRawMany<{ replyId: string; cnt: string }>();

    for (const row of counts) {
      meta.set(row.replyId, { likeCount: Number(row.cnt ?? 0), likedByMe: false });
    }

    if (currentUserId) {
      const mine = await this.likeRepo.find({
        where: { replyId: In(replyIds), userId: currentUserId },
      });
      for (const like of mine) {
        const existing = meta.get(like.replyId) ?? { likeCount: 0, likedByMe: false };
        meta.set(like.replyId, { ...existing, likedByMe: true });
      }
    }

    for (const id of replyIds) {
      if (!meta.has(id)) meta.set(id, { likeCount: 0, likedByMe: false });
    }
    return meta;
  }

  private threadEntityToDto(
    entity: DocCommentThreadEntity,
    replies: DocCommentReplyEntity[],
    likeMeta: Map<string, ReplyLikeMeta>,
  ): DocCommentThreadDto {
    return {
      id: entity.id,
      anchor: buildAnchorDto(entity),
      replies: replies
        .map(reply => this.replyEntityToDto(reply, likeMeta.get(reply.id)))
        .sort((a, b) => a.createdAt - b.createdAt),
      resolved: entity.resolved === 1,
      createdAt: toTs(entity.createdAt),
    };
  }

  async listByDoc(docId: string, currentUserId?: string, includeResolved = false): Promise<DocCommentThreadDto[]> {
    const qb = this.threadRepo.createQueryBuilder('t')
      .where('t.doc_id = :docId', { docId })
      .orderBy('t.created_at', 'ASC');
    if (!includeResolved) {
      qb.andWhere('t.resolved = 0');
    }
    const threads = await qb.getMany();
    if (!threads.length) return [];

    const threadIds = threads.map(t => t.id);
    const replies = await this.replyRepo.createQueryBuilder('r')
      .where('r.thread_id IN (:...threadIds)', { threadIds })
      .orderBy('r.created_at', 'ASC')
      .getMany();

    const likeMeta = await this.loadReplyLikeMeta(replies.map(r => r.id), currentUserId);

    const byThread = new Map<string, DocCommentReplyEntity[]>();
    for (const reply of replies) {
      const list = byThread.get(reply.threadId) ?? [];
      list.push(reply);
      byThread.set(reply.threadId, list);
    }

    return threads.map(t => this.threadEntityToDto(t, byThread.get(t.id) ?? [], likeMeta));
  }

  async countByDoc(docId: string): Promise<number> {
    const raw = await this.threadRepo.createQueryBuilder('t')
      .select('COUNT(*)', 'cnt')
      .where('t.doc_id = :docId', { docId })
      .andWhere('t.resolved = 0')
      .getRawOne<{ cnt: string }>();
    return Number(raw?.cnt ?? 0);
  }

  async findThread(
    docId: string,
    threadId: string,
    currentUserId?: string,
  ): Promise<DocCommentThreadDto | null> {
    const thread = await this.threadRepo.findOne({ where: { id: threadId, docId } });
    if (!thread) return null;
    const replies = await this.replyRepo.find({
      where: { threadId },
      order: { createdAt: 'ASC' },
    });
    const likeMeta = await this.loadReplyLikeMeta(replies.map(r => r.id), currentUserId);
    return this.threadEntityToDto(thread, replies, likeMeta);
  }

  async findReply(docId: string, threadId: string, replyId: string): Promise<{
    thread: DocCommentThreadEntity;
    reply: DocCommentReplyEntity;
  } | null> {
    const thread = await this.threadRepo.findOne({ where: { id: threadId, docId, resolved: 0 } });
    if (!thread) return null;
    const reply = await this.replyRepo.findOne({ where: { id: replyId, threadId } });
    if (!reply) return null;
    return { thread, reply };
  }

  async createThread(input: {
    id: string;
    docId: string;
    anchor: DocCommentAnchorDto;
    createdBy: string;
    firstReply?: {
      authorId: string;
      authorName: string;
      authorAvatar?: string | null;
      text: string;
    };
  }): Promise<DocCommentThreadDto> {
    const thread = this.threadRepo.create({
      id: input.id,
      docId: input.docId,
      blockId: input.anchor.blockId,
      anchorStart: input.anchor.start,
      anchorEnd: input.anchor.end,
      quote: input.anchor.quote.slice(0, 500),
      anchorMeta: serializeAnchorMeta(input.anchor),
      resolved: 0,
      createdBy: input.createdBy,
    });
    await this.threadRepo.save(thread);

    const replies: DocCommentReplyEntity[] = [];
    if (input.firstReply?.text.trim()) {
      const reply = this.replyRepo.create({
        id: `cmt_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        threadId: thread.id,
        authorId: input.firstReply.authorId,
        authorName: input.firstReply.authorName,
        authorAvatar: input.firstReply.authorAvatar ?? null,
        text: input.firstReply.text.trim(),
      });
      await this.replyRepo.save(reply);
      replies.push(reply);
    }

    const likeMeta = await this.loadReplyLikeMeta(replies.map(r => r.id), input.firstReply?.authorId);
    return this.threadEntityToDto(thread, replies, likeMeta);
  }

  async addReply(input: {
    threadId: string;
    authorId: string;
    authorName: string;
    authorAvatar?: string | null;
    text: string;
  }): Promise<DocCommentReplyDto | null> {
    const thread = await this.threadRepo.findOne({ where: { id: input.threadId, resolved: 0 } });
    if (!thread) return null;

    const reply = this.replyRepo.create({
      id: `cmt_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
      threadId: input.threadId,
      authorId: input.authorId,
      authorName: input.authorName,
      authorAvatar: input.authorAvatar ?? null,
      text: input.text.trim(),
    });
    await this.replyRepo.save(reply);
    await this.threadRepo.update({ id: input.threadId }, { updatedAt: new Date() });
    return this.replyEntityToDto(reply, { likeCount: 0, likedByMe: false });
  }

  async updateReply(
    docId: string,
    threadId: string,
    replyId: string,
    text: string,
    currentUserId?: string,
  ): Promise<DocCommentReplyDto | null> {
    const found = await this.findReply(docId, threadId, replyId);
    if (!found) return null;
    found.reply.text = text.trim();
    found.reply.updatedAt = new Date();
    await this.replyRepo.save(found.reply);
    await this.threadRepo.update({ id: threadId }, { updatedAt: new Date() });
    const likeMeta = await this.loadReplyLikeMeta([replyId], currentUserId);
    return this.replyEntityToDto(found.reply, likeMeta.get(replyId));
  }

  async deleteReply(docId: string, threadId: string, replyId: string): Promise<boolean> {
    const found = await this.findReply(docId, threadId, replyId);
    if (!found) return false;
    await this.replyRepo.delete({ id: replyId });
    const remaining = await this.replyRepo.count({ where: { threadId } });
    if (remaining === 0) {
      await this.threadRepo.delete({ id: threadId, docId });
      return true;
    }
    await this.threadRepo.update({ id: threadId }, { updatedAt: new Date() });
    return false;
  }

  async toggleReplyLike(
    docId: string,
    threadId: string,
    replyId: string,
    userId: string,
  ): Promise<{ liked: boolean; likeCount: number; reply: DocCommentReplyDto } | null> {
    const found = await this.findReply(docId, threadId, replyId);
    if (!found) return null;

    const existing = await this.likeRepo.findOne({ where: { replyId, userId } });
    if (existing) {
      await this.likeRepo.delete({ replyId, userId });
    } else {
      await this.likeRepo.save(this.likeRepo.create({ replyId, userId }));
    }

    const likeMeta = await this.loadReplyLikeMeta([replyId], userId);
    const meta = likeMeta.get(replyId) ?? { likeCount: 0, likedByMe: false };
    return {
      liked: meta.likedByMe,
      likeCount: meta.likeCount,
      reply: this.replyEntityToDto(found.reply, meta),
    };
  }

  async resolveThread(docId: string, threadId: string, currentUserId?: string): Promise<DocCommentThreadDto | null> {
    const thread = await this.threadRepo.findOne({ where: { id: threadId, docId } });
    if (!thread || thread.resolved === 1) return null;
    thread.resolved = 1;
    await this.threadRepo.save(thread);
    const replies = await this.replyRepo.find({
      where: { threadId },
      order: { createdAt: 'ASC' },
    });
    const likeMeta = await this.loadReplyLikeMeta(replies.map(r => r.id), currentUserId);
    return this.threadEntityToDto(thread, replies, likeMeta);
  }

  async updateAnchorPosition(
    docId: string,
    threadId: string,
    pinX: number,
    pinY: number,
    currentUserId?: string,
  ): Promise<DocCommentThreadDto | null> {
    const thread = await this.threadRepo.findOne({ where: { id: threadId, docId, resolved: 0 } });
    if (!thread) return null;
    thread.anchorStart = Math.round(pinX);
    thread.anchorEnd = Math.round(pinY);
    thread.updatedAt = new Date();
    await this.threadRepo.save(thread);
    const replies = await this.replyRepo.find({
      where: { threadId },
      order: { createdAt: 'ASC' },
    });
    const likeMeta = await this.loadReplyLikeMeta(replies.map(r => r.id), currentUserId);
    return this.threadEntityToDto(thread, replies, likeMeta);
  }
}
