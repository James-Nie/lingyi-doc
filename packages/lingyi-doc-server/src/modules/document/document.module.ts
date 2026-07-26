import { Module } from '@nestjs/common';
import { DocumentController } from './document.controller';
import { DocumentVersionController } from './document-version.controller';
import { DocumentVersionService } from './document-version.service';
import { DocumentShareModule } from '../document-share/document-share.module';
import { MembershipModule } from '../membership/membership.module';
import { DocumentDataModule } from '../../repositories/document-data.module';

@Module({
  imports: [DocumentDataModule, DocumentShareModule, MembershipModule],
  controllers: [DocumentController, DocumentVersionController],
  providers: [DocumentVersionService],
})
export class DocumentModule {}
