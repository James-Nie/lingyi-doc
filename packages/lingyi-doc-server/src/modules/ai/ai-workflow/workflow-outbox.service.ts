import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { WfTriggerOutboxEntity } from '../../../database/entities/wf-trigger-outbox.entity';
import { WorkflowTriggerDispatcher, type RecordHistoryDispatchEntry } from './workflow-trigger.dispatcher';

const MAX_ATTEMPTS = 5;
const BASE_RETRY_MS = 10_000;
const POLL_BATCH = 10;
const POLL_INTERVAL_MS = 5_000;

function backoffDelay(attempt: number): number {
  return Math.min(BASE_RETRY_MS * Math.pow(2, attempt - 1), 5 * 60 * 1000);
}

@Injectable()
export class WorkflowOutboxService {
  private readonly logger = new Logger(WorkflowOutboxService.name);
  private processing = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(WfTriggerOutboxEntity)
    private readonly outboxRepo: Repository<WfTriggerOutboxEntity>,
    private readonly dispatcher: WorkflowTriggerDispatcher,
  ) {}

  onModuleInit(): void {
    setInterval(() => {
      if (this.processing) return;
      void this.processBatch();
    }, POLL_INTERVAL_MS);
  }

  /**
   * 在事务内插入 outbox（与文档内容、行级历史同事务保证一致性）。
   * @param manager 当前事务的 EntityManager
   */
  async enqueueInTransaction(
    manager: EntityManager,
    docId: string,
    entries: RecordHistoryDispatchEntry[],
    userId: string,
    tenantId?: string | null,
  ): Promise<void> {
    if (!entries || entries.length === 0) return;
    await manager
      .createQueryBuilder()
      .insert()
      .into(WfTriggerOutboxEntity)
      .values({
        docId,
        status: 'pending',
        entries: entries as any,
        userId: userId || null,
        tenantId: tenantId || null,
      })
      .execute();
  }

  /** 轮询消费：逐条取出 pending 条目，调 dispatcher 处理，按结果标记 done/failed */
  async processBatch(): Promise<{ processed: number; failed: number }> {
    this.processing = true;
    let processed = 0;
    let failed = 0;

    try {
      const items = await this.outboxRepo
        .createQueryBuilder('o')
        .where('o.status = :status', { status: 'pending' })
        .andWhere(
          '(o.nextRetryAt IS NULL OR o.nextRetryAt <= :now)',
          { now: new Date() },
        )
        .orderBy('o.createdAt', 'ASC')
        .take(POLL_BATCH)
        .getMany();

      for (const item of items) {
        try {
          await this.dispatcher.dispatchRecordChanges(
            item.docId,
            item.entries as unknown as RecordHistoryDispatchEntry[],
            { userId: item.userId ?? '', tenantId: item.tenantId },
          );

          await this.outboxRepo.update(item.id, {
            status: 'done',
            processedAt: new Date(),
            attempts: () => 'attempts + 1' as any,
          });

          processed += 1;
        } catch (err) {
          const nextAttempts = item.attempts + 1;
          if (nextAttempts >= MAX_ATTEMPTS) {
            await this.outboxRepo.update(item.id, {
              status: 'failed',
              attempts: nextAttempts,
              processedAt: new Date(),
            });
          } else {
            await this.outboxRepo.update(item.id, {
              status: 'pending',
              attempts: nextAttempts,
              nextRetryAt: new Date(Date.now() + backoffDelay(nextAttempts)),
            });
          }
          failed += 1;
          this.logger.error(
            `outbox process failed id=${item.id} attempt=${nextAttempts}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`outbox processBatch error: ${(err as Error).message}`);
    } finally {
      this.processing = false;
    }

    return { processed, failed };
  }
}
