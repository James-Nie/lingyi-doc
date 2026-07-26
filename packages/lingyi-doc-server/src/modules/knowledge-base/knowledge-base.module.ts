import { Module } from '@nestjs/common';
import { TenantDataModule } from '../../repositories/tenant-data.module';
import { KnowledgeDataModule } from '../../repositories/knowledge-data.module';
import { MembershipModule } from '../membership/membership.module';
import { KbInviteController } from './kb-invite.controller';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';

@Module({
  imports: [TenantDataModule, KnowledgeDataModule, MembershipModule],
  controllers: [KnowledgeBaseController, KbInviteController],
  providers: [KnowledgeBaseService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
