import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { CollabModule } from '../collab/collab.module';
import { AIModule } from '../ai/ai.module';
import { AdminController } from './admin.controller';
import { AdminAiController } from './admin-ai.controller';

@Module({
  imports: [HealthModule, CollabModule, AIModule],
  controllers: [AdminController, AdminAiController],
})
export class AdminModule {}
