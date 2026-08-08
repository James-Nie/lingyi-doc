import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type QueryDeepPartialEntity } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  DOCUMENT_CONTENT_PORT,
  type DocumentContentPort,
} from '../../../ports';
import { AIDocumentVectorEntity } from '../entities/ai-document-vector.entity';
import { EmbeddingService } from './embedding.service';

export interface ChunkingConfig {
  strategy: 'fixed_size' | 'semantic' | 'recursive';
  chunkSize: number;
  chunkOverlap: number;
}

export interface RetrievalResult {
  content: string;
  score: number;
  documentId: string;
  metadata: Record<string, unknown>;
}

/** 无 documentIds 时禁止全表扫描；有范围时仍限制单次载入上限 */
const MAX_VECTOR_SCAN = 2000;

@Injectable()
export class RAGPipeline {
  private readonly logger = new Logger(RAGPipeline.name);

  constructor(
    @InjectRepository(AIDocumentVectorEntity)
    private readonly vectorRepo: Repository<AIDocumentVectorEntity>,
    private readonly embeddingService: EmbeddingService,
    @Inject(DOCUMENT_CONTENT_PORT)
    private readonly documentContent: DocumentContentPort,
  ) {}

  async indexDocument(documentId: string, config?: Partial<ChunkingConfig>): Promise<number> {
    const doc = await this.documentContent.getRawForIndex(documentId);
    if (!doc) throw new Error('Document not found');

    const content = this.extractText(doc.data);
    const chunkConfig: ChunkingConfig = {
      strategy: 'recursive',
      chunkSize: 512,
      chunkOverlap: 50,
      ...config,
    };

    const chunks = this.chunkDocument(content, chunkConfig);
    this.logger.log(`Document ${documentId} split into ${chunks.length} chunks`);

    await this.vectorRepo.delete({ documentId });

    const embeddings = await this.embeddingService.embedBatch(chunks, {
      source: 'embed',
    });

    if (chunks.length > 0) {
      // TypeORM insert 对 JSON(Record<string, unknown>) 的 DeepPartial 推断过严，需显式断言
      const rows = chunks.map((chunk, i) => ({
        id: uuidv4(),
        documentId,
        chunkIndex: i,
        content: chunk,
        embedding: embeddings[i].embedding,
        metadata: { documentTitle: doc.title, chunkSize: chunk.length },
      })) as QueryDeepPartialEntity<AIDocumentVectorEntity>[];
      await this.vectorRepo.insert(rows);
    }

    return chunks.length;
  }

  async search(
    query: string,
    topK = 5,
    documentIds?: string[],
  ): Promise<RetrievalResult[]> {
    const scopedIds = (documentIds ?? []).map((id) => id.trim()).filter(Boolean);
    if (!scopedIds.length) {
      // 无文档范围时拒绝全表向量扫描，避免 ai_document_vector 膨胀后拖垮检索
      this.logger.warn('RAG search skipped: documentIds is required to avoid full table scan');
      return [];
    }

    const queryEmbedding = await this.embeddingService.embed(query);

    const vectors = await this.vectorRepo
      .createQueryBuilder('v')
      .where('v.documentId IN (:...documentIds)', { documentIds: scopedIds })
      .take(MAX_VECTOR_SCAN)
      .getMany();

    const scored = vectors
      .map((v) => ({
        content: v.content,
        score: this.embeddingService.cosineSimilarity(queryEmbedding.embedding, v.embedding),
        documentId: v.documentId,
        metadata: v.metadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  }

  async deleteDocumentVectors(documentId: string): Promise<void> {
    await this.vectorRepo.delete({ documentId });
  }

  private extractText(data: unknown): string {
    if (data == null) return '';
    if (typeof data === 'string') return data;
    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }

  private chunkDocument(content: string, config: ChunkingConfig): string[] {
    if (!content) return [];
    const { chunkSize, chunkOverlap } = config;
    const chunks: string[] = [];
    let start = 0;

    while (start < content.length) {
      const end = Math.min(start + chunkSize, content.length);
      chunks.push(content.slice(start, end));
      if (end >= content.length) break;
      start = end - chunkOverlap;
    }

    return chunks;
  }
}
