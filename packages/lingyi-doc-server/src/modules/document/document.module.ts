import { Module } from '@nestjs/common';
import { DocumentController } from './document.controller';
import { DocumentShareModule } from '../document-share/document-share.module';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [DocumentShareModule, MembershipModule],
  controllers: [DocumentController],
})
export class DocumentModule {}
