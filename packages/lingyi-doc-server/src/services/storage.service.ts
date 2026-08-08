import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DeployService } from '../config/deploy.service';
import { AppLoggerService } from '../common/logger/app-logger.service';
import { DocumentRepository } from '../repositories/document.repository';
import { DocumentShareRepository } from '../repositories/document-share.repository';
import { TenantRepository } from '../repositories/tenant.repository';
import type { DocumentListItem, DocumentMetaPatch, DocumentMetaResult, DocumentPermission, DocumentRecord, DocumentScope, DocumentViewMode, RecordHistoryListResult, RecordHistoryPayloadEntry } from '../types/database';
import type { DocumentAccessContext } from '../types/session';
import { documentAccessFromAuth } from '../utils/documentAccessContext';
import { buildDocumentRecordJson, wrapApiDataJson } from '../utils/documentRecordJson';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { DocumentPatchOp } from '../patch/applyDocumentPatch';

@Injectable()
export class StorageService implements OnModuleInit {
  private dbReady = false;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly deployService: DeployService,
    private readonly documentRepository: DocumentRepository,
    private readonly documentShareRepository: DocumentShareRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly logger: AppLoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.init();
  }

  async init(): Promise<void> {
    try {
      if (!this.dataSource.isInitialized) {
        await this.dataSource.initialize();
      }
      await this.dataSource.query('SELECT 1');
      this.dbReady = true;
      if (this.deployService.isPrivate()) {
        await this.tenantRepository.ensureDefaultPrivateTenant();
      }
      this.logger.log('Database connected', StorageService.name);
    } catch {
      this.dbReady = false;
      this.logger.error('Database connection failed — document APIs will return errors', undefined, StorageService.name);
    }
  }

  isReady(): boolean {
    return this.dbReady;
  }

  accessFromAuth(auth: AuthUser): DocumentAccessContext {
    return documentAccessFromAuth(auth);
  }

  /**
   * 保存文档
   * @param docId 文档ID
   * @param data 文档数据
   * @param ctx 文档访问上下文
   * @returns 文档版本号
   */
  async saveDocument(
    docId: string,
    data: DocumentRecord | Record<string, unknown>,
    ctx: DocumentAccessContext,
  ): Promise<{ version: number }> {
    this.ensureReady();
    const raw = data as Record<string, unknown>;
    const patch = {
      title: raw.title as string | undefined,
      docType: (raw.docType ?? raw.doc_type) as string | undefined,
      data: raw.data,
      recordHistory: raw.recordHistory as RecordHistoryPayloadEntry[] | undefined,
    };
    const saved = await this.documentRepository.save(docId, patch, ctx);
    if (!saved) {
      throw new Error(`Document not found: ${docId}`);
    }
    return { version: saved.version };
  }

  /**
   * 应用文档补丁
   * @param docId 文档ID
   * @param input 补丁输入
   * @param ctx 文档访问上下文
   * @returns 补丁结果
   */
  async patchDocument(
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
  > {
    this.ensureReady();
    const result = await this.documentRepository.applyPatch(docId, input, ctx);
    if (!result) throw new Error(`Document not found: ${docId}`);
    return result;
  }

  /**
   * 更新文档元数据
   * @param docId 文档ID
   * @param patch 元数据补丁
   * @param ctx 文档访问上下文
   * @returns 更新后的元数据
   */
  async updateDocumentMeta(
    docId: string,
    patch: DocumentMetaPatch,
    ctx: DocumentAccessContext,
  ): Promise<DocumentMetaResult> {
    this.ensureReady();
    const result = await this.documentRepository.updateMeta(docId, patch, ctx);
    if (!result) throw new Error(`Document not found: ${docId}`);
    return result;
  }

  /**
   * 解析文档访问权限
   * @param docId 文档ID
   * @param ctx 文档访问上下文
   * @returns 文档访问权限
   */
  async resolveDocumentAccess(
    docId: string,
    ctx: DocumentAccessContext,
  ): Promise<{ permission: DocumentPermission; canEdit: boolean; viewMode: DocumentViewMode } | null> {
    this.ensureReady();
    const readable = await this.documentRepository.hasReadAccess(docId, ctx);
    if (!readable) return null;

    const [canEdit, owned, sharePermission] = await Promise.all([
      this.documentRepository.hasWriteAccess(docId, ctx),
      this.documentRepository.isOwnedByUser(docId, ctx),
      this.documentShareRepository.getCollaboratorPermission(docId, ctx.userId),
    ]);

    if (canEdit) {
      return {
        permission: owned ? 'owner' : (sharePermission ?? 'edit'),
        canEdit: true,
        viewMode: 'edit',
      };
    }

    return {
      permission: sharePermission ?? 'read',
      canEdit: false,
      viewMode: 'preview',
    };
  }

  async loadDocumentForUser(docId: string, ctx: DocumentAccessContext): Promise<DocumentRecord | null> {
    this.ensureReady();
    const access = await this.resolveDocumentAccess(docId, ctx);
    if (!access) return null;
    const doc = await this.documentRepository.findAccessibleById(docId, ctx);
    if (!doc) return null;
    return { ...doc, ...access };
  }

  /**
   * 加载文档并返回已包装的 API JSON 字符串（data 字段直出 DB JSON，不经 parse/stringify）。
   */
  async loadDocumentWrappedJson(docId: string, ctx: DocumentAccessContext): Promise<string | null> {
    this.ensureReady();
    const access = await this.resolveDocumentAccess(docId, ctx);
    if (!access) return null;
    const row = await this.documentRepository.findMetaAndRawContent(docId);
    if (!row) return null;
    const dataJson = buildDocumentRecordJson({ ...row.meta, ...access }, row.contentJsonRaw);
    return wrapApiDataJson(dataJson);
  }

  /**
   * 列出所有文档
   * @param sortBy 排序字段
   * @param ctx 文档访问上下文
   * @returns 文档列表
   */
  async listDocuments(
    sortBy: 'lastVisited' | 'created' | 'updated' | undefined,
    ctx: DocumentAccessContext,
  ): Promise<DocumentListItem[]> {
    this.ensureReady();
    return this.documentRepository.listLibrary(sortBy ?? 'lastVisited', ctx);
  }

  /**
   * 列出库文档
   * @param sortBy 排序字段
   * @param ctx 文档访问上下文
   * @returns 文档列表
   */
  async listLibraryDocuments(
    sortBy: 'lastVisited' | 'created' | 'updated' | undefined,
    ctx: DocumentAccessContext,
  ): Promise<DocumentListItem[]> {
    this.ensureReady();
    return this.documentRepository.listLibrary(sortBy ?? 'lastVisited', ctx);
  }

  /**
   * 列出用户拥有的文档
   * @param sortBy 排序字段
   * @param ctx 文档访问上下文
   * @returns 文档列表
   */
  async listOwnedDocuments(
    sortBy: 'lastVisited' | 'created' | 'updated' | undefined,
    ctx: DocumentAccessContext,
  ): Promise<DocumentListItem[]> {
    this.ensureReady();
    return this.documentRepository.listOwned(sortBy ?? 'lastVisited', ctx);
  }

  /**
   * 列出最近访问的文档
   * @param sortBy 排序字段
   * @param ctx 文档访问上下文
   * @param days 最近访问天数
   * @returns 文档列表
   */
  async listRecentDocuments(
    sortBy: 'lastVisited' | 'created' | 'updated' | undefined,
    ctx: DocumentAccessContext,
    days = 30,
  ): Promise<DocumentListItem[]> {
    this.ensureReady();
    return this.documentRepository.listRecent(sortBy ?? 'lastVisited', ctx, days);
  }

  /**
   * 分页读取某条多维表记录的行级变更历史（读权限校验后）。
   */
  async listRecordHistory(
    docId: string,
    recordId: string,
    opts: { page?: number; pageSize?: number },
    ctx: DocumentAccessContext,
  ): Promise<RecordHistoryListResult | null> {
    this.ensureReady();
    if (!(await this.documentRepository.hasReadAccess(docId, ctx))) return null;
    return this.documentRepository.listRecordHistory(docId, recordId, opts);
  }

  /**
   * 更新文档最后访问时间
   * @param docId 文档ID
   * @param ctx 文档访问上下文
   */
  async touchLastVisited(docId: string, ctx: DocumentAccessContext): Promise<void> {
    this.ensureReady();
    await this.documentRepository.touchLastVisited(docId, ctx);
  }

  /** 已校验权限后直接更新 last_visited（跳过重复 EXISTS） */
  async touchLastVisitedUnchecked(docId: string, userId: string): Promise<void> {
    this.ensureReady();
    await this.documentRepository.touchLastVisitedUnchecked(docId, userId);
  }

  /**
   * 检查文档标题是否存在已存在
   * @param title 文档标题
   * @param excludeDocId 排除的文档ID（可选）
   * @param ctx 文档访问上下文
   * @returns 是否已存在
   */
  async existsDocumentTitle(
    title: string,
    excludeDocId: string | undefined,
    ctx: DocumentAccessContext,
  ): Promise<boolean> {
    this.ensureReady();
    return this.documentRepository.existsActiveTitle(title, ctx, excludeDocId);
  }

  /**
   * 创建文档
   * @param input 文档创建输入
   * @param input.id 文档ID
   * @param input.title 文档标题
   * @param input.docType 文档类型（可选）
   * @param input.data 文档数据（可选）
   * @param input.ownerId 文档所有者ID
   * @param input.scope 文档作用域（可选）
   * @param input.tenantId 租户ID（可选）
   * @param input.orgId 组织ID（可选）
   * @returns 创建的文档记录
   */
  async createDocument(input: {
    id: string;
    title: string;
    docType?: string;
    data?: unknown;
    ownerId: string;
    scope?: DocumentScope;
    tenantId?: string | null;
    orgId?: string | null;
  }): Promise<DocumentRecord> {
    this.ensureReady();
    return this.documentRepository.create(input);
  }

  async deleteDocument(docId: string, ctx: DocumentAccessContext): Promise<boolean> {
    this.ensureReady();
    return this.documentRepository.softDelete(docId, ctx);
  }

  async deleteDocuments(docIds: string[], ctx: DocumentAccessContext): Promise<number> {
    this.ensureReady();
    return this.documentRepository.softDeleteByIds(docIds, ctx);
  }

  async listRecycleBin(ctx: DocumentAccessContext) {
    this.ensureReady();
    return this.documentRepository.listDeleted(ctx);
  }

  async restoreDocument(docId: string, ctx: DocumentAccessContext): Promise<boolean> {
    this.ensureReady();
    return this.documentRepository.restore(docId, ctx);
  }

  async permanentDeleteDocument(docId: string, ctx: DocumentAccessContext): Promise<boolean> {
    this.ensureReady();
    return this.documentRepository.permanentDelete(docId, ctx);
  }

  async listTenantDocuments(tenantId: string): Promise<DocumentListItem[]> {
    this.ensureReady();
    return this.documentRepository.listByTenant(tenantId);
  }

  async countDocuments(): Promise<number> {
    this.ensureReady();
    return this.documentRepository.count();
  }

  async countDocumentsByOwner(ownerId: string): Promise<number> {
    this.ensureReady();
    return this.documentRepository.countByOwner(ownerId);
  }

  private ensureReady(): void {
    if (!this.dbReady) {
      throw new Error('Database not connected');
    }
  }
}
