import { Module } from '@nestjs/common';
import { TenantDataModule } from '../../repositories/tenant-data.module';
import { ConsumerTenantController } from './consumer-tenant.controller';
import { ConsumerTenantService } from './consumer-tenant.service';

@Module({
  imports: [TenantDataModule],
  controllers: [ConsumerTenantController],
  providers: [ConsumerTenantService],
  exports: [ConsumerTenantService],
})
export class ConsumerTenantModule {}