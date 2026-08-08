import { Module } from '@nestjs/common';
import { StorageService } from '../../services/storage.service';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { AIKnowledgeModule } from '../ai/ai-knowledge/ai-knowledge.module';
import { DocumentShareModule } from '../document-share/document-share.module';
import { MembershipModule } from '../membership/membership.module';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { KnowledgeService } from '../ai/ai-knowledge/knowledge.service';
import { MembershipService } from '../membership/membership.service';
import { DocumentSharePathAdapter } from '../../adapters/document-share-path.adapter';
import { DocumentPortsModule } from './document-ports.module';
import {
  AI_RAG_PORT,
  DOCUMENT_SHARE_PATH_PORT,
  DOCUMENT_STORAGE_PORT,
  KNOWLEDGE_BASE_PORT,
  MEMBERSHIP_DOCUMENT_PORT,
} from '../../ports/tokens';

/**
 * MCP 等领域聚合端口：对外只导出 Token，内部用 Adapter / useExisting 绑定实现。
 * McpModule 应 import 本模块，禁止再直连 KnowledgeBase/AI/Share 业务 Module。
 */
@Module({
  imports: [
    DocumentPortsModule,
    KnowledgeBaseModule,
    AIKnowledgeModule,
    DocumentShareModule,
    MembershipModule,
  ],
  providers: [
    DocumentSharePathAdapter,
    { provide: DOCUMENT_STORAGE_PORT, useExisting: StorageService },
    { provide: DOCUMENT_SHARE_PATH_PORT, useExisting: DocumentSharePathAdapter },
    { provide: KNOWLEDGE_BASE_PORT, useExisting: KnowledgeBaseService },
    { provide: AI_RAG_PORT, useExisting: KnowledgeService },
    { provide: MEMBERSHIP_DOCUMENT_PORT, useExisting: MembershipService },
  ],
  exports: [
    DocumentPortsModule, // re-exports DOCUMENT_ACCESS_PORT / DOCUMENT_CONTENT_PORT
    DOCUMENT_STORAGE_PORT,
    DOCUMENT_SHARE_PATH_PORT,
    KNOWLEDGE_BASE_PORT,
    AI_RAG_PORT,
    MEMBERSHIP_DOCUMENT_PORT,
  ],
})
export class DomainPortsModule {}
