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
        .andWhere('d.isDeleted = 0')
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
}
