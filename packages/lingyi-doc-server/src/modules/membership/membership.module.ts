import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuotaDailyLogEntity } from '../../database/entities/quota-daily-log.entity';
import { QuotaDailyLogRepository } from '../../repositories/quota-daily-log.repository';
import { MembershipController } from './membership.controller';
import { MembershipFeatureGuard } from './membership-feature.guard';
import { MembershipService } from './membership.service';

@Module({
  imports: [TypeOrmModule.forFeature([QuotaDailyLogEntity])],
  controllers: [MembershipController],
  providers: [MembershipService, MembershipFeatureGuard, QuotaDailyLogRepository],
  exports: [MembershipService, MembershipFeatureGuard],
})
export class MembershipModule {}
