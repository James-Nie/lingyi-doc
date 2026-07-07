import { Module } from '@nestjs/common';
import { AdminTenantController } from './admin-tenant.controller';

@Module({
  controllers: [AdminTenantController],
})
export class AdminTenantModule {}
