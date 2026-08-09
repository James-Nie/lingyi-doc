import { Module, forwardRef } from '@nestjs/common';
import { DocumentDataModule } from '../../repositories/document-data.module';
import { TenantDataModule } from '../../repositories/tenant-data.module';
import { DocumentCommentModule } from '../document-comment/document-comment.module';
import { AIWorkflowModule } from '../ai/ai-workflow/ai-workflow.module';
import { DocumentShareController } from './document-share.controller';
import { DocumentShareJoinController } from './document-share-join.controller';
import { DocumentSharePublicController } from './document-share-public.controller';
import { DocumentShareService } from './document-share.service';

@Module({
  imports: [
    DocumentDataModule,
    TenantDataModule,
    DocumentCommentModule,
    forwardRef(() => AIWorkflowModule),
  ],
  controllers: [DocumentShareController, DocumentShareJoinController, DocumentSharePublicController],
  providers: [DocumentShareService],
  exports: [DocumentShareService],
})
export class DocumentShareModule {}
