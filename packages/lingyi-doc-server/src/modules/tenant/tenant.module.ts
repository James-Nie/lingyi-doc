import { Module } from '@nestjs/common';
import { MembershipModule } from '../membership/membership.module';
import { TenantController } from './tenant.controller';

@Module({
  imports: [MembershipModule],
  controllers: [TenantController],
})
export class TenantModule {}
