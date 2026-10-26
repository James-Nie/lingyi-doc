import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AIWorkflowEntity } from '../entities/ai-workflow.entity';
import { AIWorkflowInstanceEntity } from '../entities/ai-workflow-instance.entity';
import { WfTriggerOutboxEntity } from '../../../database/entities/wf-trigger-outbox.entity';
import { AIWorkflowRunStepEntity } from '../../../database/entities/ai-workflow-run-step.entity';
import { AIAgentModule } from '../ai-agent/ai-agent.module';
import { AiGuardModule } from '../ai-guard.module';
import { DocumentDataModule } from '../../../repositories/document-data.module';
import { WorkflowController } from './workflow.controller';
import { BaseWorkflowController } from './base-workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowEngine } from './workflow.engine';
import { WorkflowTriggerDispatcher } from './workflow-trigger.dispatcher';
import { WorkflowOutboxService } from './workflow-outbox.service';
import { WorkflowRecordService } from './workflow-record.service';
import { WorkflowNodeRegistryService } from './workflow-node-registry.service';
import { WORKFLOW_NODE_PROVIDERS } from './workflow-node-token';
import { builtInNodeProviders } from './node-executors';

@Module({
  imports: [
    TypeOrmModule.forFeature([AIWorkflowEntity, AIWorkflowInstanceEntity, WfTriggerOutboxEntity, AIWorkflowRunStepEntity]),
    AiGuardModule,
    DocumentDataModule,
    forwardRef(() => AIAgentModule),
  ],
  controllers: [WorkflowController, BaseWorkflowController],
  providers: [
    WorkflowService,
    WorkflowEngine,
    WorkflowTriggerDispatcher,
    WorkflowOutboxService,
    WorkflowRecordService,
    WorkflowNodeRegistryService,
    // 插件化注册：内置节点经由 multi-provider 注入，第三方模块同样向该 token 追加即可
    {
      provide: WORKFLOW_NODE_PROVIDERS,
      multi: true,
      useFactory: (recordPort: WorkflowRecordService, config: ConfigService) =>
        builtInNodeProviders({ recordPort, config }),
      inject: [WorkflowRecordService, ConfigService],
    } as any,
  ],
  exports: [
    WorkflowService,
    WorkflowEngine,
    WorkflowTriggerDispatcher,
    WorkflowNodeRegistryService,
  ],
})
export class AIWorkflowModule {}
