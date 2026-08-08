import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AILLMUsageLogEntity } from '../entities/ai-llm-usage-log.entity';
import { AiConfigModule } from '../ai-config.module';
import { LLMGateway } from './llm.gateway';
import { LLMRouter } from './llm.router';
import { UsageMeterService } from './usage-meter.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AILLMUsageLogEntity]),
    AiConfigModule,
  ],
  providers: [LLMRouter, UsageMeterService, LLMGateway],
  exports: [LLMGateway, LLMRouter, UsageMeterService],
})
export class AILLMModule {}
