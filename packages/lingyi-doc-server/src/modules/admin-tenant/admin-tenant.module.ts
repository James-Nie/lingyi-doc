import { Module } from '@nestjs/common';
import { AdminTenantController } from './admin-tenant.controller';
import { AdminTenantService } from './admin-tenant.service';

@Module({
  controllers: [AdminTenantController],
  providers: [AdminTenantService],
})
export class AdminTenantModule {}
