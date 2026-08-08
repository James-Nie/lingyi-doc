import type { DocumentContextPayload } from '../modules/ai/ai-agent/document-context.util';

export interface DocumentRawForIndex {
  id: string;
  title: string;
  data: unknown;
}

/** AI / MCP：文档文本读写与索引取数（禁止消费者直注 DocumentRepository） */
export interface DocumentContentPort {
  load(documentId: string): Promise<DocumentContextPayload | null>;
  read(documentId: string): Promise<unknown>;
  write(
    documentId: string,
    content: string,
    mode?: 'append' | 'replace',
  ): Promise<unknown>;
  getRawForIndex(documentId: string): Promise<DocumentRawForIndex | null>;
}
