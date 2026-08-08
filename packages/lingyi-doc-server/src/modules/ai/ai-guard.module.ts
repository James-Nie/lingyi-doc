import { Module } from '@nestjs/common';
import { AiConfigModule } from './ai-config.module';
import { AIModuleGuard } from './ai.guard';

@Module({
  imports: [AiConfigModule],
  providers: [AIModuleGuard],
  exports: [AIModuleGuard, AiConfigModule],
})
export class AiGuardModule {}
