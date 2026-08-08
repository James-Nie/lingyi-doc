import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentPortsModule } from '../../domain-ports/document-ports.module';
import { AIDocumentVectorEntity } from '../entities/ai-document-vector.entity';
import { AiGuardModule } from '../ai-guard.module';
import { AILLMModule } from '../ai-llm/ai-llm.module';
import { EmbeddingService } from './embedding.service';
import { RAGPipeline } from './rag.pipeline';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';

@Module({
  imports: [
    DocumentPortsModule,
    TypeOrmModule.forFeature([AIDocumentVectorEntity]),
    AiGuardModule,
    AILLMModule,
  ],
  controllers: [KnowledgeController],
  providers: [EmbeddingService, RAGPipeline, KnowledgeService],
  exports: [KnowledgeService, RAGPipeline, EmbeddingService],
})
export class AIKnowledgeModule {}
