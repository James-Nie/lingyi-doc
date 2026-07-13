import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CrdtOperation } from './collab.types';
import { CrdtOplogRepository } from '../../repositories/crdt-oplog.repository';
import { DocumentRepository } from '../../repositories/document.repository';
import { RedisService } from '../../redis/redis.service';
import { documentAccessFromAuth } from '../../utils/documentAccessContext';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import { RoomManager } from './room.manager';
import {
  COLLAB_ERROR,
  crdtOperationToOpData,
  entryToCrdtOperation,
  pickUserColor,
  type ActiveCellEditor,
  type CollabPubSubEnvelope,
  type OnlineUser,
  type ServerMessage,
} from './collab.types';
import { UserRepository } from '../../repositories/user.repository';
import crypto from 'crypto';

@Injectable()
export class CollabService implements OnModuleInit {
  private readonly logger = new Logger(CollabService.name);
  readonly instanceId = `inst_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
  private readonly enabled: boolean;
  private readonly presenceTtlSec: number;
  private subscribed = false;

  constructor(
    private readonly config: ConfigService,
    private readonly oplogRepo: CrdtOplogRepository,
    private readonly documentRepo: DocumentRepository,
    private readonly userRepo: UserRepository,
    private readonly redis: RedisService,
    private readonly roomManager: RoomManager,
  ) {
    this.enabled = config.get<boolean>('collab.enabled', false);
    this.presenceTtlSec = config.get<number>('collab.presenceTtlSec', 90);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getStats() {
    return this.roomManager.getStats();
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled || !this.redis.isReady() || this.subscribed) return;
    this.subscribed = true;
    await this.redis.subscribe('collab:broadcast', (raw) => {
      try {
        const envelope = JSON.parse(raw) as CollabPubSubEnvelope;
        if (envelope.originInstanceId === this.instanceId) return;
        this.roomManager.broadcast(envelope.docId, envelope.payload, {
          excludeSocketId: envelope.excludeSocketId,
          excludeUserId: envelope.excludeUserId,
        });
      } catch (err) {
        this.logger.warn('invalid pubsub message', err);
      }
    });
  }

  async resolveUser(auth: AuthUser): Promise<{ displayName: string; avatarUrl: string | null }> {
    const user = await this.userRepo.findById(auth.userId);
    return {
      displayName: user?.display_name?.trim() || auth.email.split('@')[0] || '用户',
      avatarUrl: user?.avatar_url ?? null,
    };
  }

  async checkDocAccess(docId: string, auth: AuthUser): Promise<{
    canRead: boolean;
    canWrite: boolean;
    docVersion: number;
    globalVersion: number;
  }> {
    const ctx = documentAccessFromAuth(auth);
    const doc = await this.documentRepo.findAccessibleById(docId, ctx);
    if (!doc) {
      return { canRead: false, canWrite: false, docVersion: 0, globalVersion: 0 };
    }
    const canWrite = await this.documentRepo.hasWriteAccess(docId, ctx);
    const globalVersion = await this.oplogRepo.getLatestGlobalVersion(docId);
    return {
      canRead: true,
      canWrite,
      docVersion: doc.version,
      globalVersion,
    };
  }

  async touchPresence(docId: string, user: OnlineUser): Promise<void> {
    if (!this.redis.isReady()) return;
    const key = `collab:presence:${docId}`;
    await this.redis.hset(key, user.userId, JSON.stringify(user));
    await this.redis.expire(key, this.presenceTtlSec);
  }

  async removePresence(docId: string, userId: string): Promise<void> {
    if (!this.redis.isReady()) return;
    await this.redis.hdel(`collab:presence:${docId}`, userId);
    await this.redis.del(`collab:cursor:${docId}:${userId}`);
  }

  async handleOperation(
    docId: string,
    userId: string,
    op: CrdtOperation,
  ): Promise<{ globalVersion: number; duplicate: boolean }> {
    if (!op?.opId || !op?.type || !op?.target) {
      throw Object.assign(new Error('OP_INVALID'), { code: COLLAB_ERROR.OP_INVALID });
    }

    const result = await this.oplogRepo.insertOperation({
      docId,
      opId: op.opId,
      userId,
      opType: op.type,
      opTarget: op.target,
      opData: crdtOperationToOpData(op),
      dependencies: op.dependencies,
      clientTs: op.clock,
    });

    return result;
  }

  async getOperationsSince(docId: string, fromVersion: number): Promise<{
    operations: CrdtOperation[];
    currentVersion: number;
  }> {
    const entries = await this.oplogRepo.findSince(docId, fromVersion);
    const currentVersion = entries.length > 0
      ? entries[entries.length - 1].globalVersion
      : await this.oplogRepo.getLatestGlobalVersion(docId);
    return {
      operations: entries.map(entryToCrdtOperation),
      currentVersion,
    };
  }

  async broadcast(
    docId: string,
    message: ServerMessage,
    options?: { excludeSocketId?: string; excludeUserId?: string },
  ): Promise<void> {
    this.roomManager.broadcast(docId, message, options);

    if (!this.redis.isReady()) return;
    const envelope: CollabPubSubEnvelope = {
      originInstanceId: this.instanceId,
      docId,
      payload: message,
      excludeSocketId: options?.excludeSocketId,
      excludeUserId: options?.excludeUserId,
    };
    await this.redis.publish('collab:broadcast', JSON.stringify(envelope));
  }

  makeOnlineUser(
    userId: string,
    displayName: string,
    avatarUrl: string | null,
  ): OnlineUser {
    return {
      userId,
      displayName,
      avatarUrl,
      color: pickUserColor(userId),
      joinedAt: Date.now(),
    };
  }

  private cellLockKey(docId: string): string {
    return `collab:cell_lock:${docId}`;
  }

  async getActiveCellEditor(docId: string): Promise<ActiveCellEditor | null> {
    if (!this.redis.isReady()) return null;
    const raw = await this.redis.get(this.cellLockKey(docId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ActiveCellEditor;
    } catch {
      return null;
    }
  }

  async tryAcquireCellEditor(
    docId: string,
    editor: ActiveCellEditor,
  ): Promise<{ ok: true } | { ok: false; holder: ActiveCellEditor }> {
    const current = await this.getActiveCellEditor(docId);
    if (current && current.userId !== editor.userId) {
      return { ok: false, holder: current };
    }
    if (this.redis.isReady()) {
      await this.redis.setex(this.cellLockKey(docId), this.presenceTtlSec, JSON.stringify(editor));
    }
    return { ok: true };
  }

  async releaseCellEditor(docId: string, userId: string): Promise<ActiveCellEditor | null> {
    const current = await this.getActiveCellEditor(docId);
    if (!current || current.userId !== userId) return current;
    if (this.redis.isReady()) {
      await this.redis.del(this.cellLockKey(docId));
    }
    return null;
  }
}
