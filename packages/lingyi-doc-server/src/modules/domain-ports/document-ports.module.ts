import { Module } from '@nestjs/common';
import { DocumentDataModule } from '../../repositories/document-data.module';
import { DocumentAccessAdapter } from '../../adapters/document-access.adapter';
import { DocumentContentAdapter } from '../../adapters/document-content.adapter';
import {
  DOCUMENT_ACCESS_PORT,
  DOCUMENT_CONTENT_PORT,
} from '../../ports/tokens';

/**
 * Document 域端口（非 Global）。
 * Collab / AI / MCP 等消费者应依赖 Port Token，而非 DocumentRepository。
 */
@Module({
  imports: [DocumentDataModule],
  providers: [
    DocumentAccessAdapter,
    DocumentContentAdapter,
    { provide: DOCUMENT_ACCESS_PORT, useExisting: DocumentAccessAdapter },
    { provide: DOCUMENT_CONTENT_PORT, useExisting: DocumentContentAdapter },
  ],
  exports: [DOCUMENT_ACCESS_PORT, DOCUMENT_CONTENT_PORT, DocumentDataModule],
})
export class DocumentPortsModule {}
