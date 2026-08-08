import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuotaDailyLogEntity } from '../../database/entities/quota-daily-log.entity';
import { DocumentDataModule } from '../../repositories/document-data.module';
import { TenantDataModule } from '../../repositories/tenant-data.module';
import { KnowledgeDataModule } from '../../repositories/knowledge-data.module';
import { QuotaDailyLogRepository } from '../../repositories/quota-daily-log.repository';
import { MembershipController } from './membership.controller';
import { MembershipFeatureGuard } from './membership-feature.guard';
import { MembershipModuleGuard } from './membership-module.guard';
import { MembershipService } from './membership.service';

@Module({
  imports: [
    DocumentDataModule,
    TenantDataModule,
    KnowledgeDataModule,
    TypeOrmModule.forFeature([QuotaDailyLogEntity]),
  ],
  controllers: [MembershipController],
  providers: [
    MembershipService,
    MembershipFeatureGuard,
    MembershipModuleGuard,
    QuotaDailyLogRepository,
  ],
  exports: [MembershipService, MembershipFeatureGuard, MembershipModuleGuard],
})
export class MembershipModule {}
