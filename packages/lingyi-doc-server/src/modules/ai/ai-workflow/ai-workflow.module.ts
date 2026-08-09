import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIWorkflowEntity } from '../entities/ai-workflow.entity';
import { AIWorkflowInstanceEntity } from '../entities/ai-workflow-instance.entity';
import { WfTriggerOutboxEntity } from '../../../database/entities/wf-trigger-outbox.entity';
import { AIAgentModule } from '../ai-agent/ai-agent.module';
import { AiGuardModule } from '../ai-guard.module';
import { DocumentDataModule } from '../../../repositories/document-data.module';
import { WorkflowController } from './workflow.controller';
import { BaseWorkflowController } from './base-workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowEngine } from './workflow.engine';
import { WorkflowTriggerDispatcher } from './workflow-trigger.dispatcher';
import { WorkflowOutboxService } from './workflow-outbox.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AIWorkflowEntity, AIWorkflowInstanceEntity, WfTriggerOutboxEntity]),
    AiGuardModule,
    DocumentDataModule,
    forwardRef(() => AIAgentModule),
  ],
  controllers: [WorkflowController, BaseWorkflowController],
  providers: [WorkflowService, WorkflowEngine, WorkflowTriggerDispatcher, WorkflowOutboxService],
  exports: [WorkflowService, WorkflowEngine, WorkflowTriggerDispatcher],
})
export class AIWorkflowModule {}
