import { Module } from '@nestjs/common';
import { DocumentCommentModule } from '../document-comment/document-comment.module';
import { DocumentShareController } from './document-share.controller';
import { DocumentShareJoinController } from './document-share-join.controller';
import { DocumentSharePublicController } from './document-share-public.controller';
import { DocumentShareService } from './document-share.service';

@Module({
  imports: [DocumentCommentModule],
  controllers: [DocumentShareController, DocumentShareJoinController, DocumentSharePublicController],
  providers: [DocumentShareService],
  exports: [DocumentShareService],
})
export class DocumentShareModule {}
