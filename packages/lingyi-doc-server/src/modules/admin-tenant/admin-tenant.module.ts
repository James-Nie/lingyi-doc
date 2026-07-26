import { Module } from '@nestjs/common';
import { TenantDataModule } from '../../repositories/tenant-data.module';
import { AdminTenantController } from './admin-tenant.controller';
import { AdminTenantService } from './admin-tenant.service';

@Module({
  imports: [TenantDataModule],
  controllers: [AdminTenantController],
  providers: [AdminTenantService],
})
export class AdminTenantModule {}
