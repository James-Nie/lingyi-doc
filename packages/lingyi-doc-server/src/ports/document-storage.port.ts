import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { DocumentAccessContext } from '../types/session';
import type { DocumentRecord } from '../types/database';

/** MCP 文档 Tool 所需的 Storage 能力面 */
export interface DocumentStoragePort {
  accessFromAuth(auth: AuthUser): DocumentAccessContext;
  listOwnedDocuments(
    sort: 'lastVisited' | 'created' | 'updated',
    ctx: DocumentAccessContext,
  ): Promise<unknown[]>;
  loadDocumentForUser(
    docId: string,
    ctx: DocumentAccessContext,
  ): Promise<DocumentRecord | null>;
  createDocument(input: {
    id: string;
    title: string;
    docType?: string;
    data?: unknown;
    ownerId: string;
    scope?: number;
    tenantId?: string | null;
    orgId?: string | null;
  }): Promise<DocumentRecord>;
  saveDocument(
    docId: string,
    body: unknown,
    ctx: DocumentAccessContext,
  ): Promise<{ version: number }>;
  deleteDocument(docId: string, ctx: DocumentAccessContext): Promise<boolean>;
  restoreDocument(docId: string, ctx: DocumentAccessContext): Promise<boolean>;
  permanentDeleteDocument(docId: string, ctx: DocumentAccessContext): Promise<boolean>;
}
