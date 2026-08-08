import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { CollabModule } from '../collab/collab.module';
import { AIModule } from '../ai/ai.module';
import { AdminController } from './admin.controller';
import { AdminAiController } from './admin-ai.controller';
import { AdminStorageController } from './admin-storage.controller';
import { AdminStorageService } from './admin-storage.service';
import { AdminApiKeyController } from './admin-api-key.controller';
import { AdminApiKeyService } from './admin-api-key.service';

@Module({
  imports: [HealthModule, CollabModule, AIModule],
  controllers: [AdminController, AdminAiController, AdminStorageController, AdminApiKeyController],
  providers: [AdminStorageService, AdminApiKeyService],
})
export class AdminModule {}
