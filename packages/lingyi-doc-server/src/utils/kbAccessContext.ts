import type { SelectQueryBuilder, UpdateQueryBuilder } from 'typeorm';
import type { KnowledgeBaseEntity } from '../database/entities/knowledge-base.entity';
import type { DocumentAccessContext } from '../types/session';
import { buildDocumentAccessClause } from './documentAccessContext';

/** 构建知识库列表/访问 SQL 条件（个人 vs 企业，与 documents 同构） */
export function buildKbAccessClause(
  ctx: DocumentAccessContext,
  alias = 'kb',
): { sql: string; params: Record<string, string | number> } {
  return buildDocumentAccessClause(ctx, alias);
}

export function applyKbAccessToSelectQueryBuilder(
  qb: SelectQueryBuilder<KnowledgeBaseEntity>,
  ctx: DocumentAccessContext,
  alias = 'kb',
): void {
  const access = buildKbAccessClause(ctx, alias);
  qb.andWhere(access.sql, access.params);
}

export function applyKbAccessToUpdateQueryBuilder(
  qb: UpdateQueryBuilder<KnowledgeBaseEntity>,
  ctx: DocumentAccessContext,
): void {
  // UPDATE 无表别名，不可使用 kb.scope；与 documents 的 update helper 保持一致
  const access = buildKbAccessClause(ctx, '');
  qb.andWhere(access.sql, access.params);
}

export function resolveKbScope(ctx: DocumentAccessContext): 1 | 2 {
  if (ctx.identityType === 'tenant' && ctx.tenantId) return 2;
  return 1;
}
