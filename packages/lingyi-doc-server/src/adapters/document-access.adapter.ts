import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { DocumentRepository } from '../repositories/document.repository';
import { documentAccessFromAuth } from '../utils/documentAccessContext';
import type { DocumentAccessPort, DocumentAccessResult } from '../ports/document-access.port';

@Injectable()
export class DocumentAccessAdapter implements DocumentAccessPort {
  constructor(private readonly documentRepo: DocumentRepository) {}

  async checkAccess(docId: string, auth: AuthUser): Promise<DocumentAccessResult> {
    const ctx = documentAccessFromAuth(auth);
    const doc = await this.documentRepo.findAccessibleById(docId, ctx);
    if (!doc) {
      return { canRead: false, canWrite: false, docVersion: 0 };
    }
    const canWrite = await this.documentRepo.hasWriteAccess(docId, ctx);
    return { canRead: true, canWrite, docVersion: doc.version };
  }
}
