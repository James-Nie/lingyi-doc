import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentEntity } from '../../database/entities/document.entity';
import { DocumentContentEntity } from '../../database/entities/document-content.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { TenantEntity } from '../../database/entities/tenant.entity';
import { KnowledgeBaseEntity, KbNodeEntity } from '../../database/entities/knowledge-base.entity';
import { DocShareEntity } from '../../database/entities/document-share.entity';
import { BaseRecordEntity, BaseTableEntity } from '../../database/entities/base.entity';
import { SearchRequestDto, SearchResultItem } from './search.dto';
import type { DocumentAccessContext } from '../../types/session';
import { applyDocumentReadAccessWithShare } from '../../utils/documentAccessContext';

function toTimestamp(value: Date | string | number | null | undefined): number | null {
  if (!value) return null;
  if (typeof value === 'number') return value;
  const d = typeof value === 'string' ? new Date(value) : value;
  const ts = d.getTime();
  return isNaN(ts) ? null : ts;
}

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documentRepo: Repository<DocumentEntity>,
    @InjectRepository(DocumentContentEntity)
    private readonly contentRepo: Repository<DocumentContentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(DocShareEntity)
    private readonly shareRepo: Repository<DocShareEntity>,
    @InjectRepository(BaseRecordEntity)
    private readonly baseRecordRepo: Repository<BaseRecordEntity>,
    @InjectRepository(BaseTableEntity)
    private readonly baseTableRepo: Repository<BaseTableEntity>,
  ) {}

  async search(
    request: SearchRequestDto,
    ctx: DocumentAccessContext,
  ): Promise<{ results: SearchResultItem[]; hasMore: boolean }> {
    const { q, limit = 20 } = request;
    if (!q.trim()) {
      return { results: [], hasMore: false };
    }

    const keyword = q.trim();
    const halfLimit = Math.ceil(limit / 2);
    const maxResults = halfLimit + 1;

    const [docResults, baseResults] = await Promise.all([
      this.searchDocuments(keyword, maxResults, request, ctx),
      this.searchBaseRecords(keyword, maxResults, ctx),
    ]);

    const merged: SearchResultItem[] = [];
    let docIndex = 0;
    let baseIndex = 0;

    // 交错合并：文档结果和 Base 记录结果各取一半，保持多样性
    while (merged.length < limit && (docIndex < docResults.length || baseIndex < baseResults.length)) {
      if (docIndex < docResults.length) {
        merged.push(docResults[docIndex++]);
      }
      if (merged.length >= limit) break;
      if (baseIndex < baseResults.length) {
        merged.push(baseResults[baseIndex++]);
      }
    }

    const hasMore = docResults.length > halfLimit || baseResults.length > halfLimit;

    return {
      results: merged,
      hasMore,
    };
  }

  private async searchDocuments(
    keyword: string,
    maxResults: number,
    request: SearchRequestDto,
    ctx: DocumentAccessContext,
  ): Promise<SearchResultItem[]> {
    const qb = this.documentRepo
      .createQueryBuilder('d')
      .leftJoin(DocumentContentEntity, 'dc', 'dc.doc_id = d.id')
      .leftJoin(UserEntity, 'u', 'd.owner_id = u.id')
      .leftJoin(TenantEntity, 't', 'd.tenant_id = t.id')
      .leftJoin(KbNodeEntity, 'kn', 'kn.doc_id = d.id AND kn.is_deleted = false')
      .leftJoin(KnowledgeBaseEntity, 'kb', 'kb.id = kn.kb_id AND kb.is_deleted = false')
      .select([])
      .addSelect('d.id', 'docId')
      .addSelect('d.title', 'title')
      .addSelect('d.doc_type', 'docType')
      .addSelect('dc.storage_size', 'storageSize')
      .addSelect('dc.updated_at', 'updatedAt')
      .addSelect('d.last_visited_at', 'lastVisitedAt')
      .addSelect('d.doc_slug', 'docSlug')
      .addSelect('d.scope', 'scope')
      .addSelect('d.owner_id', 'ownerId')
      .addSelect('d.tenant_id', 'tenantId')
      .addSelect('dc.content_json', 'contentJson')
      .addSelect('u.display_name', 'ownerDisplayName')
      .addSelect('u.personal_space_slug', 'personalSpaceSlug')
      .addSelect('u.default_book_slug', 'userBookSlug')
      .addSelect('t.space_slug', 'tenantSpaceSlug')
      .addSelect('t.default_book_slug', 'tenantBookSlug')
      .addSelect('kb.kb_slug', 'kbSlug')
      .where('d.is_deleted = false');

    applyDocumentReadAccessWithShare(qb, ctx, 'd');

    // 使用全文检索查询（PostgreSQL tsquery）
    const tsQuery = `to_tsquery('zhsimple', :keyword)`;
    qb.andWhere(
      `(d.title_vector @@ ${tsQuery} OR dc.content_vector @@ ${tsQuery})`,
      { keyword: `${keyword}:*` },
    );

    if (request.docTypes && request.docTypes.length > 0) {
      qb.andWhere('d.doc_type IN (:...docTypes)', { docTypes: request.docTypes });
    }

    // 按匹配度排序：标题匹配优先，然后按更新时间排序
    qb.addSelect(`ts_rank(d.title_vector, ${tsQuery})`, 'title_rank')
      .addSelect(`ts_rank(dc.content_vector, ${tsQuery})`, 'content_rank')
      .orderBy('title_rank', 'DESC')
      .addOrderBy('content_rank', 'DESC')
      .addOrderBy('dc.updated_at', 'DESC')
      .limit(maxResults);

    const rawResults = await qb.getRawMany<Record<string, unknown>>();

    return Promise.all(
      rawResults.slice(0, maxResults - 1).map(async (row) => {
        const docId = row.docId as string;
        const contentJson = row.contentJson;
        const snippet = this.extractSnippet(contentJson, keyword);
        const location = await this.resolveLocation(docId, row.scope as number, ctx);
        const path = this.resolvePathFromRaw(row);

        return {
          docId,
          title: row.title as string,
          docType: row.docType as string,
          snippet,
          location,
          ownerName: (row.ownerDisplayName ?? '未知') as string,
          updatedAt: toTimestamp(row.updatedAt as Date) ?? Date.now(),
          lastVisitedAt: toTimestamp(row.lastVisitedAt as Date) ?? undefined,
          docSlug: row.docSlug as string | undefined,
          spaceSlug: path.spaceSlug,
          bookSlug: path.bookSlug,
        };
      }),
    );
  }

  private async searchBaseRecords(
    keyword: string,
    maxResults: number,
    ctx: DocumentAccessContext,
  ): Promise<SearchResultItem[]> {
    // 1. 获取用户有权限访问的 base 文档 ID 列表
    const accessibleDocIds = await this.getAccessibleBaseDocIds(ctx);
    if (accessibleDocIds.length === 0) {
      return [];
    }

    // 2. 找到这些文档关联的 table
    const tables = await this.baseTableRepo.find({
      where: accessibleDocIds.map(docId => ({ docId })),
      select: ['id', 'docId', 'name'],
    });
    if (tables.length === 0) {
      return [];
    }

    const tableMap = new Map(tables.map(t => [t.id, t]));
    const tableIds = tables.map(t => t.id);

    // 3. 在 base_records 中搜索 field_values 包含关键词的记录
    const tsQuery = `to_tsquery('zhsimple', :keyword)`;
    const recordQb = this.baseRecordRepo
      .createQueryBuilder('br')
      .where('br.table_id IN (:...tableIds)', { tableIds })
      .andWhere('br.deleted_at IS NULL')
      .andWhere(
        `to_tsvector('zhsimple', COALESCE(br.field_values::text, '')) @@ ${tsQuery}`,
        { keyword: `${keyword}:*` },
      )
      .addSelect(`ts_rank(to_tsvector('zhsimple', COALESCE(br.field_values::text, '')), ${tsQuery})`, 'rank')
      .orderBy('rank', 'DESC')
      .addOrderBy('br.updated_at', 'DESC')
      .limit(maxResults);

    const rawRecords = await recordQb.getRawMany<Record<string, unknown>>();

    // 4. 批量获取文档信息、所有者信息和路径信息
    const docIds = [...new Set(tables.map(t => t.docId))];
    const docRows = await this.documentRepo
      .createQueryBuilder('d')
      .leftJoin(UserEntity, 'u', 'd.owner_id = u.id')
      .leftJoin(TenantEntity, 't', 'd.tenant_id = t.id')
      .leftJoin(KbNodeEntity, 'kn', 'kn.doc_id = d.id AND kn.is_deleted = false')
      .leftJoin(KnowledgeBaseEntity, 'kb', 'kb.id = kn.kb_id AND kb.is_deleted = false')
      .where('d.id IN (:...docIds)', { docIds })
      .select([])
      .addSelect('d.id', 'docId')
      .addSelect('d.title', 'title')
      .addSelect('d.doc_type', 'docType')
      .addSelect('d.scope', 'scope')
      .addSelect('d.owner_id', 'ownerId')
      .addSelect('d.tenant_id', 'tenantId')
      .addSelect('d.last_visited_at', 'lastVisitedAt')
      .addSelect('d.doc_slug', 'docSlug')
      .addSelect('u.display_name', 'ownerDisplayName')
      .addSelect('u.personal_space_slug', 'personalSpaceSlug')
      .addSelect('u.default_book_slug', 'userBookSlug')
      .addSelect('t.space_slug', 'tenantSpaceSlug')
      .addSelect('t.default_book_slug', 'tenantBookSlug')
      .addSelect('kb.kb_slug', 'kbSlug')
      .getRawMany<Record<string, unknown>>();

    const docMap = new Map(docRows.map(row => {
      const id = row.docId as string;
      return [id, {
        id,
        title: row.title as string,
        docType: row.docType as string,
        scope: row.scope as number,
        ownerId: row.ownerId as string | null,
        tenantId: row.tenantId as string | null,
        lastVisitedAt: row.lastVisitedAt as Date | null,
        docSlug: row.docSlug as string | null,
        ownerName: row.ownerDisplayName as string | undefined,
        ...this.resolvePathFromRaw(row),
      }];
    }));

    return rawRecords.slice(0, maxResults - 1).map((row) => {
      const recordId = row.br_id as string;
      const tableId = row.br_table_id as string;
      const table = tableMap.get(tableId);
      const doc = table ? docMap.get(table.docId) : undefined;
      const fieldValues = row.br_field_values ?? row.br_fieldValues;
      const snippet = this.extractSnippet(fieldValues, keyword);

      return {
        docId: doc?.id ?? table?.docId ?? '',
        title: doc?.title ?? table?.name ?? '未命名多维表格',
        docType: doc?.docType ?? 'base',
        snippet: snippet || '多维表格记录匹配',
        location: doc ? this.resolveLocationSync(doc.scope) : '我的文档库',
        ownerName: doc?.ownerId ? (doc.ownerName ?? '未知') : '未知',
        updatedAt: toTimestamp((row.br_updated_at ?? row.br_updatedAt) as Date) ?? Date.now(),
        lastVisitedAt: toTimestamp(doc?.lastVisitedAt) ?? undefined,
        docSlug: doc?.docSlug ?? undefined,
        spaceSlug: doc?.spaceSlug,
        bookSlug: doc?.bookSlug,
        recordId,
      };
    });
  }

  private resolvePathFromRaw(row: Record<string, unknown>): { spaceSlug?: string; bookSlug?: string } {
    const scope = row.scope as number;
    const tenantId = row.tenantId as string | null;
    const ownerId = row.ownerId as string | null;
    const kbSlug = row.kbSlug as string | null | undefined;
    const personalSpaceSlug = row.personalSpaceSlug as string | null | undefined;
    const userBookSlug = row.userBookSlug as string | null | undefined;
    const tenantSpaceSlug = row.tenantSpaceSlug as string | null | undefined;
    const tenantBookSlug = row.tenantBookSlug as string | null | undefined;

    if (scope === 2 && tenantId) {
      return {
        spaceSlug: tenantSpaceSlug ?? undefined,
        bookSlug: kbSlug ?? tenantBookSlug ?? undefined,
      };
    }
    if (ownerId) {
      return {
        spaceSlug: personalSpaceSlug ?? undefined,
        bookSlug: kbSlug ?? userBookSlug ?? undefined,
      };
    }
    return {};
  }

  private async getAccessibleBaseDocIds(ctx: DocumentAccessContext): Promise<string[]> {
    const qb = this.documentRepo
      .createQueryBuilder('d')
      .select('d.id')
      .where('d.is_deleted = false')
      .andWhere('d.doc_type = :docType', { docType: 'base' });

    applyDocumentReadAccessWithShare(qb, ctx, 'd');

    const rows = await qb.getRawMany<{ d_id: string }>();
    return rows.map(r => r.d_id);
  }

  private resolveLocationSync(scope: number): string {
    if (scope === 2) {
      return '企业知识库';
    }
    return '我的文档库';
  }

  private async resolveLocation(
    docId: string,
    scope: number,
    ctx: DocumentAccessContext,
  ): Promise<string> {
    if (scope === 2) {
      return '企业知识库';
    }
    return '我的文档库';
  }

  private extractSnippet(content: unknown, keyword: string): string {
    if (!content) return '';

    let text: string;
    if (typeof content === 'string') {
      text = content;
    } else {
      try {
        text = JSON.stringify(content);
      } catch {
        return '';
      }
    }

    const plainText = text
      .replace(/<[^>]*>/g, '')
      .replace(/&[^;]+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const index = plainText.toLowerCase().indexOf(keyword.toLowerCase());
    if (index === -1) {
      return plainText.slice(0, 150) + (plainText.length > 150 ? '...' : '');
    }

    const start = Math.max(0, index - 70);
    const end = Math.min(plainText.length, index + keyword.length + 70);

    let snippet = plainText.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < plainText.length) snippet = snippet + '...';

    const regex = new RegExp(`(${keyword})`, 'gi');
    return snippet.replace(regex, '<mark>$1</mark>');
  }
}
