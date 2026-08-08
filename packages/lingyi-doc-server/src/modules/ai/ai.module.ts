import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AI_ENTITIES } from './entities';
import { AIAgentModule } from './ai-agent/ai-agent.module';
import { AIWorkflowModule } from './ai-workflow/ai-workflow.module';
import { AIKnowledgeModule } from './ai-knowledge/ai-knowledge.module';
import { AILLMModule } from './ai-llm/ai-llm.module';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { AiConfigModule } from './ai-config.module';
import { AiGuardModule } from './ai-guard.module';

@Module({
  imports: [
    TypeOrmModule.forFeature(AI_ENTITIES),
    AiConfigModule,
    AiGuardModule,
    AILLMModule,
    AIKnowledgeModule,
    AIAgentModule,
    AIWorkflowModule,
  ],
  controllers: [AIController],
  providers: [AIService],
  exports: [AIService, AiConfigModule, AiGuardModule, AILLMModule, AIAgentModule, AIWorkflowModule, AIKnowledgeModule],
})
export class AIModule {}
