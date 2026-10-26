/**
 * 工作流节点注册表服务（插件化）
 *
 * 从 `WORKFLOW_NODE_PROVIDERS` 多注入收集所有 provider（内置 + 第三方模块注入），
 * 构建 type → { definition, executor } 映射。引擎按 nodes[*].type 查表执行。
 * 支持运行时 register() 增量注册（SPI）。
 */
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WorkflowNodeDefinition } from './workflow-node.types';
import {
  WORKFLOW_NODE_PROVIDERS,
  type WorkflowNodeProvider,
  type WorkflowNodeProviderContext,
} from './workflow-node-token';
import type { NodeExecutor } from './node-registry';
import { WorkflowRecordService } from './workflow-record.service';

@Injectable()
export class WorkflowNodeRegistryService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowNodeRegistryService.name);
  private readonly definitions = new Map<string, WorkflowNodeDefinition>();
  private readonly executors = new Map<string, NodeExecutor>();
  private readonly ctx: WorkflowNodeProviderContext;

  constructor(
    @Inject(WORKFLOW_NODE_PROVIDERS) private readonly providers: WorkflowNodeProvider[],
    private readonly recordPort: WorkflowRecordService,
    private readonly config: ConfigService,
  ) {
    this.ctx = { recordPort, config };
    // 兜底：即使模块注册滞后，也可运行时注入（OnModuleInit 也会消费）
    for (const p of this.providers ?? []) this.applyProvider(p);
  }

  onModuleInit(): void {
    for (const p of this.providers ?? []) this.applyProvider(p);
    this.logger.log(`工作流节点注册完成，共 ${this.definitions.size} 类节点`);
  }

  /** 运行时增量注册（SPI）：第三方可在任何时机注入 */
  register(provider: WorkflowNodeProvider): void {
    this.applyProvider(provider);
  }

  private applyProvider(provider: WorkflowNodeProvider): void {
    if (!provider?.definition?.type) return;
    this.definitions.set(provider.definition.type, provider.definition);
    if (this.executors.has(provider.definition.type)) this.executors.delete(provider.definition.type);
    this.logger.log(`[workflow-node] 注册节点 ${provider.definition.type}`);
  }

  has(type: string): boolean {
    return this.definitions.has(type);
  }

  getDefinition(type: string): WorkflowNodeDefinition | undefined {
    return this.definitions.get(type);
  }

  listDefinitions(): WorkflowNodeDefinition[] {
    return Array.from(this.definitions.values());
  }

  /** 惰性构建执行器（缓存） */
  getExecutor(type: string): NodeExecutor | undefined {
    if (!this.executors.has(type)) {
      const provider = (this.providers ?? []).find((p) => p.definition.type === type);
      if (!provider) return undefined;
      this.executors.set(type, provider.createExecutor(this.ctx));
    }
    return this.executors.get(type);
  }

  /** 节点配置校验（definition.validateConfig + configFields 必填项） */
  validateConfig(type: string, config: Record<string, unknown>): string | null {
    const def = this.getDefinition(type);
    if (!def) return `未知节点类型: ${type}`;
    for (const f of def.configFields ?? []) {
      if (f.required) {
        const value = config?.[f.key];
        if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
          return `节点「${def.label}」缺少必填配置: ${f.label}`;
        }
      }
    }
    if (def.validateConfig) {
      const err = def.validateConfig(config as never);
      if (err) return err;
    }
    return null;
  }
}