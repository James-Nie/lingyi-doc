import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { generateDocSlug } from '../utils/docSlug';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DocumentEntity } from '../database/entities/document.entity';
import { DocumentSnapshotEntity } from '../database/entities/document-snapshot.entity';
import { UserEntity } from '../database/entities/user.entity';
import { TenantEntity } from '../database/entities/tenant.entity';
import { applyDocumentPatch, docTypeToPatchKind, type DocumentPatchOp } from '../patch/applyDocumentPatch';
import type {
  DocumentListItem,
  DocumentMetaPatch,
  DocumentMetaResult,
  DocumentRecord,
  DocumentScope,
  RecycleBinItem,
} from '../types/database';
import type {
  DocumentSnapshotActionType,
  DocumentVersionDetail,
  DocumentVersionListItem,
} from '../types/document-version';
import type { DocumentAccessContext } from '../types/session';
import { documentLocation } from '../types/session';
import {
  applyDocumentAccessToSelectQueryBuilder,
  applyDocumentAccessToUpdateQueryBuilder,
  applyDocumentReadAccessWithShare,
  applyDocumentWriteAccessWithShare,
  resolveDocumentScope,
} from '../utils/documentAccessContext';
import { normalizeContentJsonRaw } from '../utils/documentRecordJson';

export const RECYCLE_RETENTION_DAYS = 30;

/** 自动检查点最短间隔（patch / 全量 PUT 共用） */
const SNAPSHOT_MIN_INTERVAL_MS = 5 * 60 * 1000;
/** 距上次快照版本跨度达到该值时强制落盘 */
const SNAPSHOT_MIN_VERSION_GAP = 20;
const VERSION_LIST_DEFAULT_LIMIT = 20;
const VERSION_LIST_MAX_LIMIT = 50;
/** 文档列表安全上限，防止无分页接口一次拉全表 */
const DOCUMENT_LIST_MAX_LIMIT = 100;

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
  docSlug?: string | null;
  personalSpaceSlug?: string | null;
  userBookSlug?: string | null;
  tenantSpaceSlug?: string | null;
  tenantBookSlug?: string | null;
  kbSlug?: string | null;
};

function resolveListPathSlugs(row: DocRow): {
  docSlug: string | null;
  spaceSlug: string | null;
  bookSlug: string | null;
} {
  const docSlug = row.docSlug ?? null;
  const spaceSlug = row.scope === 2
    ? (row.tenantSpaceSlug ?? null)
    : (row.personalSpaceSlug ?? null);
  const bookSlug = row.kbSlug
    ?? (row.scope === 2 ? row.tenantBookSlug : row.userBookSlug)
    ?? null;
  return { docSlug, spaceSlug, bookSlug };
}

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
  const path = resolveListPathSlugs(row);

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
    docSlug: path.docSlug,
    spaceSlug: path.spaceSlug,
    bookSlug: path.bookSlug,
  };
}

function hashSnapshotContent(data: unknown): string | null {
  if (data == null) return null;
  try {
    return createHash('sha256').update(JSON.stringify(data)).digest('hex');
  } catch {
    return null;
  }
}

function shouldWriteAutoSnapshot(
  lastSnapshotAt: Date | null | undefined,
  lastSnapshotVersion: number,
  nextVersion: number,
  nowMs: number = Date.now(),
): boolean {
  if (lastSnapshotAt == null) return true;
  const elapsed = nowMs - new Date(lastSnapshotAt).getTime();
  if (!Number.isFinite(elapsed) || elapsed >= SNAPSHOT_MIN_INTERVAL_MS) return true;
  if (nextVersion - lastSnapshotVersion >= SNAPSHOT_MIN_VERSION_GAP) return true;
  return false;
}

function toDocumentRecordMeta(row: DocRow): Omit<DocumentRecord, 'data'> {
  const { data: _ignored, ...meta } = toDocumentRecord({ ...row, contentJson: null });
  return meta;
}

