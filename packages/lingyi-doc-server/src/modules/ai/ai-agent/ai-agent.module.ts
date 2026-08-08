import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIAgentEntity } from '../entities/ai-agent.entity';
import { AIAgentSessionEntity } from '../entities/ai-agent-session.entity';
import { AILLMModule } from '../ai-llm/ai-llm.module';
import { AIKnowledgeModule } from '../ai-knowledge/ai-knowledge.module';
import { AiGuardModule } from '../ai-guard.module';
import { DocumentPortsModule } from '../../domain-ports/document-ports.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentExecutor } from './agent.executor';
import { AgentTools } from './agent.tools';
import { DocumentContextService } from './document-context.service';

@Module({
  imports: [
    DocumentPortsModule,
    TypeOrmModule.forFeature([AIAgentEntity, AIAgentSessionEntity]),
    AiGuardModule,
    AILLMModule,
    AIKnowledgeModule,
  ],
  controllers: [AgentController],
  providers: [AgentService, AgentExecutor, AgentTools, DocumentContextService],
  exports: [AgentService, AgentExecutor, AgentTools, DocumentContextService],
})
export class AIAgentModule {}
