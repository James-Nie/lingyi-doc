import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { CollabModule } from '../collab/collab.module';
import { AIModule } from '../ai/ai.module';
import { TenantDataModule } from '../../repositories/tenant-data.module';
import { AdminController } from './admin.controller';
import { AdminAiController } from './admin-ai.controller';
import { AdminStorageController } from './admin-storage.controller';
import { AdminStorageService } from './admin-storage.service';
import { AdminApiKeyController } from './admin-api-key.controller';
import { AdminApiKeyService } from './admin-api-key.service';
import { AdminDocumentController } from './admin-document.controller';
import { AdminRoleController } from './admin-role.controller';
import { AdminGroupController } from './admin-group.controller';
import { AdminSecurityController } from './admin-security.controller';

@Module({
  imports: [HealthModule, CollabModule, AIModule, TenantDataModule],
  controllers: [
    AdminController,
    AdminAiController,
    AdminStorageController,
    AdminApiKeyController,
    AdminDocumentController,
    AdminRoleController,
    AdminGroupController,
    AdminSecurityController,
  ],
  providers: [AdminStorageService, AdminApiKeyService],
})
export class AdminModule {}
