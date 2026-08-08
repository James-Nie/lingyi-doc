import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CrdtOplogRepository } from '../../repositories/crdt-oplog.repository';

@Injectable()
export class CrdtOplogCleanupService {
  private readonly logger = new Logger(CrdtOplogCleanupService.name);
  private readonly retentionDays: number;
  private readonly batchSize: number;
  private readonly cronExpression: string;

  constructor(
    private readonly config: ConfigService,
    private readonly oplogRepo: CrdtOplogRepository,
  ) {
    this.retentionDays = this.config.get<number>('CRDT_OPLOG_RETENTION_DAYS', 30);
    this.batchSize = this.config.get<number>('CRDT_OPLOG_CLEANUP_BATCH_SIZE', 10000);
    this.cronExpression = this.config.get<string>(
      'CRDT_OPLOG_CLEANUP_CRON',
      CronExpression.EVERY_DAY_AT_3AM,
    );
    this.logger.log(
      `CrdtOplogCleanupService initialized: retention=${this.retentionDays}d, batch=${this.batchSize}, cron=${this.cronExpression}`,
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanup(): Promise<void> {
    const startTime = Date.now();
    const expireTime = new Date();
    expireTime.setDate(expireTime.getDate() - this.retentionDays);

    this.logger.log(`Starting crdt_oplog cleanup for records older than ${expireTime.toISOString()}`);

    try {
      const docsToCleanup = await this.oplogRepo.getDocsWithExpiredLogs(expireTime);

      if (docsToCleanup.length === 0) {
        this.logger.log('No expired logs found, cleanup skipped');
        return;
      }

      this.logger.log(`Found ${docsToCleanup.length} documents with expired logs`);

      let totalDeleted = 0;

      for (const doc of docsToCleanup) {
        let deletedFromDoc = 0;

        while (true) {
          const deleted = await this.oplogRepo.deleteBeforeTimestamp(
            doc.docId,
            expireTime,
            this.batchSize,
          );

          if (deleted === 0) break;

          deletedFromDoc += deleted;
          totalDeleted += deleted;

          if (deleted === this.batchSize) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          } else {
            break;
          }
        }

        if (deletedFromDoc > 0) {
          this.logger.debug(`Cleaned ${deletedFromDoc} records from doc ${doc.docId}`);
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Cleanup completed: ${totalDeleted} records deleted from ${docsToCleanup.length} documents in ${duration}ms`,
      );
    } catch (error) {
      this.logger.error('Cleanup failed', error);
    }
  }

  async triggerCleanupNow(): Promise<{ success: boolean; message: string }> {
    try {
      await this.handleCleanup();
      return { success: true, message: 'Cleanup triggered successfully' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `Cleanup failed: ${message}` };
    }
  }
}
