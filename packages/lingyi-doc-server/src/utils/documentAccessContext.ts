import type { SelectQueryBuilder, UpdateQueryBuilder } from 'typeorm';
import type { DocumentEntity } from '../database/entities/document.entity';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { DocumentAccessContext } from '../types/session';

/** 构建文档列表/访问 SQL 条件（个人 vs 企业） */
export function buildDocumentAccessClause(
  ctx: DocumentAccessContext,
  alias?: string,
): { sql: string; params: Record<string, string | number> } {
  const prefix = alias ? `${alias}.` : '';
  if (ctx.identityType === 'tenant' && ctx.tenantId) {
    return {
      sql: `${prefix}scope = :scope AND ${prefix}tenantId = :tenantId`,
      params: { scope: 2, tenantId: ctx.tenantId },
    };
  }
  return {
    sql: `${prefix}scope = :scope AND ${prefix}ownerId = :ownerId`,
    params: { scope: 1, ownerId: ctx.userId },
  };
}

export function applyDocumentAccessToSelectQueryBuilder(
  qb: SelectQueryBuilder<DocumentEntity>,
  ctx: DocumentAccessContext,
  alias = 'd',
): void {
  const access = buildDocumentAccessClause(ctx, alias);
  qb.andWhere(access.sql, access.params);
}

export function applyDocumentAccessToUpdateQueryBuilder(
  qb: UpdateQueryBuilder<DocumentEntity>,
  ctx: DocumentAccessContext,
): void {
  const access = buildDocumentAccessClause(ctx);
  qb.andWhere(access.sql, access.params);
}

export function resolveDocumentScope(ctx: DocumentAccessContext): 1 | 2 {
  if (ctx.identityType === 'tenant' && ctx.tenantId) return 2;
  return 1;
}

export type AuthContextForDocumentAccess = AuthUser;

export function documentAccessFromAuth(auth: AuthUser): DocumentAccessContext {
  return {
    userId: auth.userId,
    identityType: auth.currentIdentityType ?? 'personal',
    tenantId: auth.currentTenantId ?? null,
  };
}

/** 协作者只读及以上权限 EXISTS 子查询 */
export function buildCollaboratorReadExistsSql(alias = 'd'): string {
  return `EXISTS (
    SELECT 1 FROM doc_share_user su
    WHERE su.doc_id = ${alias}.id
      AND su.subject_type = 'user'
      AND su.subject_id = :collabUserId
      AND su.permission_level IN ('read', 'comment', 'edit', 'manage')
      AND (su.expire_time IS NULL OR su.expire_time > NOW())
  )`;
}

/** 协作者可编辑及以上权限 EXISTS 子查询 */
export function buildCollaboratorWriteExistsSql(alias = 'd'): string {
  return `EXISTS (
    SELECT 1 FROM doc_share_user su
    WHERE su.doc_id = ${alias}.id
      AND su.subject_type = 'user'
      AND su.subject_id = :collabUserId
      AND su.permission_level IN ('edit', 'manage')
      AND (su.expire_time IS NULL OR su.expire_time > NOW())
  )`;
}

export function applyDocumentReadAccessWithShare(
  qb: SelectQueryBuilder<DocumentEntity>,
  ctx: DocumentAccessContext,
  alias = 'd',
): void {
  const access = buildDocumentAccessClause(ctx, alias);
  qb.andWhere(
    `(${access.sql} OR ${buildCollaboratorReadExistsSql(alias)})`,
    { ...access.params, collabUserId: ctx.userId },
  );
}
