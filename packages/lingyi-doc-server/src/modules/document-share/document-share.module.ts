import { Module } from '@nestjs/common';
import { DocumentShareController } from './document-share.controller';
import { DocumentShareJoinController } from './document-share-join.controller';
import { DocumentSharePublicController } from './document-share-public.controller';
import { DocumentShareService } from './document-share.service';

@Module({
  controllers: [DocumentShareController, DocumentShareJoinController, DocumentSharePublicController],
  providers: [DocumentShareService],
  exports: [DocumentShareService],
})
export class DocumentShareModule {}
