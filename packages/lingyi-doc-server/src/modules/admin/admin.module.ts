import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { CollabModule } from '../collab/collab.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [HealthModule, CollabModule],
  controllers: [AdminController],
})
export class AdminModule {}
