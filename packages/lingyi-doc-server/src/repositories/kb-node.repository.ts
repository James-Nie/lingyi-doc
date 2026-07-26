import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentEntity } from '../database/entities/document.entity';
import { KbNodeEntity } from '../database/entities/knowledge-base.entity';
import type { KbNodeDto, KbNodeType } from '../types/knowledge-base';

function toIso(value: Date | string | null | undefined): string {
  if (value == null) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function toDto(row: KbNodeEntity, docType?: string | null): KbNodeDto {
  return {
    id: row.id,
    kbId: row.kbId,
    parentId: row.parentId,
    title: row.title,
    nodeType: row.nodeType as KbNodeType,
    docId: row.docId,
    docType: docType ?? null,
    sortOrder: row.sortOrder,
    isHome: row.isHome === 1,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

@Injectable()
export class KbNodeRepository {
  constructor(
    @InjectRepository(KbNodeEntity)
    private readonly nodeRepo: Repository<KbNodeEntity>,
    @InjectRepository(DocumentEntity)
    private readonly docRepo: Repository<DocumentEntity>,
  ) {}

  async listByKbId(kbId: string): Promise<KbNodeDto[]> {
    const rows = await this.nodeRepo.find({
      where: { kbId, isDeleted: 0 },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    const docIds = rows.map(row => row.docId).filter((id): id is string => Boolean(id));
    const docTypeMap = new Map<string, string>();
    if (docIds.length > 0) {
      const docs = await this.docRepo
        .createQueryBuilder('d')
        .select(['d.id', 'd.docType'])
        .where('d.id IN (:...docIds)', { docIds })
        .andWhere('d.isDeleted = 0')
        .getMany();
      docs.forEach(doc => docTypeMap.set(doc.id, doc.docType));
    }

    return rows.map(row => toDto(row, row.docId ? docTypeMap.get(row.docId) ?? null : null));
  }

  async findById(kbId: string, nodeId: string): Promise<KbNodeEntity | null> {
    return this.nodeRepo.findOne({ where: { id: nodeId, kbId, isDeleted: 0 } });
  }

  async save(entity: Partial<KbNodeEntity> & { id: string; kbId: string; title: string; nodeType: string; createdBy: string }): Promise<KbNodeEntity> {
    return this.nodeRepo.save(entity);
  }

  async updateNode(
    kbId: string,
    nodeId: string,
    patch: Partial<Pick<KbNodeEntity, 'title' | 'parentId' | 'sortOrder'>>,
  ): Promise<boolean> {
    const result = await this.nodeRepo.update(
      { id: nodeId, kbId, isDeleted: 0 },
      patch,
    );
    return (result.affected ?? 0) > 0;
  }

  async softDelete(kbId: string, nodeId: string): Promise<boolean> {
    const result = await this.nodeRepo.update(
      { id: nodeId, kbId, isDeleted: 0 },
      { isDeleted: 1, deletedAt: () => 'CURRENT_TIMESTAMP' },
    );
    return (result.affected ?? 0) > 0;
  }

  async listDocIdsByKbId(kbId: string): Promise<string[]> {
    const rows = await this.nodeRepo
      .createQueryBuilder('n')
      .select('DISTINCT n.docId', 'docId')
      .where('n.kbId = :kbId', { kbId })
      .andWhere('n.isDeleted = 0')
      .andWhere('n.docId IS NOT NULL')
      .getRawMany<{ docId: string }>();
    return rows.map(row => row.docId).filter(Boolean);
  }

  async softDeleteByKbId(kbId: string): Promise<void> {
    await this.nodeRepo.update(
      { kbId, isDeleted: 0 },
      { isDeleted: 1, deletedAt: () => 'CURRENT_TIMESTAMP' },
    );
  }

  async getNextSortOrder(kbId: string, parentId: string | null): Promise<number> {
    const qb = this.nodeRepo
      .createQueryBuilder('n')
      .select('MAX(n.sortOrder)', 'maxSort')
      .where('n.kbId = :kbId', { kbId })
      .andWhere('n.isDeleted = 0');
    if (parentId) qb.andWhere('n.parentId = :parentId', { parentId });
    else qb.andWhere('n.parentId IS NULL');

    const row = await qb.getRawOne<{ maxSort: string | null }>();
    return Number(row?.maxSort ?? -1) + 1;
  }
}
