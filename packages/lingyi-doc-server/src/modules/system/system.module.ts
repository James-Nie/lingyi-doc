import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { SystemController } from './system.controller';

@Module({
  imports: [HealthModule],
  controllers: [SystemController],
})
export class SystemModule {}
