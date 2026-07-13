import { Injectable } from '@nestjs/common';
import { generateDocSlug } from '../utils/docSlug';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DocumentEntity } from '../database/entities/document.entity';
import { DocumentSnapshotEntity } from '../database/entities/document-snapshot.entity';
import { UserEntity } from '../database/entities/user.entity';
import { TenantEntity } from '../database/entities/tenant.entity';
import { applyDocumentPatch, docTypeToPatchKind, type DocumentPatchOp } from '../patch/applyDocumentPatch';
import type {
  DocumentListItem,
  DocumentRecord,
  DocumentScope,
  RecycleBinItem,
} from '../types/database';
import type { DocumentAccessContext } from '../types/session';
import { documentLocation } from '../types/session';
import {
  applyDocumentAccessToSelectQueryBuilder,
  applyDocumentAccessToUpdateQueryBuilder,
  applyDocumentReadAccessWithShare,
  buildCollaboratorWriteExistsSql,
  buildDocumentAccessClause,
  resolveDocumentScope,
} from '../utils/documentAccessContext';

export const RECYCLE_RETENTION_DAYS = 30;

function parseJsonContent(raw: unknown): unknown | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

function toTimestamp(value: Date | string | number | null | undefined): number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

export function computeRecycleDaysRemaining(
  deletedAtMs: number,
  nowMs: number = Date.now(),
  retentionDays: number = RECYCLE_RETENTION_DAYS,
): number {
  const dayMs = 86_400_000;
  const purgeAt = deletedAtMs + retentionDays * dayMs;
  const remaining = Math.ceil((purgeAt - nowMs) / dayMs);
  return Math.max(0, Math.min(retentionDays, remaining));
}

type DocRow = {
  id: string;
  title: string;
  docType: string;
  scope: number;
  ownerId: string | null;
  tenantId: string | null;
  orgId: string | null;
  currentVersion: number;
  contentJson: unknown | null;
  createdAt: Date;
  updatedAt: Date;
  lastVisitedAt: Date | null;
  ownerName?: string | null;
  tenantName?: string | null;
};

function toDocumentRecord(row: DocRow): DocumentRecord {
  const updatedAt = toTimestamp(row.updatedAt) ?? Date.now();
  const createdAt = toTimestamp(row.createdAt) ?? updatedAt;
  const lastVisitedAt = toTimestamp(row.lastVisitedAt);
  const scope = (row.scope ?? 1) as DocumentScope;

  return {
    id: row.id,
    title: row.title,
    docType: row.docType,
    version: row.currentVersion,
    data: parseJsonContent(row.contentJson),
    ownerId: row.ownerId,
    ownerName: row.ownerName ?? null,
    tenantId: row.tenantId,
    orgId: row.orgId,
    scope,
    location: documentLocation(scope, row.tenantName),
    createdAt,
    updatedAt,
    lastVisitedAt,
    _meta: {
      version: row.currentVersion,
      savedAt: updatedAt,
    },
  };
}

function toListItem(row: DocRow): DocumentListItem {
  const updatedAt = toTimestamp(row.updatedAt) ?? Date.now();
  const createdAt = toTimestamp(row.createdAt) ?? updatedAt;
  const lastVisitedAt = toTimestamp(row.lastVisitedAt) ?? updatedAt;
  const scope = (row.scope ?? 1) as DocumentScope;

  return {
    id: row.id,
    title: row.title,
    docType: row.docType,
    ownerId: row.ownerId,
    ownerName: row.ownerName ?? '—',
    tenantId: row.tenantId,
    scope,
    location: documentLocation(scope, row.tenantName),
    createdAt,
    updatedAt,
    lastVisitedAt,
  };
}