function toVersionListItem(row: {
  version: number;
  snapshotType: string;
  actionType: string | null;
  label: string | null;
  parentVersion: number | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: Date | string;
}): DocumentVersionListItem {
  return {
    version: row.version,
    snapshotType: row.snapshotType,
    actionType: (row.actionType as DocumentSnapshotActionType | null) ?? null,
    label: row.label,
    parentVersion: row.parentVersion,
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    createdAt: toTimestamp(row.createdAt) ?? Date.now(),
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

  private metaSelectQuery(includeRawContent = false) {
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
        'd.currentVersion',
        'd.createdAt',
        'd.updatedAt',
        'd.lastVisitedAt',
        'u.displayName',
        't.name',
      ]);
    if (includeRawContent) {
      qb.addSelect('CAST(d.content_json AS CHAR)', 'content_json_raw');
    }
    return qb;
  }

  private baseSelectQuery() {
    return this.metaSelectQuery(false).addSelect('d.contentJson');
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
      docSlug: (raw.d_doc_slug ?? raw.d_docSlug ?? null) as string | null,
      personalSpaceSlug: (raw.u_personal_space_slug ?? raw.u_personalSpaceSlug ?? null) as string | null,
      userBookSlug: (raw.u_default_book_slug ?? raw.u_defaultBookSlug ?? null) as string | null,
      tenantSpaceSlug: (raw.t_space_slug ?? raw.t_spaceSlug ?? null) as string | null,
      tenantBookSlug: (raw.t_default_book_slug ?? raw.t_defaultBookSlug ?? null) as string | null,
      kbSlug: (raw.kb_kb_slug ?? raw.kb_kbSlug ?? null) as string | null,
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
    const version = 0;

    await this.dataSource.transaction(async (manager) => {
      await manager.save(DocumentEntity, {
        id: input.id,
        title,
        docSlug: generateDocSlug(),
        docType: input.docType || 'freeform',
        scope,
        ownerId: input.ownerId,
        tenantId: scope === 2 ? (input.tenantId ?? null) : null,
        orgId: scope === 2 ? (input.orgId ?? null) : null,
        currentVersion: version,
        contentJson,
        storageSize: String(storageSize),
        lastSnapshotVersion: version,
        lastSnapshotAt: new Date(),
      });

      await this.insertSnapshot(manager, {
        docId: input.id,
        version,
        snapshotType: 'auto',
        actionType: 'create',
        snapshotData: contentJson,
        createdBy: input.ownerId,
      });
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

  /** 可读文档 meta + content_json 原始文本（避免 Node 侧 parse 大 JSON） */
  async findAccessibleWithRawContent(
    docId: string,
    ctx: DocumentAccessContext,
  ): Promise<{ meta: Omit<DocumentRecord, 'data'>; contentJsonRaw: string | null } | null> {
    const qb = this.metaSelectQuery(true)
      .where('d.id = :docId', { docId })
      .andWhere('d.isDeleted = 0');
    applyDocumentReadAccessWithShare(qb, ctx, 'd');
    const raw = await qb.getRawOne<Record<string, unknown>>();
    if (!raw) return null;
    return {
      meta: toDocumentRecordMeta(this.mapRawRow(raw)),
      contentJsonRaw: normalizeContentJsonRaw(raw.content_json_raw ?? raw.contentJsonRaw),
    };
  }

  /** 按 id 加载 meta + content_json 原始文本（公开分享等已校验权限的场景） */
  async findByIdWithRawContent(
    docId: string,
  ): Promise<{ meta: Omit<DocumentRecord, 'data'>; contentJsonRaw: string | null } | null> {
    const qb = this.metaSelectQuery(true)
      .where('d.id = :docId', { docId })
      .andWhere('d.isDeleted = 0');
    const raw = await qb.getRawOne<Record<string, unknown>>();
    if (!raw) return null;
    return {
      meta: toDocumentRecordMeta(this.mapRawRow(raw)),
      contentJsonRaw: normalizeContentJsonRaw(raw.content_json_raw ?? raw.contentJsonRaw),
    };
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
    const qb = this.docRepo
      .createQueryBuilder('d')
      .where('d.id = :docId', { docId })
      .andWhere('d.isDeleted = 0');
    applyDocumentWriteAccessWithShare(qb, ctx, 'd');
    return qb.getExists();
  }

  async hasReadAccess(docId: string, ctx: DocumentAccessContext): Promise<boolean> {
    const qb = this.docRepo
      .createQueryBuilder('d')
      .where('d.id = :docId', { docId })
      .andWhere('d.isDeleted = 0');
    applyDocumentReadAccessWithShare(qb, ctx, 'd');
    return qb.getExists();
  }

  /** 当前身份空间内是否归当前用户所有（不加载 content_json） */
  async isOwnedByUser(docId: string, ctx: DocumentAccessContext): Promise<boolean> {
    const qb = this.docRepo
      .createQueryBuilder('d')
      .where('d.id = :docId', { docId })
      .andWhere('d.isDeleted = 0');
    applyDocumentAccessToSelectQueryBuilder(qb, ctx, 'd');
    return qb.getExists();
  }

  async findByIdForUser(docId: string, userId: string): Promise<DocumentRecord | null> {
    return this.findAccessibleById(docId, { userId, identityType: 'personal', tenantId: null });
  }

  async touchLastVisited(docId: string, ctx: DocumentAccessContext): Promise<void> {
    // 仅校验可读，不加载 content_json
    const readable = await this.hasReadAccess(docId, ctx);
    if (!readable) return;
    await this.dataSource
      .createQueryBuilder()
      .update(DocumentEntity)
      .set({ lastVisitedAt: () => 'CURRENT_TIMESTAMP' })
      .where('id = :docId', { docId })
      .andWhere('isDeleted = 0')
      .execute();
    await this.upsertUserVisit(docId, ctx.userId);
  }

  /** 记录当前用户对文档的访问时间（严格 per-user） */
  async upsertUserVisit(docId: string, userId: string): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO doc_user_visits (user_id, doc_id, last_visited_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE last_visited_at = CURRENT_TIMESTAMP`,
      [userId, docId],
    );
  }

  private listSelectQb() {
    return this.docRepo
      .createQueryBuilder('d')
      .leftJoin(UserEntity, 'u', 'd.ownerId = u.id')
      .leftJoin(TenantEntity, 't', 'd.tenantId = t.id')
      .leftJoin('kb_nodes', 'kn', 'kn.doc_id = d.id AND kn.is_deleted = 0')
      .leftJoin('knowledge_bases', 'kb', 'kb.id = kn.kb_id AND kb.is_deleted = 0')
      .select([
        'd.id',
        'd.title',
        'd.docType',
        'd.docSlug',
        'd.scope',
        'd.ownerId',
        'd.tenantId',
        'd.orgId',
        'd.createdAt',
        'd.updatedAt',
        'd.lastVisitedAt',
        'u.displayName',
        'u.personalSpaceSlug',
        'u.defaultBookSlug',
        't.name',
        't.spaceSlug',
        't.defaultBookSlug',
      ])
      .addSelect('kb.kb_slug', 'kb_kb_slug')
      .where('d.isDeleted = 0');
  }

  private orderBySort(
    qb: SelectQueryBuilder<DocumentEntity>,
    sortBy: 'lastVisited' | 'created' | 'updated',
    lastVisitedExpr = 'COALESCE(d.lastVisitedAt, d.updatedAt)',
  ): void {
    const orderClause = sortBy === 'created'
      ? 'd.createdAt'
      : sortBy === 'updated'
        ? 'd.updatedAt'
        : lastVisitedExpr;
    qb.orderBy(orderClause, 'DESC');
  }

  /**
   * 我的文档库：当前身份可访问且未挂载到任何知识库的文档
   */
  async listLibrary(
    sortBy: 'lastVisited' | 'created' | 'updated' = 'lastVisited',
    ctx: DocumentAccessContext,
  ): Promise<DocumentListItem[]> {
    const qb = this.listSelectQb();
    applyDocumentAccessToSelectQueryBuilder(qb, ctx, 'd');
    qb.andWhere(`NOT EXISTS (
      SELECT 1 FROM kb_nodes kn
      WHERE kn.doc_id = d.id AND kn.is_deleted = 0
    )`);
    this.orderBySort(qb, sortBy);
    qb.take(DOCUMENT_LIST_MAX_LIMIT);
    const rows = await qb.getRawMany<Record<string, unknown>>();
    return rows.map((r) => toListItem(this.mapRawRow(r)));
  }

  /**
   * 归我所有：当前身份空间内、owner_id = 当前用户
   * （含文档库 + 知识库；不跨个人/其他租户空间）
   */
  async listOwned(
    sortBy: 'lastVisited' | 'created' | 'updated' = 'lastVisited',
    ctx: DocumentAccessContext,
  ): Promise<DocumentListItem[]> {
    const qb = this.listSelectQb();
    applyDocumentAccessToSelectQueryBuilder(qb, ctx, 'd');
    qb.andWhere('d.ownerId = :ownerId', { ownerId: ctx.userId });
    this.orderBySort(qb, sortBy);
    qb.take(DOCUMENT_LIST_MAX_LIMIT);
    const rows = await qb.getRawMany<Record<string, unknown>>();
    return rows.map((r) => toListItem(this.mapRawRow(r)));
  }

  /**
   * 最近访问：当前用户近 N 天内打开过、且仍可读的文档（严格 per-user）
   */
  async listRecent(
    sortBy: 'lastVisited' | 'created' | 'updated' = 'lastVisited',
    ctx: DocumentAccessContext,
    days = 30,
  ): Promise<DocumentListItem[]> {
    const safeDays = Number.isFinite(days) ? Math.min(Math.max(Math.floor(days), 1), 365) : 30;
    const qb = this.listSelectQb();
    qb.innerJoin(
      'doc_user_visits',
      'uv',
      'uv.doc_id = d.id AND uv.user_id = :visitUserId',
      { visitUserId: ctx.userId },
    );
    qb.addSelect('uv.last_visited_at', 'uv_last_visited_at');
    qb.andWhere('uv.last_visited_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL :days DAY)', {
      days: safeDays,
    });
    applyDocumentReadAccessWithShare(qb, ctx, 'd');
    this.orderBySort(qb, sortBy, 'uv.last_visited_at');
    qb.take(DOCUMENT_LIST_MAX_LIMIT);

    const rows = await qb.getRawMany<Record<string, unknown>>();
    return rows.map((r) => {
      const item = toListItem(this.mapRawRow(r));
      const userVisited = toTimestamp(
        (r.uv_last_visited_at ?? r.uvLastVisitedAt) as Date | string | null | undefined,
      );
      if (userVisited != null) item.lastVisitedAt = userVisited;
      return item;
    });
  }

  /** @deprecated 使用 listLibrary / listOwned / listRecent */
  async list(
    sortBy: 'lastVisited' | 'created' | 'updated' = 'lastVisited',
    ctx: DocumentAccessContext,
  ): Promise<DocumentListItem[]> {
    return this.listLibrary(sortBy, ctx);
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
    if (!(await this.hasWriteAccess(docId, ctx))) return null;

    const result = await this.dataSource.transaction(async (manager) => {
      const locked = await manager
        .createQueryBuilder(DocumentEntity, 'd')
        .select([
          'd.id',
          'd.title',
          'd.docType',
          'd.currentVersion',
          'd.contentJson',
          'd.lastSnapshotVersion',
          'd.lastSnapshotAt',
        ])
        .where('d.id = :docId', { docId })
        .andWhere('d.isDeleted = 0')
        .setLock('pessimistic_write')
        .getOne();
      if (!locked) return null;

      const nextVersion = (locked.currentVersion || 0) + 1;
      const title = patch.title ?? locked.title;
      const docType = patch.docType ?? locked.docType;
      const data = patch.data !== undefined ? patch.data : parseJsonContent(locked.contentJson);
      const contentStr = data != null ? JSON.stringify(data) : null;
      const storageSize = contentStr ? Buffer.byteLength(contentStr, 'utf8') : 0;
      const writeSnapshot = shouldWriteAutoSnapshot(
        locked.lastSnapshotAt,
        locked.lastSnapshotVersion ?? 0,
        nextVersion,
      );

      const updateSet: Partial<DocumentEntity> = {
        title,
        docType,
        currentVersion: nextVersion,
        contentJson: data,
        storageSize: String(storageSize),
      };
      if (writeSnapshot) {
        updateSet.lastSnapshotVersion = nextVersion;
        updateSet.lastSnapshotAt = new Date();
      }

      await manager
        .createQueryBuilder()
        .update(DocumentEntity)
        .set(updateSet)
        .where('id = :docId', { docId })
        .andWhere('isDeleted = 0')
        .execute();

      if (writeSnapshot) {
        await this.insertSnapshot(manager, {
          docId,
          version: nextVersion,
          snapshotType: 'auto',
          actionType: 'auto',
          snapshotData: data,
          createdBy: ctx.userId,
        });
      }

      return true;
    });

    if (!result) return null;
    return this.findById(docId);
  }

  /**
   * 仅更新文档基本信息，不改 content_json，不升 current_version。
   * 避免侧边栏重命名等场景全量读写正文。
   */
  async updateMeta(
    docId: string,
    patch: DocumentMetaPatch,
    ctx: DocumentAccessContext,
  ): Promise<DocumentMetaResult | null> {
    if (!(await this.hasWriteAccess(docId, ctx))) return null;

    const hasTitle = patch.title !== undefined;
    const hasDescription = patch.description !== undefined;
    if (!hasTitle && !hasDescription) {
      const entity = await this.docRepo.findOne({
        where: { id: docId, isDeleted: 0 },
        select: ['id', 'title', 'description', 'currentVersion', 'updatedAt'],
      });
      if (!entity) return null;
      return {
        id: entity.id,
        title: entity.title,
        description: entity.description,
        version: entity.currentVersion,
        updatedAt: toTimestamp(entity.updatedAt) ?? Date.now(),
      };
    }

    const updateSet: {
      title?: string;
      description?: string | null;
      updatedAt: () => string;
    } = {
      updatedAt: () => 'CURRENT_TIMESTAMP',
    };
    if (hasTitle) updateSet.title = patch.title!.trim();
    if (hasDescription) {
      updateSet.description =
        patch.description == null ? null : String(patch.description).trim() || null;
    }

    const result = await this.dataSource
      .createQueryBuilder()
      .update(DocumentEntity)
      .set(updateSet)
      .where('id = :docId', { docId })
      .andWhere('isDeleted = 0')
      .execute();

    if ((result.affected ?? 0) === 0) return null;

    const entity = await this.docRepo.findOne({
      where: { id: docId, isDeleted: 0 },
      select: ['id', 'title', 'description', 'currentVersion', 'updatedAt'],
    });
    if (!entity) return null;
    return {
      id: entity.id,
      title: entity.title,
      description: entity.description,
      version: entity.currentVersion,
      updatedAt: toTimestamp(entity.updatedAt) ?? Date.now(),
    };
  }

  /** 内部写入文档内容（表单公开提交等场景，跳过权限校验） */
  async saveContentInternal(
    docId: string,
    data: unknown,
    createdBy?: string | null,
    options?: { docType?: string },
  ): Promise<{ version: number } | null> {
    return this.dataSource.transaction(async (manager) => {
      const locked = await manager
        .createQueryBuilder(DocumentEntity, 'd')
        .select([
          'd.id',
          'd.docType',
          'd.currentVersion',
          'd.lastSnapshotVersion',
          'd.lastSnapshotAt',
        ])
        .where('d.id = :docId', { docId })
        .andWhere('d.isDeleted = 0')
        .setLock('pessimistic_write')
        .getOne();
      if (!locked) return null;

      const nextVersion = (locked.currentVersion || 0) + 1;
      const contentStr = data != null ? JSON.stringify(data) : null;
      const storageSize = contentStr ? Buffer.byteLength(contentStr, 'utf8') : 0;
      const docType = options?.docType ?? locked.docType;
      const writeSnapshot = shouldWriteAutoSnapshot(
        locked.lastSnapshotAt,
        locked.lastSnapshotVersion ?? 0,
        nextVersion,
      );

      const updateSet: Partial<DocumentEntity> = {
        docType,
        currentVersion: nextVersion,
        contentJson: data,
        storageSize: String(storageSize),
      };
      if (writeSnapshot) {
        updateSet.lastSnapshotVersion = nextVersion;
        updateSet.lastSnapshotAt = new Date();
      }

      await manager
        .createQueryBuilder()
        .update(DocumentEntity)
        .set(updateSet)
        .where('id = :docId', { docId })
        .andWhere('isDeleted = 0')
        .execute();

      if (writeSnapshot) {
        await this.insertSnapshot(manager, {
          docId,
          version: nextVersion,
          snapshotType: 'auto',
          actionType: 'auto',
          snapshotData: data,
          createdBy: createdBy ?? null,
        });
      }

      return { version: nextVersion };
    });
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
        .select([
          'd.currentVersion',
          'd.docType',
          'd.title',
          'd.contentJson',
          'd.lastSnapshotVersion',
          'd.lastSnapshotAt',
        ])
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
      const writeSnapshot = shouldWriteAutoSnapshot(
        locked.lastSnapshotAt,
        locked.lastSnapshotVersion ?? 0,
        nextVersion,
      );

      const updateSet: Partial<DocumentEntity> = {
        title,
        currentVersion: nextVersion,
        contentJson: nextContent,
        storageSize: String(storageSize),
      };
      if (writeSnapshot) {
        updateSet.lastSnapshotVersion = nextVersion;
        updateSet.lastSnapshotAt = new Date();
      }

      await manager
        .createQueryBuilder()
        .update(DocumentEntity)
        .set(updateSet)
        .where('id = :docId', { docId })
        .andWhere('isDeleted = 0')
        .execute();

      if (writeSnapshot) {
        await this.insertSnapshot(manager, {
          docId,
          version: nextVersion,
          snapshotType: 'auto',
          actionType: 'auto',
          snapshotData: nextContent,
          createdBy: ctx.userId,
        });
      }

      return { success: true, version: nextVersion, applied: input.ops.length };
    });
  }

  async listVersions(
    docId: string,
    opts: { limit?: number; beforeVersion?: number } = {},
  ): Promise<{ items: DocumentVersionListItem[]; total: number; hasMore: boolean }> {
    const limit = Math.min(
      Math.max(1, opts.limit ?? VERSION_LIST_DEFAULT_LIMIT),
      VERSION_LIST_MAX_LIMIT,
    );
    const snapRepo = this.dataSource.getRepository(DocumentSnapshotEntity);

    const total = await snapRepo.count({ where: { docId } });

    const qb = snapRepo
      .createQueryBuilder('s')
      .select([
        's.version',
        's.snapshotType',
        's.actionType',
        's.label',
        's.parentVersion',
        's.createdBy',
        's.createdAt',
      ])
      .where('s.docId = :docId', { docId })
      .orderBy('s.version', 'DESC')
      .take(limit + 1);

    if (opts.beforeVersion != null && Number.isFinite(opts.beforeVersion)) {
      qb.andWhere('s.version < :beforeVersion', { beforeVersion: opts.beforeVersion });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const nameMap = await this.resolveUserDisplayNames(
      slice.map((row) => row.createdBy).filter((id): id is string => !!id),
    );

    const items = slice.map((row) =>
      toVersionListItem({
        version: row.version,
        snapshotType: row.snapshotType,
        actionType: row.actionType,
        label: row.label,
        parentVersion: row.parentVersion,
        createdBy: row.createdBy,
        createdByName: row.createdBy ? (nameMap.get(row.createdBy) ?? null) : null,
        createdAt: row.createdAt,
      }),
    );

    return { items, total, hasMore };
  }

  async getVersion(docId: string, version: number): Promise<DocumentVersionDetail | null> {
    const row = await this.dataSource.getRepository(DocumentSnapshotEntity).findOne({
      where: { docId, version },
    });
    if (!row) return null;

    const nameMap = await this.resolveUserDisplayNames(row.createdBy ? [row.createdBy] : []);
    const item = toVersionListItem({
      version: row.version,
      snapshotType: row.snapshotType,
      actionType: row.actionType,
      label: row.label,
      parentVersion: row.parentVersion,
      createdBy: row.createdBy,
      createdByName: row.createdBy ? (nameMap.get(row.createdBy) ?? null) : null,
      createdAt: row.createdAt,
    });

    return {
      ...item,
      snapshotData: parseJsonContent(row.snapshotData),
      contentHash: row.contentHash,
    };
  }

  private async resolveUserDisplayNames(userIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds.filter(Boolean))];
    const map = new Map<string, string>();
    if (!unique.length) return map;

    const users = await this.dataSource
      .getRepository(UserEntity)
      .createQueryBuilder('u')
      .select(['u.id', 'u.displayName'])
      .where('u.id IN (:...ids)', { ids: unique })
      .getMany();

    for (const user of users) {
      map.set(user.id, user.displayName);
    }
    return map;
  }

  /** 将当前内容另存为命名版本（version +1，内容不变） */
  async createNamedVersion(
    docId: string,
    label: string,
    ctx: DocumentAccessContext,
  ): Promise<DocumentVersionListItem | null> {
    if (!(await this.hasWriteAccess(docId, ctx))) return null;

    const result = await this.dataSource.transaction(async (manager) => {
      const locked = await manager
        .createQueryBuilder(DocumentEntity, 'd')
        .select(['d.currentVersion', 'd.contentJson'])
        .where('d.id = :docId', { docId })
        .andWhere('d.isDeleted = 0')
        .setLock('pessimistic_write')
        .getOne();
      if (!locked) return null;

      const nextVersion = locked.currentVersion + 1;
      const data = parseJsonContent(locked.contentJson);

      await manager
        .createQueryBuilder()
        .update(DocumentEntity)
        .set({
          currentVersion: nextVersion,
          lastSnapshotVersion: nextVersion,
          lastSnapshotAt: new Date(),
        })
        .where('id = :docId', { docId })
        .andWhere('isDeleted = 0')
        .execute();

      await this.insertSnapshot(manager, {
        docId,
        version: nextVersion,
        snapshotType: 'named',
        actionType: 'named',
        snapshotData: data,
        createdBy: ctx.userId,
        label,
      });

      return nextVersion;
    });

    if (result == null) return null;
    return this.getVersion(docId, result);
  }

  /** 将指定快照写回当前文档，并新增一条 restore 快照 */
  async restoreVersion(
    docId: string,
    version: number,
    ctx: DocumentAccessContext,
  ): Promise<{ version: number } | null> {
    if (!(await this.hasWriteAccess(docId, ctx))) return null;

    return this.dataSource.transaction(async (manager) => {
      const locked = await manager
        .createQueryBuilder(DocumentEntity, 'd')
        .select(['d.currentVersion', 'd.contentJson'])
        .where('d.id = :docId', { docId })
        .andWhere('d.isDeleted = 0')
        .setLock('pessimistic_write')
        .getOne();
      if (!locked) return null;

      const snapshot = await manager.findOne(DocumentSnapshotEntity, {
        where: { docId, version },
      });
      if (!snapshot) return null;

      const data = parseJsonContent(snapshot.snapshotData);
      const contentStr = data != null ? JSON.stringify(data) : null;
      const storageSize = contentStr ? Buffer.byteLength(contentStr, 'utf8') : 0;
      const nextVersion = locked.currentVersion + 1;

      await manager
        .createQueryBuilder()
        .update(DocumentEntity)
        .set({
          currentVersion: nextVersion,
          contentJson: data,
          storageSize: String(storageSize),
          lastSnapshotVersion: nextVersion,
          lastSnapshotAt: new Date(),
        })
        .where('id = :docId', { docId })
        .andWhere('isDeleted = 0')
        .execute();

      await this.insertSnapshot(manager, {
        docId,
        version: nextVersion,
        snapshotType: 'restore',
        actionType: 'restore',
        snapshotData: data,
        createdBy: ctx.userId,
        parentVersion: version,
      });

      return { version: nextVersion };
    });
  }

  private async insertSnapshot(
    manager: EntityManager,
    input: {
      docId: string;
      version: number;
      snapshotType: string;
      actionType: DocumentSnapshotActionType;
      snapshotData: unknown;
      createdBy?: string | null;
      label?: string | null;
      parentVersion?: number | null;
    },
  ): Promise<void> {
    await manager.save(DocumentSnapshotEntity, {
      id: uuidv4(),
      docId: input.docId,
      version: input.version,
      snapshotType: input.snapshotType,
      actionType: input.actionType,
      parentVersion: input.parentVersion ?? null,
      snapshotData: input.snapshotData ?? null,
      contentHash: hashSnapshotContent(input.snapshotData),
      label: input.label ?? null,
      createdBy: input.createdBy ?? null,
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

  async softDeleteByIds(docIds: string[], ctx: DocumentAccessContext): Promise<number> {
    if (docIds.length === 0) return 0;
    const qb = this.dataSource
      .createQueryBuilder()
      .update(DocumentEntity)
      .set({ isDeleted: 1, deletedAt: () => 'CURRENT_TIMESTAMP' })
      .where('id IN (:...docIds)', { docIds })
      .andWhere('isDeleted = 0');
    applyDocumentAccessToUpdateQueryBuilder(qb, ctx);
    const result = await qb.execute();
    return result.affected ?? 0;
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

  /**
   * 区间内按日的文档创建/删除增量（含 storage），用于管理端趋势回推，
   * 避免对每个自然日重复 SUM/COUNT 全表。
   */
  async getDailyExistenceDeltas(
    since: Date,
    until: Date,
  ): Promise<{
    created: Map<string, { count: number; storage: number }>;
    deleted: Map<string, { count: number; storage: number }>;
  }> {
    const toDayMap = (rows: Array<{ day: string; cnt: string; storage: string }>) => {
      const map = new Map<string, { count: number; storage: number }>();
      for (const row of rows) {
        map.set(String(row.day).slice(0, 10), {
          count: Number(row.cnt ?? 0),
          storage: Number(row.storage ?? 0),
        });
      }
      return map;
    };

    const [createdRows, deletedRows] = await Promise.all([
      this.docRepo
        .createQueryBuilder('d')
        .select("DATE_FORMAT(d.createdAt, '%Y-%m-%d')", 'day')
        .addSelect('COUNT(*)', 'cnt')
        .addSelect('COALESCE(SUM(CAST(d.storageSize AS SIGNED)), 0)', 'storage')
        .where('d.createdAt >= :since', { since })
        .andWhere('d.createdAt <= :until', { until })
        .groupBy("DATE_FORMAT(d.createdAt, '%Y-%m-%d')")
        .getRawMany<{ day: string; cnt: string; storage: string }>(),
      this.docRepo
        .createQueryBuilder('d')
        .select("DATE_FORMAT(d.deletedAt, '%Y-%m-%d')", 'day')
        .addSelect('COUNT(*)', 'cnt')
        .addSelect('COALESCE(SUM(CAST(d.storageSize AS SIGNED)), 0)', 'storage')
        .where('d.deletedAt IS NOT NULL')
        .andWhere('d.deletedAt >= :since', { since })
        .andWhere('d.deletedAt <= :until', { until })
        .groupBy("DATE_FORMAT(d.deletedAt, '%Y-%m-%d')")
        .getRawMany<{ day: string; cnt: string; storage: string }>(),
    ]);

    return {
      created: toDayMap(createdRows),
      deleted: toDayMap(deletedRows),
    };
  }
}
