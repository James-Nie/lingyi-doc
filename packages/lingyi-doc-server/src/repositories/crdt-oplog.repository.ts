import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CrdtOplogEntity } from '../database/entities/crdt-oplog.entity';
import { DocumentEntity } from '../database/entities/document.entity';

export interface CrdtOplogEntry {
  docId: string;
  globalVersion: number;
  opId: string;
  userId: string;
  opType: string;
  opTarget: string;
  opData: unknown;
  dependencies?: unknown | null;
  clientTs?: string | null;
}

@Injectable()
export class CrdtOplogRepository {
  constructor(
    @InjectRepository(CrdtOplogEntity)
    private readonly oplogRepo: Repository<CrdtOplogEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findByOpId(docId: string, opId: string): Promise<CrdtOplogEntry | null> {
    const row = await this.oplogRepo.findOne({ where: { docId, opId } });
    return row ? this.toEntry(row) : null;
  }

  async getLatestGlobalVersion(docId: string): Promise<number> {
    const result = await this.oplogRepo
      .createQueryBuilder('o')
      .select('MAX(o.globalVersion)', 'max')
      .where('o.docId = :docId', { docId })
      .getRawOne<{ max: string | null }>();
    return Number(result?.max ?? 0);
  }

  async findSince(docId: string, fromVersion: number, limit = 500): Promise<CrdtOplogEntry[]> {
    const rows = await this.oplogRepo
      .createQueryBuilder('o')
      .where('o.docId = :docId', { docId })
      .andWhere('o.globalVersion > :fromVersion', { fromVersion })
      .orderBy('o.globalVersion', 'ASC')
      .take(limit)
      .getMany();
    return rows.map((row) => this.toEntry(row));
  }

  /**
   * 在事务中分配 global_version 并写入 oplog。
   * 通过锁定 documents 行避免并发版本冲突。
   */
  async insertOperation(input: {
    docId: string;
    opId: string;
    userId: string;
    opType: string;
    opTarget: string;
    opData: unknown;
    dependencies?: unknown | null;
    clientTs?: number | null;
  }): Promise<{ globalVersion: number; duplicate: boolean }> {
    const existing = await this.findByOpId(input.docId, input.opId);
    if (existing) {
      return { globalVersion: existing.globalVersion, duplicate: true };
    }

    return this.dataSource.transaction(async (manager) => {
      const locked = await manager
        .createQueryBuilder(DocumentEntity, 'd')
        .select(['d.id'])
        .where('d.id = :docId', { docId: input.docId })
        .andWhere('d.isDeleted = false')
        .setLock('pessimistic_write')
        .getOne();

      if (!locked) {
        throw new Error('DOCUMENT_NOT_FOUND');
      }

      const dup = await manager.findOne(CrdtOplogEntity, {
        where: { docId: input.docId, opId: input.opId },
      });
      if (dup) {
        return { globalVersion: dup.globalVersion, duplicate: true };
      }

      const maxResult = await manager
        .createQueryBuilder(CrdtOplogEntity, 'o')
        .select('MAX(o.globalVersion)', 'max')
        .where('o.docId = :docId', { docId: input.docId })
        .getRawOne<{ max: string | null }>();

      const globalVersion = Number(maxResult?.max ?? 0) + 1;

      await manager.save(CrdtOplogEntity, {
        docId: input.docId,
        globalVersion,
        opId: input.opId,
        userId: input.userId,
        opType: input.opType,
        opTarget: input.opTarget,
        opData: input.opData,
        dependencies: input.dependencies ?? null,
        clientTs: input.clientTs != null ? String(input.clientTs) : null,
      });

      return { globalVersion, duplicate: false };
    });
  }

  private toEntry(row: CrdtOplogEntity): CrdtOplogEntry {
    return {
      docId: row.docId,
      globalVersion: row.globalVersion,
      opId: row.opId,
      userId: row.userId,
      opType: row.opType,
      opTarget: row.opTarget,
      opData: row.opData,
      dependencies: row.dependencies,
      clientTs: row.clientTs,
    };
  }

  /**
   * 删除指定文档中早于给定时间的操作日志。
   * 返回实际删除的行数。
   */
  async deleteBeforeTimestamp(docId: string, expireTime: Date, batchSize: number): Promise<number> {
    const result = await this.dataSource.query(
      `DELETE FROM crdt_oplog
       WHERE doc_id = $1
         AND server_ts < $2
       ORDER BY id
       LIMIT $3`,
      [docId, expireTime, batchSize],
    );
    return result.affectedRows ?? 0;
  }

  /**
   * 获取需要清理的文档列表及其过期记录数量。
   * 返回 docId 和过期记录数。
   */
  async getDocsWithExpiredLogs(expireTime: Date, limit = 100): Promise<Array<{ docId: string; count: number }>> {
    const rows = await this.dataSource.query(
      `SELECT doc_id AS "docId", COUNT(*) AS count
       FROM crdt_oplog
       WHERE server_ts < $1
       GROUP BY doc_id
       ORDER BY count DESC
       LIMIT $2`,
      [expireTime, limit],
    );
    return rows;
  }

  /**
   * 获取单个文档的总记录数。
   */
  async countByDocId(docId: string): Promise<number> {
    const result = await this.oplogRepo
      .createQueryBuilder('o')
      .select('COUNT(*)', 'count')
      .where('o.docId = :docId', { docId })
      .getRawOne<{ count: string }>();
    return Number(result?.count ?? 0);
  }

  /**
   * 批量插入操作日志，在单个事务中处理。
   * 通过锁定 documents 行避免并发版本冲突。
   * 返回每条操作的结果（globalVersion 和是否重复）。
   */
  async batchInsertOperations(inputs: Array<{
    docId: string;
    opId: string;
    userId: string;
    opType: string;
    opTarget: string;
    opData: unknown;
    dependencies?: unknown | null;
    clientTs?: number | null;
  }>): Promise<Array<{ globalVersion: number; duplicate: boolean }>> {
    if (inputs.length === 0) return [];

    const docId = inputs[0].docId;

    return this.dataSource.transaction(async (manager) => {
      const locked = await manager
        .createQueryBuilder(DocumentEntity, 'd')
        .select(['d.id'])
        .where('d.id = :docId', { docId })
        .andWhere('d.isDeleted = false')
        .setLock('pessimistic_write')
        .getOne();

      if (!locked) {
        throw new Error('DOCUMENT_NOT_FOUND');
      }

      const maxResult = await manager
        .createQueryBuilder(CrdtOplogEntity, 'o')
        .select('MAX(o.globalVersion)', 'max')
        .where('o.docId = :docId', { docId })
        .getRawOne<{ max: string | null }>();

      let currentVersion = Number(maxResult?.max ?? 0);
      const results: Array<{ globalVersion: number; duplicate: boolean }> = [];

      const existingOpIds = new Set<string>();
      const existingRows = await manager.find(CrdtOplogEntity, {
        where: inputs.map(input => ({ docId: input.docId, opId: input.opId })),
      });
      for (const row of existingRows) {
        existingOpIds.add(row.opId);
        const idx = inputs.findIndex(input => input.opId === row.opId);
        if (idx >= 0) {
          results[idx] = { globalVersion: row.globalVersion, duplicate: true };
        }
      }

      for (let i = 0; i < inputs.length; i++) {
        if (results[i]) continue;

        const input = inputs[i];
        currentVersion += 1;

        await manager.save(CrdtOplogEntity, {
          docId: input.docId,
          globalVersion: currentVersion,
          opId: input.opId,
          userId: input.userId,
          opType: input.opType,
          opTarget: input.opTarget,
          opData: input.opData,
          dependencies: input.dependencies ?? null,
          clientTs: input.clientTs != null ? String(input.clientTs) : null,
        });

        results[i] = { globalVersion: currentVersion, duplicate: false };
      }

      return results;
    });
  }
}