@Injectable()
export class DocumentRepository {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly docRepo: Repository<DocumentEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private baseSelectQuery() {
    return this.docRepo
      .createQueryBuilder('d')
      .leftJoin(UserEntity, 'u', 'd.ownerId = u.id')
      .leftJoin(TenantEntity, 't', 'd.tenantId = t.id')
      .select([
        'd.id',
        'd.title',
        'd.docType',
        'd.scope',
        'd.ownerId',
        'd.tenantId',
        'd.orgId',
        'd.currentVersion',
        'd.contentJson',
        'd.createdAt',
        'd.updatedAt',
        'd.lastVisitedAt',
        'u.displayName',
        't.name',
      ]);
  }

  private mapRawRow(raw: Record<string, unknown>): DocRow {
    return {
      id: raw.d_id as string,
      title: raw.d_title as string,
      docType: (raw.d_doc_type ?? raw.d_docType) as string,
      scope: Number(raw.d_scope ?? 1),
      ownerId: (raw.d_owner_id ?? raw.d_ownerId ?? null) as string | null,
      tenantId: (raw.d_tenant_id ?? raw.d_tenantId ?? null) as string | null,
      orgId: (raw.d_org_id ?? raw.d_orgId ?? null) as string | null,
      currentVersion: Number(raw.d_current_version ?? raw.d_currentVersion ?? 0),
      contentJson: raw.d_content_json ?? raw.d_contentJson ?? null,
      createdAt: (raw.d_created_at ?? raw.d_createdAt) as Date,
      updatedAt: (raw.d_updated_at ?? raw.d_updatedAt) as Date,
      lastVisitedAt: (raw.d_last_visited_at ?? raw.d_lastVisitedAt ?? null) as Date | null,
      ownerName: (raw.u_display_name ?? raw.u_displayName ?? null) as string | null,
      tenantName: (raw.t_name ?? null) as string | null,
    };
  }

  async existsActiveTitle(
    title: string,
    ctx: DocumentAccessContext,
    excludeDocId?: string,
  ): Promise<boolean> {
    const normalized = title.trim();
    if (!normalized) return false;

    const qb = this.docRepo
      .createQueryBuilder('d')
      .where('d.isDeleted = 0')
      .andWhere('d.title = :title', { title: normalized });
    applyDocumentAccessToSelectQueryBuilder(qb, ctx, 'd');
    if (excludeDocId) {
      qb.andWhere('d.id != :excludeDocId', { excludeDocId });
    }
    return (await qb.getCount()) > 0;
  }

  async create(input: {
    id: string;
    title: string;
    docType?: string;
    data?: unknown;
    ownerId: string;
    scope?: DocumentScope;
    tenantId?: string | null;
    orgId?: string | null;
  }): Promise<DocumentRecord> {
    const title = input.title.trim();
    const scope = input.scope ?? 1;
    const contentJson = input.data ?? null;
    const contentStr = contentJson != null ? JSON.stringify(contentJson) : null;
    const storageSize = contentStr ? Buffer.byteLength(contentStr, 'utf8') : 0;

    await this.docRepo.save({
      id: input.id,
      title,
      docSlug: generateDocSlug(),
      docType: input.docType || 'freeform',
      scope,
      ownerId: input.ownerId,
      tenantId: scope === 2 ? (input.tenantId ?? null) : null,
      orgId: scope === 2 ? (input.orgId ?? null) : null,
      currentVersion: 0,
      contentJson,
      storageSize: String(storageSize),
    });

    const doc = await this.findById(input.id);
    if (!doc) throw new Error('创建文档失败');
    return doc;
  }

  async findById(docId: string): Promise<DocumentRecord | null> {
    const qb = this.baseSelectQuery()
      .where('d.id = :docId', { docId })
      .andWhere('d.isDeleted = 0');
    const raw = await qb.getRawOne<Record<string, unknown>>();
    return raw ? toDocumentRecord(this.mapRawRow(raw)) : null;
  }

