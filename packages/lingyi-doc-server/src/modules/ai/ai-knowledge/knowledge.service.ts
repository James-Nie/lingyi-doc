import { Injectable } from '@nestjs/common';
import { RAGPipeline } from './rag.pipeline';

@Injectable()
export class KnowledgeService {
  constructor(private readonly ragPipeline: RAGPipeline) {}

  async embedDocument(documentId: string): Promise<{ chunkCount: number }> {
    const chunkCount = await this.ragPipeline.indexDocument(documentId);
    return { chunkCount };
  }

  async search(
    query: string,
    topK = 5,
    _tenantId?: string,
    documentIds?: string[],
  ): Promise<unknown[]> {
    return this.ragPipeline.search(query, topK, documentIds);
  }

  async deleteVectors(documentId: string): Promise<void> {
    await this.ragPipeline.deleteDocumentVectors(documentId);
  }
}
