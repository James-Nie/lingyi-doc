import { Injectable } from '@nestjs/common';
import { DocumentRepository } from '../repositories/document.repository';
import {
  appendTextToDocumentData,
  buildDocumentContext,
  replaceDocumentContent,
  type DocumentContextPayload,
} from '../modules/ai/ai-agent/document-context.util';
import { buildMcpDocumentPayload } from '../utils/document-mcp.util';
import { shouldConvertToRichtextForTextWrite } from '../utils/mcp-document-create.util';
import type {
  DocumentContentPort,
  DocumentRawForIndex,
} from '../ports/document-content.port';

@Injectable()
export class DocumentContentAdapter implements DocumentContentPort {
  constructor(private readonly documentRepository: DocumentRepository) {}

  async load(documentId: string): Promise<DocumentContextPayload | null> {
    const doc = await this.documentRepository.findById(documentId);
    if (!doc) return null;
    return buildDocumentContext(doc);
  }

  async read(documentId: string) {
    const doc = await this.documentRepository.findById(documentId);
    if (!doc) return { error: 'Document not found' };
    const ctx = buildDocumentContext(doc);
    const payload = buildMcpDocumentPayload(doc);
    return {
      id: ctx.id,
      title: ctx.title,
      docType: ctx.docType,
      version: ctx.version,
      blockCount: ctx.blockCount,
      plainText: payload.plainText,
      content: doc.data,
      sheets: payload.sheets,
      sheetText: payload.sheetText,
    };
  }

  async write(
    documentId: string,
    content: string,
    mode: 'append' | 'replace' = 'append',
  ) {
    const doc = await this.documentRepository.findById(documentId);
    if (!doc) return { error: 'Document not found' };

    const trimmed = content.trim();
    if (!trimmed) {
      return { error: 'content is empty', success: false };
    }

    const previousType = doc.docType;
    const convertToRichtext = shouldConvertToRichtextForTextWrite(doc.docType);
    const nextData = convertToRichtext || mode === 'replace'
      ? replaceDocumentContent(convertToRichtext ? {} : doc.data, content)
      : appendTextToDocumentData(doc.data, content);

    const result = await this.documentRepository.saveContentInternal(
      documentId,
      nextData,
      undefined,
      convertToRichtext ? { docType: 'richtext' } : undefined,
    );

    return {
      success: !!result,
      version: result?.version,
      documentId,
      mode: convertToRichtext ? 'replace' : mode,
      docType: convertToRichtext ? 'richtext' : previousType,
      convertedFrom: convertToRichtext ? previousType : undefined,
    };
  }

  async getRawForIndex(documentId: string): Promise<DocumentRawForIndex | null> {
    const doc = await this.documentRepository.findById(documentId);
    if (!doc) return null;
    return { id: doc.id, title: doc.title, data: doc.data };
  }
}