  async findOwnedById(docId: string, ctx: DocumentAccessContext): Promise<DocumentRecord | null> {
    const qb = this.baseSelectQuery()
      .where('d.id = :docId', { docId })
      .andWhere('d.isDeleted = 0');
    applyDocumentAccessToSelectQueryBuilder(qb, ctx, 'd');
    const raw = await qb.getRawOne<Record<string, unknown>>();
    return raw ? toDocumentRecord(this.mapRawRow(raw)) : null;
  }

  async findAccessibleById(docId: string, ctx: DocumentAccessContext): Promise<DocumentRecord | null> {
    const qb = this.baseSelectQuery()
      .where('d.id = :docId', { docId })
      .andWhere('d.isDeleted = 0');
    applyDocumentReadAccessWithShare(qb, ctx, 'd');
    const raw = await qb.getRawOne<Record<string, unknown>>();
    return raw ? toDocumentRecord(this.mapRawRow(raw)) : null;
  }

  async findInfoMeta(
    docId: string,
    ctx: DocumentAccessContext,
  ): Promise<{
    id: string;
    title: string;
    docType: string;
    ownerId: string | null;
    ownerName: string | null;
    ownerEmail: string | null;
    createdAt: number;
    updatedAt: number;
    storageSize: number;
    data: unknown;
  } | null> {
    const qb = this.docRepo
      .createQueryBuilder('d')
      .leftJoin(UserEntity, 'u', 'd.ownerId = u.id')
      .select([
        'd.id',
        'd.title',
        'd.docType',
        'd.ownerId',
        'd.contentJson',
        'd.storageSize',
        'd.createdAt',
        'd.updatedAt',
        'u.displayName',
        'u.email',
      ])
      .where('d.id = :docId', { docId })
      .andWhere('d.isDeleted = 0');
    applyDocumentReadAccessWithShare(qb, ctx, 'd');
    const raw = await qb.getRawOne<Record<string, unknown>>();
    if (!raw) return null;
    const updatedAt = toTimestamp((raw.d_updated_at ?? raw.d_updatedAt) as Date) ?? Date.now();
    const createdAt = toTimestamp((raw.d_created_at ?? raw.d_createdAt) as Date) ?? updatedAt;
    return {
      id: raw.d_id as string,
      title: raw.d_title as string,
      docType: (raw.d_doc_type ?? raw.d_docType) as string,
      ownerId: (raw.d_owner_id ?? raw.d_ownerId ?? null) as string | null,
      ownerName: (raw.u_display_name ?? raw.u_displayName ?? null) as string | null,
      ownerEmail: (raw.u_email ?? null) as string | null,
      createdAt,
      updatedAt,
      storageSize: Number(raw.d_storage_size ?? raw.d_storageSize ?? 0),
      data: parseJsonContent(raw.d_content_json ?? raw.d_contentJson ?? null),
    };
  }

  async getWriteMeta(
    docId: string,
    ctx: DocumentAccessContext,
  ): Promise<{ scope: number; ownerId: string | null; tenantId: string | null; storageSize: number } | null> {
    const canWrite = await this.hasWriteAccess(docId, ctx);
    if (!canWrite) return null;
    const entity = await this.docRepo.findOne({
      where: { id: docId, isDeleted: 0 },
      select: ['scope', 'ownerId', 'tenantId', 'storageSize'],
    });
    if (!entity) return null;
    return {
      scope: entity.scope,
      ownerId: entity.ownerId,
      tenantId: entity.tenantId,
      storageSize: Number(entity.storageSize ?? 0),
    };
  }

  async hasWriteAccess(docId: string, ctx: DocumentAccessContext): Promise<boolean> {
    const access = buildDocumentAccessClause(ctx, 'd');
    const qb = this.docRepo
      .createQueryBuilder('d')
      .where('d.id = :docId', { docId })
      .andWhere('d.isDeleted = 0')
      .andWhere(
        `(${access.sql} OR ${buildCollaboratorWriteExistsSql('d')})`,
        { ...access.params, collabUserId: ctx.userId },
      );
    return (await qb.getCount()) > 0;
  }

