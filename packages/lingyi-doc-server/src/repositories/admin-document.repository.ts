import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AdminScope } from './admin-access.repository';

/** 内容治理台列表行 */
export interface AdminDocumentRow {
  id: string;
  title: string;
  docType: string;
  scope: number;
  ownerId: string | null;
  ownerName: string | null;
  tenantId: string | null;
  tenantName: string | null;
  orgId: string | null;
  orgName: string | null;
  currentVersion: number;
  isDeleted: boolean;
  deletedAt: number | null;
  archivedAt: number | null;
  lastVisitedAt: number | null;
  createdAt: number | null;
  updatedAt: number | null;
  activeShareCount: number;
}

export interface AdminDocumentFilter {
  keyword?: string;
  docType?: string;
  scope?: number;
  tenantId?: string;
  orgId?: string;
  ownerId?: string;
  /** 'true' | 'false'，缺省 'false'（只列未删除） */
  deleted?: string;
  /** 'true' | 'false'；缺省不过滤 */
  archived?: string;
  startDate?: Date;
  endDate?: Date;
  sortBy?: 'created_at' | 'updated_at' | 'title' | 'last_visited_at';
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export interface AdminDocumentStats {
  total: number;
  teamDocuments: number;
  personalDocuments: number;
  archived: number;
  trashed: number;
  activeShares: number;
}

const SORTABLE: Record<string, string> = {
  created_at: 'd.created_at',
  updated_at: 'd.updated_at',
  title: 'd.title',
  last_visited_at: 'd.last_visited_at',
};

/** 彻底删除时需要显式清理的、对 documents 无外键的表（其余靠 ON DELETE CASCADE） */
const ORPHAN_TABLES_ON_PURGE = [
  'crdt_oplog',
  'doc_comment_threads',
  'doc_share_audit_log',
  'doc_share_visit_log',
  'record_change_history',
  'ai_document_vector',
];

/**
 * 内容治理台（P0-1）数据访问层。
 *
 * 为什么独立仓储：
 * - 现有 `DocumentRepository` 面向 C 端用户语义（按 owner / tenant 隔离），
 *   与管理端「跨所有者全量 + 管理范围」的查询口径完全不同，混用会破坏既有隔离假设。
 * - 管理端需要跨表聚合（所有者名、租户名、部门名、活跃分享数），用原生 SQL 更直接可控。
 *
 * 管理范围语义（P0-3 联动）：
 * - scope = all  → 全量
 * - scope = orgs → 仅 `documents.org_id ∈ scope.orgIds`
 *   个人文档（scope=1，org_id 为 NULL）不对部门级管理员可见 —— 对应等保三级
 *   8.1.4.2 d) 最小权限与 8.1.4.11 个人信息保护。
 */
@Injectable()
export class AdminDocumentRepository {
  private readonly logger = new Logger(AdminDocumentRepository.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private scopeClause(scope: AdminScope, params: unknown[], col = 'd.org_id'): string | null {
    if (scope.type === 'none') return '1=0';
    if (scope.type === 'all') return null;
    if (!scope.orgIds.length) return '1=0';
    params.push(scope.orgIds);
    return `${col} = ANY($${params.length}::varchar[])`;
  }

  private buildWhere(filter: AdminDocumentFilter, scope: AdminScope): { where: string; params: unknown[] } {
    const params: unknown[] = [];
    const conds: string[] = [];

    const scopeSql = this.scopeClause(scope, params);
    if (scopeSql) conds.push(scopeSql);

    // 删除态：默认只看未删除
    const deleted = filter.deleted ?? 'false';
    if (deleted === 'true') conds.push('d.is_deleted = true');
    else if (deleted === 'false') conds.push('d.is_deleted = false');

    if (filter.archived === 'true') conds.push('d.archived_at IS NOT NULL');
    else if (filter.archived === 'false') conds.push('d.archived_at IS NULL');

    if (filter.keyword) {
      params.push(`%${filter.keyword}%`);
      conds.push(`(d.title ILIKE $${params.length} OR d.id ILIKE $${params.length} OR u.display_name ILIKE $${params.length})`);
    }
    if (filter.docType) {
      params.push(filter.docType);
      conds.push(`d.doc_type = $${params.length}`);
    }
    if (filter.scope !== undefined && filter.scope !== null) {
      params.push(filter.scope);
      conds.push(`d.scope = $${params.length}`);
    }
    if (filter.tenantId) {
      params.push(filter.tenantId);
      conds.push(`d.tenant_id = $${params.length}`);
    }
    if (filter.orgId) {
      params.push(filter.orgId);
      conds.push(`d.org_id = $${params.length}`);
    }
    if (filter.ownerId) {
      params.push(filter.ownerId);
      conds.push(`d.owner_id = $${params.length}`);
    }
    if (filter.startDate) {
      params.push(filter.startDate);
      conds.push(`d.created_at >= $${params.length}`);
    }
    if (filter.endDate) {
      params.push(filter.endDate);
      conds.push(`d.created_at <= $${params.length}`);
    }

    return { where: conds.length ? conds.join(' AND ') : '1=1', params };
  }

  private baseFrom(): string {
    return `FROM documents d
      LEFT JOIN users u ON u.id = d.owner_id
      LEFT JOIN tenants t ON t.id = d.tenant_id
      LEFT JOIN organizations o ON o.id = d.org_id`;
  }

  async list(
    filter: AdminDocumentFilter,
    scope: AdminScope,
  ): Promise<{ items: AdminDocumentRow[]; total: number }> {
    const { where, params } = this.buildWhere(filter, scope);
    const limit = Math.min(filter.limit ?? 20, 200);
    const offset = filter.offset ?? 0;
    const sortCol = SORTABLE[filter.sortBy ?? 'created_at'] ?? 'd.created_at';
    const sortOrder = filter.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const countRows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total ${this.baseFrom()} WHERE ${where}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);

    const listParams = [...params, limit, offset];
    const rows = await this.dataSource.query(
      `SELECT d.id, d.title, d.doc_type, d.scope, d.owner_id, u.display_name AS owner_name,
              d.tenant_id, t.name AS tenant_name, d.org_id, o.name AS org_name,
              d.current_version, d.is_deleted, d.deleted_at, d.archived_at,
              d.last_visited_at, d.created_at, d.updated_at,
              (SELECT COUNT(*)::int FROM doc_share s
                WHERE s.doc_id = d.id AND s.status = true) AS active_share_count
       ${this.baseFrom()}
       WHERE ${where}
       ORDER BY ${sortCol} ${sortOrder} NULLS LAST
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    );

    return { items: rows.map((r: Record<string, unknown>) => this.mapRow(r)), total };
  }

  /** 导出用：不分页，上限由调用方限制 */
  async listForExport(filter: AdminDocumentFilter, scope: AdminScope, limit: number): Promise<AdminDocumentRow[]> {
    const { items } = await this.list({ ...filter, limit, offset: 0 }, scope);
    return items;
  }

  async stats(scope: AdminScope): Promise<AdminDocumentStats> {
    const params: unknown[] = [];
    const scopeSql = this.scopeClause(scope, params);
    const scopeWhere = scopeSql ? `WHERE ${scopeSql}` : '';

    const rows = await this.dataSource.query(
      `SELECT
         COUNT(*) FILTER (WHERE d.is_deleted = false)::int AS total,
         COUNT(*) FILTER (WHERE d.is_deleted = false AND d.scope = 2)::int AS team_documents,
         COUNT(*) FILTER (WHERE d.is_deleted = false AND d.scope = 1)::int AS personal_documents,
         COUNT(*) FILTER (WHERE d.is_deleted = false AND d.archived_at IS NOT NULL)::int AS archived,
         COUNT(*) FILTER (WHERE d.is_deleted = true)::int AS trashed
       FROM documents d ${scopeWhere}`,
      params,
    );

    const shareParams: unknown[] = [];
    const shareScopeSql = this.scopeClause(scope, shareParams);
    const shareRows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS active_shares
         FROM doc_share s
         JOIN documents d ON d.id = s.doc_id
        WHERE s.status = true AND d.is_deleted = false
        ${shareScopeSql ? `AND ${shareScopeSql}` : ''}`,
      shareParams,
    );

    const r = rows[0] ?? {};
    return {
      total: Number(r.total ?? 0),
      teamDocuments: Number(r.team_documents ?? 0),
      personalDocuments: Number(r.personal_documents ?? 0),
      archived: Number(r.archived ?? 0),
      trashed: Number(r.trashed ?? 0),
      activeShares: Number(shareRows[0]?.active_shares ?? 0),
    };
  }

