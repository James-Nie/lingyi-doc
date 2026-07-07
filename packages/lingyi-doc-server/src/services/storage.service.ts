import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DeployService } from '../config/deploy.service';
import { AppLoggerService } from '../common/logger/app-logger.service';
import { DocumentRepository } from '../repositories/document.repository';
import { DocumentShareRepository } from '../repositories/document-share.repository';
import { TenantRepository } from '../repositories/tenant.repository';
import type { DocumentListItem, DocumentPermission, DocumentRecord, DocumentScope, DocumentViewMode } from '../types/database';
import type { DocumentAccessContext } from '../types/session';
import { documentAccessFromAuth } from '../utils/documentAccessContext';
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
      this.logger.log('MySQL connected', StorageService.name);
    } catch {
      this.dbReady = false;
      this.logger.error('MySQL connection failed — document APIs will return errors', undefined, StorageService.name);
    }
  }

  isReady(): boolean {
    return this.dbReady;
  }

  accessFromAuth(auth: AuthUser): DocumentAccessContext {
    return documentAccessFromAuth(auth);
  }

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
    };
    const saved = await this.documentRepository.save(docId, patch, ctx);
    if (!saved) {
      throw new Error(`Document not found: ${docId}`);
    }
    return { version: saved.version };
  }

  async patchDocument(
    docId: string,
    input: { baseVersion: number; title?: string; ops: DocumentPatchOp[] },
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

  async resolveDocumentAccess(
    docId: string,
    ctx: DocumentAccessContext,
  ): Promise<{ permission: DocumentPermission; canEdit: boolean; viewMode: DocumentViewMode } | null> {
    this.ensureReady();
    const doc = await this.documentRepository.findAccessibleById(docId, ctx);
    if (!doc) return null;

    const canEdit = await this.documentRepository.hasWriteAccess(docId, ctx);
    const owned = await this.documentRepository.findOwnedById(docId, ctx);
    const sharePermission = await this.documentShareRepository.getCollaboratorPermission(docId, ctx.userId);

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
    const doc = await this.documentRepository.findAccessibleById(docId, ctx);
    if (!doc) return null;
    const access = await this.resolveDocumentAccess(docId, ctx);
    if (!access) return null;
    return { ...doc, ...access };
  }

  async listDocuments(
    sortBy: 'lastVisited' | 'created' | 'updated' | undefined,
    ctx: DocumentAccessContext,
  ): Promise<DocumentListItem[]> {
    this.ensureReady();
    return this.documentRepository.list(sortBy, ctx);
  }

  async touchLastVisited(docId: string, ctx: DocumentAccessContext): Promise<void> {
    this.ensureReady();
    await this.documentRepository.touchLastVisited(docId, ctx);
  }

  async existsDocumentTitle(
    title: string,
    excludeDocId: string | undefined,
    ctx: DocumentAccessContext,
  ): Promise<boolean> {
    this.ensureReady();
    return this.documentRepository.existsActiveTitle(title, ctx, excludeDocId);
  }

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