  async findByIdForUser(docId: string, userId: string): Promise<DocumentRecord | null> {
    return this.findAccessibleById(docId, { userId, identityType: 'personal', tenantId: null });
  }

  async touchLastVisited(docId: string, ctx: DocumentAccessContext): Promise<void> {
    const readable = await this.findAccessibleById(docId, ctx);
    if (!readable) return;
    await this.dataSource
      .createQueryBuilder()
      .update(DocumentEntity)
      .set({ lastVisitedAt: () => 'CURRENT_TIMESTAMP' })
      .where('id = :docId', { docId })
      .andWhere('isDeleted = 0')
      .execute();
  }

  async list(
    sortBy: 'lastVisited' | 'created' | 'updated' = 'lastVisited',
    ctx: DocumentAccessContext,
  ): Promise<DocumentListItem[]> {
    const orderClause = sortBy === 'created'
      ? 'd.createdAt'
      : sortBy === 'updated'
        ? 'd.updatedAt'
        : 'COALESCE(d.lastVisitedAt, d.updatedAt)';

    const qb = this.docRepo
      .createQueryBuilder('d')
      .leftJoin(UserEntity, 'u', 'd.ownerId = u.id')
      .leftJoin(TenantEntity, 't', 'd.tenantId = t.id')
      .select([
        'd.id',
        'd.title',
        'd.docType',
        'd.scope',
        'd.ownerId',
        'd.tenantId',
        'd.orgId',
        'd.createdAt',
        'd.updatedAt',
        'd.lastVisitedAt',
        'u.displayName',
        't.name',
      ])
      .where('d.isDeleted = 0');
    applyDocumentAccessToSelectQueryBuilder(qb, ctx, 'd');
    qb.orderBy(orderClause, 'DESC');

    const rows = await qb.getRawMany<Record<string, unknown>>();
    return rows.map((r) => toListItem(this.mapRawRow(r)));
  }

  async listByTenant(tenantId: string, limit = 100): Promise<DocumentListItem[]> {
    const rows = await this.docRepo
      .createQueryBuilder('d')
      .leftJoin(UserEntity, 'u', 'd.ownerId = u.id')
      .leftJoin(TenantEntity, 't', 'd.tenantId = t.id')
      .select([
        'd.id',
        'd.title',
        'd.docType',
        'd.scope',
        'd.ownerId',
        'd.tenantId',
        'd.orgId',
        'd.createdAt',
        'd.updatedAt',
        'd.lastVisitedAt',
        'u.displayName',
        't.name',
      ])
      .where('d.isDeleted = 0')
      .andWhere('d.scope = 2')
      .andWhere('d.tenantId = :tenantId', { tenantId })
      .orderBy('d.updatedAt', 'DESC')
      .take(limit)
      .getRawMany<Record<string, unknown>>();

    return rows.map((r) => toListItem(this.mapRawRow(r)));
  }

  async save(
    docId: string,
    patch: Partial<DocumentRecord>,
    ctx: DocumentAccessContext,
  ): Promise<DocumentRecord | null> {
    const existing = await this.findAccessibleById(docId, ctx);
    if (!existing) return null;
    if (!(await this.hasWriteAccess(docId, ctx))) return null;

    const nextVersion = (existing.version || 0) + 1;
    const title = patch.title ?? existing.title;
    const docType = patch.docType ?? existing.docType;
    const data = patch.data !== undefined ? patch.data : existing.data;
    const contentStr = data != null ? JSON.stringify(data) : null;
    const storageSize = contentStr ? Buffer.byteLength(contentStr, 'utf8') : 0;

    await this.dataSource.transaction(async (manager) => {
      const updateQb = manager
        .createQueryBuilder()
        .update(DocumentEntity)
        .set({
          title,
          docType,
          currentVersion: nextVersion,
          contentJson: data,
          storageSize: String(storageSize),
        })
        .where('id = :docId', { docId })
        .andWhere('isDeleted = 0');
      await updateQb.execute();

      await manager.save(DocumentSnapshotEntity, {
        id: uuidv4(),
        docId,
        version: nextVersion,
        snapshotType: 'auto',
        snapshotData: data,
      });
    });

    return this.findById(docId);
  }

