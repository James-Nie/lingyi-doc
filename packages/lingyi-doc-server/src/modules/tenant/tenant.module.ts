import { Module } from '@nestjs/common';
import { TenantDataModule } from '../../repositories/tenant-data.module';
import { MembershipModule } from '../membership/membership.module';
import { TenantController } from './tenant.controller';

@Module({
  imports: [TenantDataModule, MembershipModule],
  controllers: [TenantController],
})
export class TenantModule {}
