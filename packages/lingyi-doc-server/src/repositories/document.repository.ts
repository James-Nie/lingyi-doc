import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { generateDocSlug } from '../utils/docSlug';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DocumentEntity } from '../database/entities/document.entity';
import { DocumentContentEntity } from '../database/entities/document-content.entity';
import { DocumentSnapshotEntity } from '../database/entities/document-snapshot.entity';
import { RecordChangeHistoryEntity } from '../database/entities/record-change-history.entity';
import { UserEntity } from '../database/entities/user.entity';
import { TenantEntity } from '../database/entities/tenant.entity';
import { applyDocumentPatch, docTypeToPatchKind, type DocumentPatchOp } from '../patch/applyDocumentPatch';
import type {
  DocumentListItem,
  DocumentMetaPatch,
  DocumentMetaResult,
  DocumentRecord,
  DocumentScope,
  RecordHistoryListResult,
  RecordHistoryPayloadEntry,
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
    @InjectRepository(DocumentContentEntity)
    private readonly contentRepo: Repository<DocumentContentEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private metaSelectQuery(includeRawContent = false) {
    const qb = this.docRepo
      .createQueryBuilder('d')
      .leftJoin(UserEntity, 'u', 'd.ownerId = u.id')
      .leftJoin(TenantEntity, 't', 'd.tenantId = t.id')
      .leftJoin('document_contents', 'dc', 'dc.doc_id = d.id')
      .select([
        'd.id',
        'd.title',
        'd.docType',
        'd.scope',
        'd.ownerId',
        'd.tenantId',
        'd.orgId',
        'd.currentVersion',
        'dc.created_at',
        'dc.updated_at',
        'd.lastVisitedAt',
        'u.displayName',
        't.name',
      ]);
    if (includeRawContent) {
      qb.addSelect('dc.content_json::text', 'content_json_raw');
    }
    return qb;
  }

  private baseSelectQuery() {
    return this.metaSelectQuery(false)
      .addSelect('dc.contentJson');
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
      // 从 document_contents 表读取内容和时间戳（dc_ 前缀）
      contentJson: raw.dc_content_json ?? raw.dc_contentJson ?? null,
      createdAt: (raw.dc_created_at ?? raw.dc_createdAt) as Date,
      updatedAt: (raw.dc_updated_at ?? raw.dc_updatedAt) as Date,
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
      .where('d.isDeleted = false')
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
        lastSnapshotVersion: version,
        lastSnapshotAt: new Date(),
      });

      const contentEntity = new DocumentContentEntity();
      contentEntity.docId = input.id;
      contentEntity.contentJson = contentJson ?? {};
      contentEntity.storageSize = String(storageSize);
      await manager.save(DocumentContentEntity, contentEntity);

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
      .andWhere('d.isDeleted = false');
    const raw = await qb.getRawOne<Record<string, unknown>>();
    return raw ? toDocumentRecord(this.mapRawRow(raw)) : null;
  }

  async findOwnedById(docId: string, ctx: DocumentAccessContext): Promise<DocumentRecord | null> {
    const qb = this.baseSelectQuery()
      .where('d.id = :docId', { docId })
      .andWhere('d.isDeleted = false');
    applyDocumentAccessToSelectQueryBuilder(qb, ctx, 'd');
    const raw = await qb.getRawOne<Record<string, unknown>>();
    return raw ? toDocumentRecord(this.mapRawRow(raw)) : null;
  }

  async findAccessibleById(docId: string, ctx: DocumentAccessContext): Promise<DocumentRecord | null> {
    const qb = this.baseSelectQuery()
      .where('d.id = :docId', { docId })
      .andWhere('d.isDeleted = false');
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
      .andWhere('d.isDeleted = false');
    applyDocumentReadAccessWithShare(qb, ctx, 'd');
    const raw = await qb.getRawOne<Record<string, unknown>>();
    if (!raw) return null;
    const contentJsonRaw = typeof raw.content_json_raw === 'string' ? raw.content_json_raw : null;
    return {
      meta: toDocumentRecordMeta(this.mapRawRow(raw)),
      contentJsonRaw,
    };
  }

  /** 已校验权限后直接加载 meta + content_json（避免重复 EXISTS 子查询） */
  async findMetaAndRawContent(docId: string): Promise<{ meta: Omit<DocumentRecord, 'data'>; contentJsonRaw: string | null } | null> {
    const qb = this.metaSelectQuery(true)
      .where('d.id = :docId', { docId })
      .andWhere('d.isDeleted = false');
    const raw = await qb.getRawOne<Record<string, unknown>>();
    if (!raw) return null;
    const contentJsonRaw = typeof raw.content_json_raw === 'string' ? raw.content_json_raw : null;
    return {
      meta: toDocumentRecordMeta(this.mapRawRow(raw)),
      contentJsonRaw,
    };
  }

  /** 按 id 加载 meta + content_json 原始文本（公开分享等已校验权限的场景） */
  async findByIdWithRawContent(
    docId: string,
  ): Promise<{ meta: Omit<DocumentRecord, 'data'>; contentJsonRaw: string | null } | null> {
    const qb = this.metaSelectQuery(true)
      .where('d.id = :docId', { docId })
      .andWhere('d.isDeleted = false');
    const raw = await qb.getRawOne<Record<string, unknown>>();
    if (!raw) return null;
    const contentJsonRaw = typeof raw.content_json_raw === 'string' ? raw.content_json_raw : null;
    return {
      meta: toDocumentRecordMeta(this.mapRawRow(raw)),
      contentJsonRaw,
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
      .leftJoin('document_contents', 'dc', 'dc.doc_id = d.id')
      .select([
        'd.id',
        'd.title',
        'd.docType',
        'd.ownerId',
        'dc.contentJson',
        'dc.storageSize',
        'dc.created_at',
        'dc.updated_at',
        'u.displayName',
        'u.email',
      ])
      .where('d.id = :docId', { docId })
      .andWhere('d.isDeleted = false');
    applyDocumentReadAccessWithShare(qb, ctx, 'd');
    const raw = await qb.getRawOne<Record<string, unknown>>();
    if (!raw) return null;
    const updatedAt = toTimestamp((raw.dc_updated_at ?? raw.dc_updatedAt) as Date) ?? Date.now();
    const createdAt = toTimestamp((raw.dc_created_at ?? raw.dc_createdAt) as Date) ?? updatedAt;
    return {
      id: raw.d_id as string,
      title: raw.d_title as string,
      docType: (raw.d_doc_type ?? raw.d_docType) as string,
      ownerId: (raw.d_owner_id ?? raw.d_ownerId ?? null) as string | null,
      ownerName: (raw.u_display_name ?? raw.u_displayName ?? null) as string | null,
      ownerEmail: (raw.u_email ?? null) as string | null,
      createdAt,
      updatedAt,
      storageSize: Number(raw.dc_storage_size ?? raw.dc_storageSize ?? 0),
      data: parseJsonContent(raw.dc_content_json ?? raw.dc_contentJson ?? null),
    };
  }

  async getWriteMeta(
    docId: string,
    ctx: DocumentAccessContext,
  ): Promise<{ scope: number; ownerId: string | null; tenantId: string | null; storageSize: number } | null> {
    const canWrite = await this.hasWriteAccess(docId, ctx);
    if (!canWrite) return null;

    const entity = await this.docRepo.findOne({
      where: { id: docId, isDeleted: false },
      select: ['scope', 'ownerId', 'tenantId'],
    });
    if (!entity) return null;

    const contentEntity = await this.contentRepo.findOne({
      where: { docId },
      select: ['storageSize'],
    });
    return {
      scope: entity.scope,
      ownerId: entity.ownerId,
      tenantId: entity.tenantId,
      storageSize: Number(contentEntity?.storageSize ?? 0),
    };
  }

  async hasWriteAccess(docId: string, ctx: DocumentAccessContext): Promise<boolean> {
    const qb = this.docRepo
      .createQueryBuilder('d')
      .where('d.id = :docId', { docId })
      .andWhere('d.isDeleted = false');
    applyDocumentWriteAccessWithShare(qb, ctx, 'd');
    return qb.getExists();
  }

  async hasReadAccess(docId: string, ctx: DocumentAccessContext): Promise<boolean> {
    const qb = this.docRepo
      .createQueryBuilder('d')
      .where('d.id = :docId', { docId })
      .andWhere('d.isDeleted = false');
    applyDocumentReadAccessWithShare(qb, ctx, 'd');
    return qb.getExists();
  }

  /** 当前身份空间内是否归当前用户所有（不加载 content_json） */
  async isOwnedByUser(docId: string, ctx: DocumentAccessContext): Promise<boolean> {
    const qb = this.docRepo
      .createQueryBuilder('d')
      .where('d.id = :docId', { docId })
      .andWhere('d.isDeleted = false');
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
      .set({ lastVisitedAt: () => 'NOW()' })
      .where('id = :docId', { docId })
      .andWhere('isDeleted = false')
      .execute();
    await this.upsertUserVisit(docId, ctx.userId);
  }

  /** 已校验权限后直接更新 last_visited（跳过重复 EXISTS） */
  async touchLastVisitedUnchecked(docId: string, userId: string): Promise<void> {
    await this.dataSource
      .createQueryBuilder()
      .update(DocumentEntity)
      .set({ lastVisitedAt: () => 'NOW()' })
      .where('id = :docId', { docId })
      .andWhere('isDeleted = false')
      .execute();
    await this.upsertUserVisit(docId, userId);
  }

  /** 记录当前用户对文档的访问时间（严格 per-user） */
  async upsertUserVisit(docId: string, userId: string): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO doc_user_visits (user_id, doc_id, last_visited_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, doc_id)
       DO UPDATE SET last_visited_at = NOW()`,
      [userId, docId],
    );
  }

  private listSelectQb() {
    return this.docRepo
      .createQueryBuilder('d')
      .leftJoin(UserEntity, 'u', 'd.ownerId = u.id')
      .leftJoin(TenantEntity, 't', 'd.tenantId = t.id')
      .leftJoin('kb_nodes', 'kn', 'kn.doc_id = d.id AND kn.is_deleted = false')
      .leftJoin('knowledge_bases', 'kb', 'kb.id = kn.kb_id AND kb.is_deleted = false')
      .leftJoin('document_contents', 'dc', 'dc.doc_id = d.id')
      .select([
        'd.id',
        'd.title',
        'd.docType',
        'd.docSlug',
        'd.scope',
        'd.ownerId',
        'd.tenantId',
        'd.orgId',
        'dc.created_at',
        'dc.updated_at',
        'd.lastVisitedAt',
        'u.displayName',
        'u.personalSpaceSlug',
        'u.defaultBookSlug',
        't.name',
        't.spaceSlug',
        't.defaultBookSlug',
      ])
      .addSelect('kb.kb_slug', 'kb_kb_slug')
      .where('d.isDeleted = false');
  }

  private orderBySort(
    qb: SelectQueryBuilder<DocumentEntity>,
    sortBy: 'lastVisited' | 'created' | 'updated',
    lastVisitedExpr = 'COALESCE(d.lastVisitedAt, dc.updated_at)',
  ): void {
    const orderClause = sortBy === 'created'
      ? 'dc.created_at'
      : sortBy === 'updated'
        ? 'dc.updated_at'
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
      WHERE kn.doc_id = d.id AND kn.is_deleted = false
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
    qb.andWhere("uv.last_visited_at >= NOW() - (:days || ' days')::interval", {
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
      .leftJoin('document_contents', 'dc', 'dc.doc_id = d.id')
      .select([
        'd.id',
        'd.title',
        'd.docType',
        'd.scope',
        'd.ownerId',
        'd.tenantId',
        'd.orgId',
        'dc.created_at',
        'dc.updated_at',
        'd.lastVisitedAt',
        'u.displayName',
        't.name',
      ])
      .where('d.isDeleted = false')
      .andWhere('d.scope = 2')
      .andWhere('d.tenantId = :tenantId', { tenantId })
      .orderBy('dc.updated_at', 'DESC')
      .take(limit)
      .getRawMany<Record<string, unknown>>();

    return rows.map((r) => toListItem(this.mapRawRow(r)));
  }

  async save(
    docId: string,
    patch: Partial<DocumentRecord> & { recordHistory?: RecordHistoryPayloadEntry[] },
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
          'd.lastSnapshotVersion',
          'd.lastSnapshotAt',
        ])
        .where('d.id = :docId', { docId })
        .andWhere('d.isDeleted = false')
        .setLock('pessimistic_write')
        .getOne();
      if (!locked) return null;

      // 从 document_contents 表读取内容
      const contentEntity = await manager.findOne(DocumentContentEntity, {
        where: { docId },
      });
      const existingContent = contentEntity?.contentJson;

      const nextVersion = (locked.currentVersion || 0) + 1;
      const title = patch.title ?? locked.title;
      const docType = patch.docType ?? locked.docType;
      const data = patch.data !== undefined ? patch.data : parseJsonContent(existingContent);
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
        contentVersion: nextVersion,
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
        .andWhere('isDeleted = false')
        .execute();

      // 多维表行级变更历史：独立表冷存储（与主 JSON 冷热分离）
      await this.extractRecordHistory(manager, docId, patch.recordHistory);

      // 更新或插入 document_contents 表
      if (contentEntity) {
        contentEntity.contentJson = data;
        contentEntity.storageSize = String(storageSize);
        await manager.save(contentEntity);
      } else {
        const newContent = new DocumentContentEntity();
        newContent.docId = docId;
        newContent.contentJson = data;
        newContent.storageSize = String(storageSize);
        await manager.save(newContent);
      }

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
        where: { id: docId, isDeleted: false },
        select: ['id', 'title', 'description', 'currentVersion'],
      });
      const contentEntity = await this.contentRepo.findOne({
        where: { docId },
        select: ['updatedAt'],
      });
      if (!entity) return null;
      return {
        id: entity.id,
        title: entity.title,
        description: entity.description,
        version: entity.currentVersion,
        updatedAt: toTimestamp(contentEntity?.updatedAt) ?? Date.now(),
      };
    }

    const titlePatch = hasTitle ? { title: patch.title!.trim() } : {};
    const descPatch = hasDescription
      ? { description: patch.description == null ? null : String(patch.description).trim() || null }
      : {};

    await this.dataSource.transaction(async (manager) => {
      if (hasTitle || hasDescription) {
        await manager
          .createQueryBuilder()
          .update(DocumentEntity)
          .set({ ...titlePatch, ...descPatch })
          .where('id = :docId', { docId })
          .andWhere('isDeleted = false')
          .execute();
      }

      // 同步更新 document_contents.updated_at
      await manager
        .createQueryBuilder()
        .update(DocumentContentEntity)
        .set({ updatedAt: () => 'NOW()' })
        .where('doc_id = :docId', { docId })
        .execute();
    });

    const entity = await this.docRepo.findOne({
      where: { id: docId, isDeleted: false },
      select: ['id', 'title', 'description', 'currentVersion'],
    });
    const contentEntity = await this.contentRepo.findOne({
      where: { docId },
      select: ['updatedAt'],
    });
    if (!entity) return null;
    return {
      id: entity.id,
      title: entity.title,
      description: entity.description,
      version: entity.currentVersion,
      updatedAt: toTimestamp(contentEntity?.updatedAt) ?? Date.now(),
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
        .andWhere('d.isDeleted = false')
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
        contentVersion: nextVersion,
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
        .andWhere('isDeleted = false')
        .execute();

      // 更新或插入 document_contents 表
      const contentEntity = await manager.findOne(DocumentContentEntity, {
        where: { docId },
      });
      if (contentEntity) {
        contentEntity.contentJson = data;
        contentEntity.storageSize = String(storageSize);
        await manager.save(contentEntity);
      } else {
        const newContent = new DocumentContentEntity();
        newContent.docId = docId;
        newContent.contentJson = data;
        newContent.storageSize = String(storageSize);
        await manager.save(newContent);
      }

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
    input: {
      baseVersion: number;
      title?: string;
      ops: DocumentPatchOp[];
      recordHistory?: RecordHistoryPayloadEntry[];
    },
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
          'd.lastSnapshotVersion',
          'd.lastSnapshotAt',
        ])
        .where('d.id = :docId', { docId })
        .andWhere('d.isDeleted = false')
        .setLock('pessimistic_write');

      const locked = await qb.getOne();
      if (!locked) return null;

      if (locked.currentVersion !== input.baseVersion) {
        return { success: false, conflict: true, currentVersion: locked.currentVersion };
      }

      // 从 document_contents 表读取内容
      const contentEntity = await manager.findOne(DocumentContentEntity, {
        where: { docId },
      });
      const baseContent = (parseJsonContent(contentEntity?.contentJson) ?? {}) as Record<string, unknown>;
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
        contentVersion: nextVersion,
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
        .andWhere('isDeleted = false')
        .execute();

      // 多维表行级变更历史：独立表冷存储（与主 JSON 冷热分离）
      await this.extractRecordHistory(manager, docId, input.recordHistory);

      // 更新或插入 document_contents 表
      if (contentEntity) {
        contentEntity.contentJson = nextContent;
        contentEntity.storageSize = String(storageSize);
        await manager.save(contentEntity);
      } else {
        const newContent = new DocumentContentEntity();
        newContent.docId = docId;
        newContent.contentJson = nextContent;
        newContent.storageSize = String(storageSize);
        await manager.save(newContent);
      }

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

  /**
   * 将随保存请求携带的行级变更历史抽取写入独立表（按 entry id 去重，幂等）。
   * 主 JSON / 快照不再内嵌 _history，冷热分离。
   */
  private async extractRecordHistory(
    manager: EntityManager,
    docId: string,
    entries?: RecordHistoryPayloadEntry[],
  ): Promise<void> {
    if (!entries || entries.length === 0) return;
    const values = entries
      .filter((e) => e && typeof e.id === 'string' && typeof e.recordId === 'string')
      .map((e) => ({
        id: e.id,
        docId,
        recordId: e.recordId,
        sheetId: e.sheetId ?? null,
        at: String(Math.floor(Number(e.at) || Date.now())),
        by: String(e.by ?? ''),
        action: e.action === 'update' ? 'update' : 'create',
        fieldId: e.fieldId ?? null,
        beforeValue: (e.before as Record<string, unknown> | null | undefined) ?? null,
        afterValue: (e.after as Record<string, unknown> | null | undefined) ?? null,
      }));
    if (values.length === 0) return;
    await manager
      .createQueryBuilder()
      .insert()
      .into(RecordChangeHistoryEntity)
      .values(values as never)
      .orIgnore()
      .execute();
  }

  /**
   * 分页读取某条记录的行级变更历史（详情抽屉「历史」页）。
   * 权限校验由调用方负责（controller 先做读权限检查）。
   */
  async listRecordHistory(
    docId: string,
    recordId: string,
    opts: { page?: number; pageSize?: number } = {},
  ): Promise<RecordHistoryListResult> {
    const page = Math.max(1, Math.floor(opts.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(opts.pageSize ?? 50)));
    const repo = this.dataSource.getRepository(RecordChangeHistoryEntity);
    const total = await repo.count({ where: { docId, recordId } });
    const rows = await repo.find({
      where: { docId, recordId },
      order: { at: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const items = rows.map((row) => ({
      id: row.id,
      at: Number(row.at),
      by: row.by,
      action: row.action === 'update' ? ('update' as const) : ('create' as const),
      fieldId: row.fieldId ?? undefined,
      before: row.beforeValue ?? undefined,
      after: row.afterValue ?? undefined,
    }));
    return { items, total, hasMore: page * pageSize < total };
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
        .select(['d.currentVersion'])
        .where('d.id = :docId', { docId })
        .andWhere('d.isDeleted = false')
        .setLock('pessimistic_write')
        .getOne();
      if (!locked) return null;

      // 从 document_contents 表读取内容
      const contentEntity = await manager.findOne(DocumentContentEntity, {
        where: { docId },
      });

      const nextVersion = locked.currentVersion + 1;
      const data = parseJsonContent(contentEntity?.contentJson);

      await manager
        .createQueryBuilder()
        .update(DocumentEntity)
        .set({
          currentVersion: nextVersion,
          lastSnapshotVersion: nextVersion,
          lastSnapshotAt: new Date(),
        })
        .where('id = :docId', { docId })
        .andWhere('isDeleted = false')
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
        .select(['d.currentVersion'])
        .where('d.id = :docId', { docId })
        .andWhere('d.isDeleted = false')
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
          contentVersion: nextVersion,
          lastSnapshotVersion: nextVersion,
          lastSnapshotAt: new Date(),
        })
        .where('id = :docId', { docId })
        .andWhere('isDeleted = false')
        .execute();

      // 更新或插入 document_contents 表
      const contentEntity = await manager.findOne(DocumentContentEntity, {
        where: { docId },
      });
      if (contentEntity) {
        contentEntity.contentJson = data;
        contentEntity.storageSize = String(storageSize);
        await manager.save(contentEntity);
      } else {
        const newContent = new DocumentContentEntity();
        newContent.docId = docId;
        newContent.contentJson = data;
        newContent.storageSize = String(storageSize);
        await manager.save(newContent);
      }

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
      .set({ isDeleted: true, deletedAt: () => 'NOW()' })
      .where('id = :docId', { docId })
      .andWhere('isDeleted = false');
    applyDocumentAccessToUpdateQueryBuilder(qb, ctx);
    const result = await qb.execute();
    return (result.affected ?? 0) > 0;
  }

  async softDeleteByIds(docIds: string[], ctx: DocumentAccessContext): Promise<number> {
    if (docIds.length === 0) return 0;
    const qb = this.dataSource
      .createQueryBuilder()
      .update(DocumentEntity)
      .set({ isDeleted: true, deletedAt: () => 'NOW()' })
      .where('id IN (:...docIds)', { docIds })
      .andWhere('isDeleted = false');
    applyDocumentAccessToUpdateQueryBuilder(qb, ctx);
    const result = await qb.execute();
    return result.affected ?? 0;
  }

  async listDeleted(ctx: DocumentAccessContext): Promise<RecycleBinItem[]> {
    const qb = this.docRepo
      .createQueryBuilder('d')
      .leftJoin(UserEntity, 'u', 'd.ownerId = u.id')
      .select(['d.id', 'd.title', 'd.docType', 'd.deletedAt', 'u.displayName'])
      .where('d.isDeleted = true');
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
      .set({ isDeleted: false, deletedAt: null })
      .where('id = :docId', { docId })
      .andWhere('isDeleted = true');
    applyDocumentAccessToUpdateQueryBuilder(qb, ctx);
    const result = await qb.execute();
    return (result.affected ?? 0) > 0;
  }

  async permanentDelete(docId: string, ctx: DocumentAccessContext): Promise<boolean> {
    const docQb = this.docRepo
      .createQueryBuilder('d')
      .where('d.id = :docId', { docId })
      .andWhere('d.isDeleted = true');
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
      where: { isDeleted: false, scope: 1, ownerId },
    });
  }

  async countByTenant(tenantId: string): Promise<number> {
    return this.docRepo.count({
      where: { isDeleted: false, scope: 2, tenantId },
    });
  }

  async sumStorageByOwner(ownerId: string): Promise<number> {
    const row = await this.docRepo
      .createQueryBuilder('d')
      .leftJoin('document_contents', 'dc', 'dc.doc_id = d.id')
      .select("COALESCE(SUM(dc.storage_size::bigint), 0)", 'total')
      .where('d.isDeleted = false')
      .andWhere('d.scope = 1')
      .andWhere('d.ownerId = :ownerId', { ownerId })
      .getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  async sumStorageByTenant(tenantId: string): Promise<number> {
    const row = await this.docRepo
      .createQueryBuilder('d')
      .leftJoin('document_contents', 'dc', 'dc.doc_id = d.id')
      .select("COALESCE(SUM(dc.storage_size::bigint), 0)", 'total')
      .where('d.isDeleted = false')
      .andWhere('d.scope = 2')
      .andWhere('d.tenantId = :tenantId', { tenantId })
      .getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  async count(): Promise<number> {
    return this.docRepo.count({ where: { isDeleted: false } });
  }

  async countExistingAsOf(end: Date): Promise<number> {
    return this.docRepo
      .createQueryBuilder('d')
      .leftJoin('document_contents', 'dc', 'dc.doc_id = d.id')
      .where('dc.created_at <= :end', { end })
      .andWhere('(d.deletedAt IS NULL OR d.deletedAt > :end)', { end })
      .getCount();
  }

  async sumStorageAsOf(end: Date): Promise<number> {
    const row = await this.docRepo
      .createQueryBuilder('d')
      .leftJoin('document_contents', 'dc', 'dc.doc_id = d.id')
      .select("COALESCE(SUM(dc.storage_size::bigint), 0)", 'total')
      .where('dc.created_at <= :end', { end })
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
        .leftJoin('document_contents', 'dc', 'dc.doc_id = d.id')
        .select("to_char(dc.created_at, 'YYYY-MM-DD')", 'day')
        .addSelect('COUNT(*)', 'cnt')
        .addSelect("COALESCE(SUM(dc.storage_size::bigint), 0)", 'storage')
        .where('dc.created_at >= :since', { since })
        .andWhere('dc.created_at <= :until', { until })
        .groupBy("to_char(dc.created_at, 'YYYY-MM-DD')")
        .getRawMany<{ day: string; cnt: string; storage: string }>(),
      this.docRepo
        .createQueryBuilder('d')
        .leftJoin('document_contents', 'dc', 'dc.doc_id = d.id')
        .select("to_char(d.\"deleted_at\", 'YYYY-MM-DD')", 'day')
        .addSelect('COUNT(*)', 'cnt')
        .addSelect("COALESCE(SUM(dc.storage_size::bigint), 0)", 'storage')
        .where('d."deleted_at" IS NOT NULL')
        .andWhere('d."deleted_at" >= :since', { since })
        .andWhere('d."deleted_at" <= :until', { until })
        .groupBy("to_char(d.\"deleted_at\", 'YYYY-MM-DD')")
        .getRawMany<{ day: string; cnt: string; storage: string }>(),
    ]);

    return {
      created: toDayMap(createdRows),
      deleted: toDayMap(deletedRows),
    };
  }
}
