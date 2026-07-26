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
      AND (su.expire_time IS NULL OR su.expire_time > UTC_TIMESTAMP())
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
      AND (su.expire_time IS NULL OR su.expire_time > UTC_TIMESTAMP())
  )`;
}

/**
 * 通过知识库节点挂载获得文档读权限：
 * KB 所有者 / 创建者 / kb_members 任意角色
 */
export function buildKbMemberReadExistsSql(alias = 'd'): string {
  return `EXISTS (
    SELECT 1 FROM kb_nodes kn
    INNER JOIN knowledge_bases kb ON kb.id = kn.kb_id AND kb.is_deleted = 0
    WHERE kn.doc_id = ${alias}.id
      AND kn.is_deleted = 0
      AND (
        (kb.scope = 1 AND kb.owner_id = :kbAccessUserId)
        OR kb.created_by = :kbAccessUserId
        OR EXISTS (
          SELECT 1 FROM kb_members km
          WHERE km.kb_id = kb.id AND km.user_id = :kbAccessUserId
        )
      )
  )`;
}

/**
 * 通过知识库节点挂载获得文档写权限：
 * KB 所有者 / 创建者 / kb_members 的 owner|admin|editor
 */
export function buildKbMemberWriteExistsSql(alias = 'd'): string {
  return `EXISTS (
    SELECT 1 FROM kb_nodes kn
    INNER JOIN knowledge_bases kb ON kb.id = kn.kb_id AND kb.is_deleted = 0
    WHERE kn.doc_id = ${alias}.id
      AND kn.is_deleted = 0
      AND (
        (kb.scope = 1 AND kb.owner_id = :kbAccessUserId)
        OR kb.created_by = :kbAccessUserId
        OR EXISTS (
          SELECT 1 FROM kb_members km
          WHERE km.kb_id = kb.id
            AND km.user_id = :kbAccessUserId
            AND km.role IN ('owner', 'admin', 'editor')
        )
      )
  )`;
}

export function applyDocumentReadAccessWithShare(
  qb: SelectQueryBuilder<DocumentEntity>,
  ctx: DocumentAccessContext,
  alias = 'd',
): void {
  const access = buildDocumentAccessClause(ctx, alias);
  qb.andWhere(
    `(${access.sql} OR ${buildCollaboratorReadExistsSql(alias)} OR ${buildKbMemberReadExistsSql(alias)})`,
    { ...access.params, collabUserId: ctx.userId, kbAccessUserId: ctx.userId },
  );
}

/** 文档挂在「仅成员可见」知识库下时，租户宽写权限不能绕过 KB 角色 */
export function buildKbMembersOnlyDocExistsSql(alias = 'd'): string {
  return `EXISTS (
    SELECT 1 FROM kb_nodes kn
    INNER JOIN knowledge_bases kb ON kb.id = kn.kb_id AND kb.is_deleted = 0
    WHERE kn.doc_id = ${alias}.id
      AND kn.is_deleted = 0
      AND kb.visibility = 'members'
  )`;
}

export function applyDocumentWriteAccessWithShare(
  qb: SelectQueryBuilder<DocumentEntity>,
  ctx: DocumentAccessContext,
  alias = 'd',
): void {
  const access = buildDocumentAccessClause(ctx, alias);
  // 成员制知识库内的文档：必须具备 KB 编辑角色或文档协作者写权限，避免「同租户即可改」
  qb.andWhere(
    `((${access.sql} AND NOT ${buildKbMembersOnlyDocExistsSql(alias)})`
      + ` OR ${buildCollaboratorWriteExistsSql(alias)}`
      + ` OR ${buildKbMemberWriteExistsSql(alias)})`,
    { ...access.params, collabUserId: ctx.userId, kbAccessUserId: ctx.userId },
  );
}
