import { Inject, Injectable } from '@nestjs/common';
import {
  formatDocumentContextForPrompt,
  type DocumentContextPayload,
} from './document-context.util';
import {
  DOCUMENT_CONTENT_PORT,
  type DocumentContentPort,
} from '../../../ports';

@Injectable()
export class DocumentContextService {
  constructor(
    @Inject(DOCUMENT_CONTENT_PORT)
    private readonly documentContent: DocumentContentPort,
  ) {}

  async load(documentId: string): Promise<DocumentContextPayload | null> {
    return this.documentContent.load(documentId);
  }

  formatForPrompt(ctx: DocumentContextPayload): string {
    return formatDocumentContextForPrompt(ctx);
  }

  async read(documentId: string) {
    return this.documentContent.read(documentId);
  }

  async write(
    documentId: string,
    content: string,
    mode: 'append' | 'replace' = 'append',
  ) {
    return this.documentContent.write(documentId, content, mode);
  }
}
