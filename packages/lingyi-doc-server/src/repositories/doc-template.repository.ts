import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocTemplateEntity } from '../database/entities/doc-template.entity';
import type {
  DocTemplateCreateInput,
  DocTemplateDetail,
  DocTemplateListQuery,
  DocTemplateSummary,
  DocTemplateUpdateInput,
  TemplateDocType,
  TemplateStatus,
} from '../types/template';

const VALID_DOC_TYPES = new Set<string>(['richtext', 'freeform', 'base', 'questionnaire', 'mindnote', 'slides', 'whiteboard']);
const VALID_STATUSES = new Set<string>(['draft', 'published', 'archived']);
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]?$/;

function toTimestamp(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function parseCategories(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function entityToSummary(
  entity: DocTemplateEntity,
  opts?: { includeContent?: boolean; hasContent?: boolean },
): DocTemplateSummary {
  const hasContent = opts?.hasContent
    ?? (opts?.includeContent
      ? entity.contentJson != null
      : entity.contentJson != null || entity.isBlank === 1);

  return {
    id: entity.id,
    title: entity.title,
    subtitle: entity.subtitle,
    docType: entity.docType as TemplateDocType,
    documentTitle: entity.documentTitle,
    categories: parseCategories(entity.categories),
    usageLabel: entity.usageLabel,
    isNew: entity.isNew === 1,
    isBlank: entity.isBlank === 1,
    status: entity.status as TemplateStatus,
    sortOrder: entity.sortOrder,
    useCount: entity.useCount,
    hasContent,
    createdAt: toTimestamp(entity.createdAt) ?? 0,
    updatedAt: toTimestamp(entity.updatedAt) ?? 0,
    publishedAt: toTimestamp(entity.publishedAt),
  };
}

function entityToDetail(entity: DocTemplateEntity): DocTemplateDetail {
  return {
    ...entityToSummary(entity, { includeContent: true }),
    contentJson: entity.contentJson,
    createdBy: entity.createdBy,
    updatedBy: entity.updatedBy,
  };
}

const LIST_SUMMARY_SELECT = [
  't.id',
  't.title',
  't.subtitle',
  't.docType',
  't.documentTitle',
  't.categories',
  't.usageLabel',
  't.isNew',
  't.isBlank',
  't.status',
  't.sortOrder',
  't.useCount',
  't.publishedAt',
  't.createdAt',
  't.updatedAt',
] as const;

function parseHasContentFlag(raw: Record<string, unknown>): boolean {
  const value = raw.has_content ?? raw.hasContent;
  return value === 1 || value === '1' || value === true;
}

@Injectable()
export class DocTemplateRepository {
  constructor(
    @InjectRepository(DocTemplateEntity)
    private readonly repo: Repository<DocTemplateEntity>,
  ) {}

  validateId(id: string): boolean {
    return ID_PATTERN.test(id);
  }

  validateDocType(docType: string): docType is TemplateDocType {
    return VALID_DOC_TYPES.has(docType);
  }

  validateStatus(status: string): status is TemplateStatus {
    return VALID_STATUSES.has(status);
  }

  async findById(id: string, opts?: { includeDeleted?: boolean }): Promise<DocTemplateEntity | null> {
    const qb = this.repo.createQueryBuilder('t').where('t.id = :id', { id });
    if (!opts?.includeDeleted) qb.andWhere('t.is_deleted = 0');
    return qb.getOne();
  }

  async list(query: DocTemplateListQuery & { publishedOnly?: boolean }): Promise<{
    items: DocTemplateSummary[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const countQb = this.buildListQuery(query);
    const total = await countQb.getCount();

    // 阶段 1：仅 id + 排序字段分页，避免 filesort 携带 content_json / categories 等大列
    const idRows = await this.buildListQuery(query)
      .select(['t.id'])
      .orderBy('t.sort_order', 'DESC')
      .addOrderBy('t.updated_at', 'DESC')
      .skip(offset)
      .take(pageSize)
      .getMany();

    const ids = idRows.map(row => row.id);
    if (ids.length === 0) {
      return { items: [], total, page, pageSize };
    }

    // 阶段 2：按 id 批量取摘要（无 ORDER BY，仅当前页少量行）
    const dataQb = this.repo.createQueryBuilder('t')
      .select([...LIST_SUMMARY_SELECT])
      .where('t.id IN (:...ids)', { ids });

    if (query.includeContent) {
      dataQb.addSelect('t.contentJson');
      const rows = await dataQb.getMany();
      const rowMap = new Map(rows.map(row => [row.id, row]));
      return {
        items: ids
          .map(id => rowMap.get(id))
          .filter((row): row is DocTemplateEntity => row != null)
          .map(row => entityToSummary(row, { includeContent: true })),
        total,
        page,
        pageSize,
      };
    }

    dataQb.addSelect(
      'CASE WHEN t.content_json IS NOT NULL OR t.is_blank = 1 THEN 1 ELSE 0 END',
      'has_content',
    );

    const { entities, raw } = await dataQb.getRawAndEntities();
    const entityMap = new Map(entities.map((row, index) => [row.id, { row, raw: raw[index] ?? {} }]));

    return {
      items: ids
        .map(id => entityMap.get(id))
        .filter((entry): entry is { row: DocTemplateEntity; raw: Record<string, unknown> } => entry != null)
        .map(({ row, raw: rawRow }) => entityToSummary(row, {
          hasContent: parseHasContentFlag(rawRow),
        })),
      total,
      page,
      pageSize,
    };
  }

  private buildListQuery(query: DocTemplateListQuery & { publishedOnly?: boolean }) {
    const qb = this.repo.createQueryBuilder('t').where('t.is_deleted = 0');

    if (query.publishedOnly) {
      qb.andWhere('t.status = :published', { published: 'published' });
    } else if (query.status) {
      qb.andWhere('t.status = :status', { status: query.status });
    }

    if (query.docType) {
      qb.andWhere('t.doc_type = :docType', { docType: query.docType });
    }

    if (query.keyword?.trim()) {
      const kw = `%${query.keyword.trim()}%`;
      qb.andWhere('(t.title LIKE :kw OR t.subtitle LIKE :kw OR t.id LIKE :kw)', { kw });
    }

    if (query.category?.trim()) {
      qb.andWhere('JSON_CONTAINS(t.categories, :catJson)', {
        catJson: JSON.stringify(query.category.trim()),
      });
    }

    return qb;
  }

  async getDetail(id: string): Promise<DocTemplateDetail | null> {
    const entity = await this.findById(id);
    return entity ? entityToDetail(entity) : null;
  }

  async create(input: DocTemplateCreateInput, operatorId: string | null): Promise<DocTemplateDetail> {
    const entity = this.repo.create({
      id: input.id,
      title: input.title.trim(),
      subtitle: (input.subtitle ?? '').trim(),
      docType: input.docType,
      documentTitle: input.documentTitle.trim(),
      categories: input.categories ?? ['recommended'],
      usageLabel: input.usageLabel ?? null,
      isNew: input.isNew ? 1 : 0,
      isBlank: input.isBlank ? 1 : 0,
      contentJson: input.contentJson ?? null,
      status: input.status ?? 'draft',
      sortOrder: input.sortOrder ?? 0,
      useCount: 0,
      createdBy: operatorId,
      updatedBy: operatorId,
      publishedAt: input.status === 'published' ? new Date() : null,
      isDeleted: 0,
    });
    const saved = await this.repo.save(entity);
    return entityToDetail(saved);
  }

  async update(id: string, input: DocTemplateUpdateInput, operatorId: string | null): Promise<DocTemplateDetail | null> {
    const entity = await this.findById(id);
    if (!entity) return null;

    if (input.title !== undefined) entity.title = input.title.trim();
    if (input.subtitle !== undefined) entity.subtitle = input.subtitle.trim();
    if (input.docType !== undefined) entity.docType = input.docType;
    if (input.documentTitle !== undefined) entity.documentTitle = input.documentTitle.trim();
    if (input.categories !== undefined) entity.categories = input.categories;
    if (input.usageLabel !== undefined) entity.usageLabel = input.usageLabel;
    if (input.isNew !== undefined) entity.isNew = input.isNew ? 1 : 0;
    if (input.isBlank !== undefined) entity.isBlank = input.isBlank ? 1 : 0;
    if (input.contentJson !== undefined) entity.contentJson = input.contentJson;
    if (input.sortOrder !== undefined) entity.sortOrder = input.sortOrder;
    if (input.status !== undefined) {
      entity.status = input.status;
      if (input.status === 'published' && !entity.publishedAt) {
        entity.publishedAt = new Date();
      }
    }
    entity.updatedBy = operatorId;

    const saved = await this.repo.save(entity);
    return entityToDetail(saved);
  }

  async updateStatus(id: string, status: TemplateStatus, operatorId: string | null): Promise<DocTemplateDetail | null> {
    return this.update(id, { status }, operatorId);
  }

  async softDelete(id: string, operatorId: string | null): Promise<boolean> {
    const entity = await this.findById(id);
    if (!entity) return false;
    entity.isDeleted = 1;
    entity.deletedAt = new Date();
    entity.updatedBy = operatorId;
    await this.repo.save(entity);
    return true;
  }

  async incrementUseCount(id: string): Promise<boolean> {
    const result = await this.repo.increment(
      { id, isDeleted: 0, status: 'published' },
      'useCount',
      1,
    );
    return (result.affected ?? 0) > 0;
  }
}
