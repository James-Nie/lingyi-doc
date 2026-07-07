import { Module } from '@nestjs/common';
import { MembershipModule } from '../membership/membership.module';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';

@Module({
  imports: [MembershipModule],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
