import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIWorkflowEntity } from '../entities/ai-workflow.entity';
import { AIWorkflowInstanceEntity } from '../entities/ai-workflow-instance.entity';
import { AIAgentModule } from '../ai-agent/ai-agent.module';
import { AiGuardModule } from '../ai-guard.module';
import { DocumentDataModule } from '../../../repositories/document-data.module';
import { WorkflowController } from './workflow.controller';
import { BaseWorkflowController } from './base-workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowEngine } from './workflow.engine';
import { WorkflowTriggerDispatcher } from './workflow-trigger.dispatcher';

@Module({
  imports: [
    TypeOrmModule.forFeature([AIWorkflowEntity, AIWorkflowInstanceEntity]),
    AiGuardModule,
    DocumentDataModule,
    forwardRef(() => AIAgentModule),
  ],
  controllers: [WorkflowController, BaseWorkflowController],
  providers: [WorkflowService, WorkflowEngine, WorkflowTriggerDispatcher],
  exports: [WorkflowService, WorkflowEngine, WorkflowTriggerDispatcher],
})
export class AIWorkflowModule {}