  /** 内部写入文档内容（表单公开提交等场景，跳过权限校验） */
  async saveContentInternal(
    docId: string,
    data: unknown,
  ): Promise<{ version: number } | null> {
    const existing = await this.findById(docId);
    if (!existing) return null;

    const nextVersion = (existing.version || 0) + 1;
    const contentStr = data != null ? JSON.stringify(data) : null;
    const storageSize = contentStr ? Buffer.byteLength(contentStr, 'utf8') : 0;

    await this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .update(DocumentEntity)
        .set({
          currentVersion: nextVersion,
          contentJson: data,
          storageSize: String(storageSize),
        })
        .where('id = :docId', { docId })
        .andWhere('isDeleted = 0')
        .execute();

      await manager.save(DocumentSnapshotEntity, {
        id: uuidv4(),
        docId,
        version: nextVersion,
        snapshotType: 'auto',
        snapshotData: data,
      });
    });

    return { version: nextVersion };
  }

  async applyPatch(
    docId: string,
    input: { baseVersion: number; title?: string; ops: DocumentPatchOp[] },
    ctx: DocumentAccessContext,
  ): Promise<
    | { success: true; version: number; applied: number }
    | { success: false; conflict: true; currentVersion: number }
    | null
  > {
    if (!input.ops.length && input.title == null) {
      const doc = await this.findAccessibleById(docId, ctx);
      if (!doc) return null;
      if (!(await this.hasWriteAccess(docId, ctx))) return null;
      return { success: true, version: doc.version, applied: 0 };
    }

    if (!(await this.hasWriteAccess(docId, ctx))) return null;

    return this.dataSource.transaction(async (manager) => {
      const qb = manager
        .createQueryBuilder(DocumentEntity, 'd')
        .select(['d.currentVersion', 'd.docType', 'd.title', 'd.contentJson'])
        .where('d.id = :docId', { docId })
        .andWhere('d.isDeleted = 0')
        .setLock('pessimistic_write');

      const locked = await qb.getOne();
      if (!locked) return null;

      if (locked.currentVersion !== input.baseVersion) {
        return { success: false, conflict: true, currentVersion: locked.currentVersion };
      }

      const baseContent = (parseJsonContent(locked.contentJson) ?? {}) as Record<string, unknown>;
      const kind = docTypeToPatchKind(locked.docType);
      const nextContent = applyDocumentPatch(kind, baseContent, input.ops);
      const title = input.title ?? locked.title;
      const contentStr = JSON.stringify(nextContent);
      const storageSize = Buffer.byteLength(contentStr, 'utf8');
      const nextVersion = locked.currentVersion + 1;

      const updateQb = manager
        .createQueryBuilder()
        .update(DocumentEntity)
        .set({
          title,
          currentVersion: nextVersion,
          contentJson: nextContent,
          storageSize: String(storageSize),
        })
        .where('id = :docId', { docId })
        .andWhere('isDeleted = 0');
      await updateQb.execute();

      return { success: true, version: nextVersion, applied: input.ops.length };
    });
  }

  async softDelete(docId: string, ctx: DocumentAccessContext): Promise<boolean> {
    const qb = this.dataSource
      .createQueryBuilder()
      .update(DocumentEntity)
      .set({ isDeleted: 1, deletedAt: () => 'CURRENT_TIMESTAMP' })
      .where('id = :docId', { docId })
      .andWhere('isDeleted = 0');
    applyDocumentAccessToUpdateQueryBuilder(qb, ctx);
    const result = await qb.execute();
    return (result.affected ?? 0) > 0;
  }

  async listDeleted(ctx: DocumentAccessContext): Promise<RecycleBinItem[]> {
    const qb = this.docRepo
      .createQueryBuilder('d')
      .leftJoin(UserEntity, 'u', 'd.ownerId = u.id')
      .select(['d.id', 'd.title', 'd.docType', 'd.deletedAt', 'u.displayName'])
      .where('d.isDeleted = 1');
    applyDocumentAccessToSelectQueryBuilder(qb, ctx, 'd');
    qb.orderBy('d.deletedAt', 'DESC');

    const rows = await qb.getRawMany<Record<string, unknown>>();

    return rows.map((row) => {
      const deletedAt = toTimestamp(
        (row.d_deleted_at ?? row.d_deletedAt) as Date | string | null,
      ) ?? Date.now();
      return {
        id: row.d_id as string,
        title: row.d_title as string,
        docType: (row.d_doc_type ?? row.d_docType) as string,
        operatorName: (row.u_display_name ?? row.u_displayName ?? '—') as string,
        deletedAt,
        daysRemaining: computeRecycleDaysRemaining(deletedAt),
      };
    });
  }

  async restore(docId: string, ctx: DocumentAccessContext): Promise<boolean> {
    const qb = this.dataSource
      .createQueryBuilder()
      .update(DocumentEntity)
      .set({ isDeleted: 0, deletedAt: null })
      .where('id = :docId', { docId })
      .andWhere('isDeleted = 1');
    applyDocumentAccessToUpdateQueryBuilder(qb, ctx);
    const result = await qb.execute();
    return (result.affected ?? 0) > 0;
  }

  async permanentDelete(docId: string, ctx: DocumentAccessContext): Promise<boolean> {
    const docQb = this.docRepo
      .createQueryBuilder('d')
      .where('d.id = :docId', { docId })
      .andWhere('d.isDeleted = 1');
    applyDocumentAccessToSelectQueryBuilder(docQb, ctx, 'd');
    const entity = await docQb.getOne();
    if (!entity) return false;
    await this.docRepo.remove(entity);
    return true;
  }

  resolveScope(ctx: DocumentAccessContext): DocumentScope {
    return resolveDocumentScope(ctx);
  }

  async countByOwner(ownerId: string): Promise<number> {
    return this.docRepo.count({
      where: { isDeleted: 0, scope: 1, ownerId },
    });
  }

  async countByTenant(tenantId: string): Promise<number> {
    return this.docRepo.count({
      where: { isDeleted: 0, scope: 2, tenantId },
    });
  }

  async sumStorageByOwner(ownerId: string): Promise<number> {
    const row = await this.docRepo
      .createQueryBuilder('d')
      .select('COALESCE(SUM(CAST(d.storageSize AS SIGNED)), 0)', 'total')
      .where('d.isDeleted = 0')
      .andWhere('d.scope = 1')
      .andWhere('d.ownerId = :ownerId', { ownerId })
      .getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  async sumStorageByTenant(tenantId: string): Promise<number> {
    const row = await this.docRepo
      .createQueryBuilder('d')
      .select('COALESCE(SUM(CAST(d.storageSize AS SIGNED)), 0)', 'total')
      .where('d.isDeleted = 0')
      .andWhere('d.scope = 2')
      .andWhere('d.tenantId = :tenantId', { tenantId })
      .getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  async count(): Promise<number> {
    return this.docRepo.count({ where: { isDeleted: 0 } });
  }

  async countExistingAsOf(end: Date): Promise<number> {
    return this.docRepo
      .createQueryBuilder('d')
      .where('d.createdAt <= :end', { end })
      .andWhere('(d.deletedAt IS NULL OR d.deletedAt > :end)', { end })
      .getCount();
  }

  async sumStorageAsOf(end: Date): Promise<number> {
    const row = await this.docRepo
      .createQueryBuilder('d')
      .select('COALESCE(SUM(CAST(d.storageSize AS SIGNED)), 0)', 'total')
      .where('d.createdAt <= :end', { end })
      .andWhere('(d.deletedAt IS NULL OR d.deletedAt > :end)', { end })
      .getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }
}
