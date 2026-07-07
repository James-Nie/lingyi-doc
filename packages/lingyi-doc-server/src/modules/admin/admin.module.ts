import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [HealthModule],
  controllers: [AdminController],
})
export class AdminModule {}
