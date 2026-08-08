import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CrdtOperation } from './collab.types';
import { CrdtOplogRepository } from '../../repositories/crdt-oplog.repository';
import { RedisService } from '../../redis/redis.service';
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
import {
  DOCUMENT_ACCESS_PORT,
  type DocumentAccessPort,
} from '../../ports';
import crypto from 'crypto';

@Injectable()
export class CollabService implements OnModuleInit {
  private readonly logger = new Logger(CollabService.name);
  readonly instanceId = `inst_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
  private readonly enabled: boolean;
  private readonly presenceTtlSec: number;
  private subscribed = false;
  /** 进程内区域锁（Redis 不可用时仍可互斥；有 Redis 时与之同步） */
  private readonly memoryCellLocks = new Map<string, Map<string, ActiveCellEditor>>();

  constructor(
    private readonly config: ConfigService,
    private readonly oplogRepo: CrdtOplogRepository,
    @Inject(DOCUMENT_ACCESS_PORT)
    private readonly documentAccess: DocumentAccessPort,
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
    const access = await this.documentAccess.checkAccess(docId, auth);
    if (!access.canRead) {
      return { canRead: false, canWrite: false, docVersion: 0, globalVersion: 0 };
    }
    const globalVersion = await this.oplogRepo.getLatestGlobalVersion(docId);
    return {
      canRead: true,
      canWrite: access.canWrite,
      docVersion: access.docVersion,
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

  /**
   * 批量处理多个 CRDT 操作，使用单个事务写入数据库。
   * 返回每条操作的结果。
   */
  async handleOperations(
    docId: string,
    userId: string,
    ops: CrdtOperation[],
  ): Promise<Array<{ globalVersion: number; duplicate: boolean }>> {
    const validOps = ops.filter(op => op?.opId && op?.type && op?.target);
    if (validOps.length === 0) return [];

    const inputs = validOps.map(op => ({
      docId,
      opId: op.opId,
      userId,
      opType: op.type,
      opTarget: op.target,
      opData: crdtOperationToOpData(op),
      dependencies: op.dependencies,
      clientTs: op.clock,
    }));

    return this.oplogRepo.batchInsertOperations(inputs);
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

  private cellLocksKey(docId: string): string {
    return `collab:cell_locks:${docId}`;
  }

  /** 旧版整文档单锁，读取时迁移到多区域锁 */
  private legacyCellLockKey(docId: string): string {
    return `collab:cell_lock:${docId}`;
  }

  private regionKey(editor: Pick<ActiveCellEditor, 'sheetId' | 'row' | 'col'>): string {
    return `${editor.sheetId}:${editor.row}:${editor.col}`;
  }

  private getMemoryLocks(docId: string): Map<string, ActiveCellEditor> {
    let locks = this.memoryCellLocks.get(docId);
    if (!locks) {
      locks = new Map();
      this.memoryCellLocks.set(docId, locks);
    }
    return locks;
  }

  private listMemoryEditors(docId: string): ActiveCellEditor[] {
    return [...this.getMemoryLocks(docId).values()];
  }

  private syncMemoryFromEditors(docId: string, editors: ActiveCellEditor[]): void {
    const locks = this.getMemoryLocks(docId);
    locks.clear();
    for (const editor of editors) {
      locks.set(this.regionKey(editor), editor);
    }
    if (locks.size === 0) {
      this.memoryCellLocks.delete(docId);
    }
  }

  async getActiveCellEditors(docId: string): Promise<ActiveCellEditor[]> {
    if (!this.redis.isReady()) {
      return this.listMemoryEditors(docId);
    }

    const legacyRaw = await this.redis.get(this.legacyCellLockKey(docId));
    if (legacyRaw) {
      try {
        const legacy = JSON.parse(legacyRaw) as ActiveCellEditor;
        await this.redis.hset(this.cellLocksKey(docId), this.regionKey(legacy), legacyRaw);
        await this.redis.expire(this.cellLocksKey(docId), this.presenceTtlSec);
        await this.redis.del(this.legacyCellLockKey(docId));
      } catch {
        await this.redis.del(this.legacyCellLockKey(docId));
      }
    }

    const all = await this.redis.hgetall(this.cellLocksKey(docId));
    const editors: ActiveCellEditor[] = [];
    for (const raw of Object.values(all)) {
      try {
        editors.push(JSON.parse(raw) as ActiveCellEditor);
      } catch {
        // skip bad field
      }
    }
    this.syncMemoryFromEditors(docId, editors);
    return editors;
  }

  /** @deprecated 兼容旧接口，返回第一个区域锁 */
  async getActiveCellEditor(docId: string): Promise<ActiveCellEditor | null> {
    const editors = await this.getActiveCellEditors(docId);
    return editors[0] ?? null;
  }

  /**
   * 按区域加锁：不同区域可并行编辑；同一区域仅允许一人。
   * 同一用户切换区域时会释放其先前持有的锁。
   * Redis 不可用时仍以进程内 Map 互斥（单实例可正常工作）。
   */
  async tryAcquireCellEditor(
    docId: string,
    editor: ActiveCellEditor,
  ): Promise<{ ok: true; editors: ActiveCellEditor[] } | { ok: false; holder: ActiveCellEditor }> {
    const editors = await this.getActiveCellEditors(docId);
    const key = this.regionKey(editor);
    const holder = editors.find(
      e => this.regionKey(e) === key && e.userId !== editor.userId,
    );
    if (holder) {
      return { ok: false, holder };
    }

    const locks = this.getMemoryLocks(docId);
    for (const existing of editors) {
      if (existing.userId === editor.userId && this.regionKey(existing) !== key) {
        locks.delete(this.regionKey(existing));
        if (this.redis.isReady()) {
          await this.redis.hdel(this.cellLocksKey(docId), this.regionKey(existing));
        }
      }
    }
    locks.set(key, editor);

    if (this.redis.isReady()) {
      await this.redis.hset(this.cellLocksKey(docId), key, JSON.stringify(editor));
      await this.redis.expire(this.cellLocksKey(docId), this.presenceTtlSec);
      return { ok: true, editors: await this.getActiveCellEditors(docId) };
    }

    return { ok: true, editors: this.listMemoryEditors(docId) };
  }

  /** 释放某用户全部区域锁，返回剩余锁列表 */
  async releaseCellEditor(docId: string, userId: string): Promise<ActiveCellEditor[]> {
    const editors = await this.getActiveCellEditors(docId);
    const locks = this.getMemoryLocks(docId);
    let removed = false;

    for (const existing of editors) {
      if (existing.userId !== userId) continue;
      locks.delete(this.regionKey(existing));
      if (this.redis.isReady()) {
        await this.redis.hdel(this.cellLocksKey(docId), this.regionKey(existing));
      }
      removed = true;
    }

    if (!removed) {
      return editors;
    }

    if (this.redis.isReady()) {
      const remaining = await this.getActiveCellEditors(docId);
      if (remaining.length > 0) {
        await this.redis.expire(this.cellLocksKey(docId), this.presenceTtlSec);
      } else {
        await this.redis.del(this.cellLocksKey(docId));
      }
      return remaining;
    }

    const remaining = this.listMemoryEditors(docId);
    if (remaining.length === 0) {
      this.memoryCellLocks.delete(docId);
    }
    return remaining;
  }
}