  async findById(id: string, scope: AdminScope): Promise<AdminDocumentRow | null> {
    const params: unknown[] = [id];
    const scopeSql = this.scopeClause(scope, params);
    const rows = await this.dataSource.query(
      `SELECT d.id, d.title, d.doc_type, d.scope, d.owner_id, u.display_name AS owner_name,
              d.tenant_id, t.name AS tenant_name, d.org_id, o.name AS org_name,
              d.current_version, d.is_deleted, d.deleted_at, d.archived_at,
              d.last_visited_at, d.created_at, d.updated_at,
              (SELECT COUNT(*)::int FROM doc_share s
                WHERE s.doc_id = d.id AND s.status = true) AS active_share_count
       ${this.baseFrom()}
       WHERE d.id = $1 ${scopeSql ? `AND ${scopeSql}` : ''}
       LIMIT 1`,
      params,
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  /** 详情附加信息：协作者数、访问次数、最后分享状态 */
  async detailExtras(docId: string): Promise<{
    collaboratorCount: number;
    visitCount: number;
    lastVisitAt: number | null;
    share: {
      status: boolean;
      permissionLevel: string;
      expireTime: number | null;
      hasPassword: boolean;
      allowDownload: boolean;
      allowCopy: boolean;
      allowPrint: boolean;
      watermarkEnabled: boolean;
    } | null;
  }> {
    const [collab, visits, shareRows] = await Promise.all([
      this.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM doc_share_user WHERE doc_id = $1`,
        [docId],
      ),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS n, MAX(created_at) AS last_at
           FROM doc_user_visits WHERE doc_id = $1`,
        [docId],
      ),
      this.dataSource.query(
        `SELECT status, permission_level, expire_time, password_hash,
                allow_download, allow_copy, allow_print, watermark_enabled
           FROM doc_share WHERE doc_id = $1 AND share_type = 'link' LIMIT 1`,
        [docId],
      ),
    ]);

    const s = shareRows[0] as Record<string, unknown> | undefined;
    return {
      collaboratorCount: Number(collab[0]?.n ?? 0),
      visitCount: Number(visits[0]?.n ?? 0),
      lastVisitAt: this.toMillis(visits[0]?.last_at),
      share: s
        ? {
            status: s.status === true,
            permissionLevel: String(s.permission_level),
            expireTime: this.toMillis(s.expire_time),
            hasPassword: !!s.password_hash,
            allowDownload: s.allow_download === true,
            allowCopy: s.allow_copy === true,
            allowPrint: s.allow_print === true,
            watermarkEnabled: s.watermark_enabled === true,
          }
        : null,
    };
  }

  /** 在管理范围内的文档 ID（用于批量操作前的越权过滤） */
  async filterAllowedIds(ids: string[], scope: AdminScope): Promise<string[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return [];
    if (scope.type === 'none') return [];

    const params: unknown[] = [unique];
    const scopeSql = this.scopeClause(scope, params);
    const rows = await this.dataSource.query(
      `SELECT d.id FROM documents d WHERE d.id = ANY($1::varchar[]) ${scopeSql ? `AND ${scopeSql}` : ''}`,
      params,
    );
    return rows.map((r: { id: string }) => r.id);
  }

  async findActiveUser(userId: string): Promise<{ id: string; displayName: string; status: string } | null> {
    const rows = await this.dataSource.query(
      `SELECT id, display_name, status FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    const r = rows[0];
    return r ? { id: r.id, displayName: r.display_name, status: r.status } : null;
  }

  /** 转移所有权：管理员代管场景，所有权变更后仍保留原文档内容与协作者 */
  async transferOwnership(docIds: string[], targetOwnerId: string): Promise<number> {
    if (!docIds.length) return 0;
    // 用 RETURNING 取实际影响行数，避免不同驱动的 rowCount 返回形态差异
    const rows = await this.dataSource.query(
      `UPDATE documents SET owner_id = $1, updated_at = NOW()
        WHERE id = ANY($2::varchar[])
        RETURNING id`,
      [targetOwnerId, docIds],
    );
    return Array.isArray(rows) ? rows.length : 0;
  }

  async setArchived(docIds: string[], archived: boolean): Promise<number> {
    if (!docIds.length) return 0;
    const rows = await this.dataSource.query(
      `UPDATE documents
          SET archived_at = ${archived ? 'NOW()' : 'NULL'}, updated_at = NOW()
        WHERE id = ANY($1::varchar[])
        RETURNING id`,
      [docIds],
    );
    return Array.isArray(rows) ? rows.length : 0;
  }

  async softDelete(docIds: string[]): Promise<number> {
    if (!docIds.length) return 0;
    const rows = await this.dataSource.query(
      `UPDATE documents
          SET is_deleted = true, deleted_at = NOW(), updated_at = NOW()
        WHERE id = ANY($1::varchar[]) AND is_deleted = false
        RETURNING id`,
      [docIds],
    );
    return Array.isArray(rows) ? rows.length : 0;
  }

  async restore(docIds: string[]): Promise<number> {
    if (!docIds.length) return 0;
    const rows = await this.dataSource.query(
      `UPDATE documents
          SET is_deleted = false, deleted_at = NULL, updated_at = NOW()
        WHERE id = ANY($1::varchar[]) AND is_deleted = true
        RETURNING id`,
      [docIds],
    );
    return Array.isArray(rows) ? rows.length : 0;
  }

  /**
   * 彻底删除：仅对已软删除的文档生效（防止误操作直接抹掉在线文档）。
   *
   * 依赖 ON DELETE CASCADE 清理多数关联表（document_contents / document_sheets /
   * document_snapshots / doc_share* / base_* / doc_user_visits 等），
   * 再显式清理无外键的孤儿表（见 ORPHAN_TABLES_ON_PURGE）。
   *
   * 已知未清理：ai_workflow(doc_id)、ai_agent_session(document_id)、wf_trigger_outbox(doc_id)
   * —— 这三者属于「工作流定义 / 会话记录 / 投递队列」，删除源文档不应连带删除，
   * 但其 doc_id 会成为悬挂引用，已在设计文档 §3 记录为遗留项。
   */
  async purge(docIds: string[]): Promise<{ purged: number; skipped: string[] }> {
    const unique = [...new Set(docIds.filter(Boolean))];
    if (!unique.length) return { purged: 0, skipped: [] };

    const deletedRows = await this.dataSource.query(
      `SELECT id FROM documents WHERE id = ANY($1::varchar[]) AND is_deleted = true`,
      [unique],
    );
    const purgeable: string[] = deletedRows.map((r: { id: string }) => r.id);
    const skipped = unique.filter((id) => !purgeable.includes(id));
    if (!purgeable.length) return { purged: 0, skipped };

    await this.dataSource.transaction(async (manager) => {
      for (const table of ORPHAN_TABLES_ON_PURGE) {
        await manager.query(`DELETE FROM "${table}" WHERE doc_id = ANY($1::varchar[])`, [purgeable]);
      }
      await manager.query(`DELETE FROM documents WHERE id = ANY($1::varchar[])`, [purgeable]);
    });

    return { purged: purgeable.length, skipped };
  }

  private mapRow(r: Record<string, unknown>): AdminDocumentRow {
    return {
      id: String(r.id),
      title: String(r.title ?? ''),
      docType: String(r.doc_type ?? 'freeform'),
      scope: Number(r.scope ?? 1),
      ownerId: (r.owner_id ?? null) as string | null,
      ownerName: (r.owner_name ?? null) as string | null,
      tenantId: (r.tenant_id ?? null) as string | null,
      tenantName: (r.tenant_name ?? null) as string | null,
      orgId: (r.org_id ?? null) as string | null,
      orgName: (r.org_name ?? null) as string | null,
      currentVersion: Number(r.current_version ?? 0),
      isDeleted: r.is_deleted === true,
      deletedAt: this.toMillis(r.deleted_at),
      archivedAt: this.toMillis(r.archived_at),
      lastVisitedAt: this.toMillis(r.last_visited_at),
      createdAt: this.toMillis(r.created_at),
      updatedAt: this.toMillis(r.updated_at),
      activeShareCount: Number(r.active_share_count ?? 0),
    };
  }

  private toMillis(value: unknown): number | null {
    if (!value) return null;
    if (value instanceof Date) return value.getTime();
    const n = new Date(value as string).getTime();
    return Number.isNaN(n) ? null : n;
  }
}
