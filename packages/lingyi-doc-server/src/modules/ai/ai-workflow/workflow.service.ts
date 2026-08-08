import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AIWorkflowEntity } from '../entities/ai-workflow.entity';
import { AIWorkflowInstanceEntity } from '../entities/ai-workflow-instance.entity';
import { WorkflowEngine } from './workflow.engine';
import type {
  CreateWorkflowDto,
  ExecuteWorkflowDto,
  ListWorkflowDto,
  UpdateWorkflowDto,
} from './dto/workflow.dto';
import type { AuthUser } from '../../../auth/decorators/current-user.decorator';

@Injectable()
export class WorkflowService {
  constructor(
    @InjectRepository(AIWorkflowEntity)
    private readonly workflowRepo: Repository<AIWorkflowEntity>,
    @InjectRepository(AIWorkflowInstanceEntity)
    private readonly instanceRepo: Repository<AIWorkflowInstanceEntity>,
    private readonly engine: WorkflowEngine,
  ) {}

  async create(dto: CreateWorkflowDto, user: AuthUser): Promise<AIWorkflowEntity> {
    const workflow = this.workflowRepo.create({
      id: uuidv4(),
      name: dto.name,
      description: dto.description ?? null,
      version: 1,
      nodes: dto.nodes ?? [],
      edges: dto.edges ?? [],
      variables: dto.variables ?? [],
      status: 'draft',
      tenantId: user.currentTenantId ?? null,
      docId: dto.docId ?? null,
      tableId: dto.tableId ?? null,
      triggerType: dto.triggerType ?? null,
      triggerFilter: dto.triggerFilter ?? null,
      createdBy: user.userId,
      updatedBy: user.userId,
    });
    return this.workflowRepo.save(workflow);
  }

  async findAll(
    query: ListWorkflowDto,
    user: AuthUser,
  ): Promise<{ items: AIWorkflowEntity[]; total: number }> {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const qb = this.workflowRepo.createQueryBuilder('w')
      .where('(w.tenant_id IS NULL OR w.tenant_id = :tenantId)', {
        tenantId: user.currentTenantId ?? '',
      });

    if (query.status) {
      qb.andWhere('w.status = :status', { status: query.status });
    }
    if (query.docId) {
      qb.andWhere('w.doc_id = :docId', { docId: query.docId });
    }
    if (query.tableId) {
      qb.andWhere('w.table_id = :tableId', { tableId: query.tableId });
    }

    const [items, total] = await qb
      .orderBy('w.updated_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, total };
  }

  async findOne(id: string, user: AuthUser): Promise<AIWorkflowEntity> {
    const workflow = await this.workflowRepo.findOne({ where: { id } });
    if (!workflow) throw new NotFoundException('Workflow not found');
    if (workflow.tenantId && workflow.tenantId !== user.currentTenantId) {
      throw new NotFoundException('Workflow not found');
    }
    return workflow;
  }

  async update(id: string, dto: UpdateWorkflowDto, user: AuthUser): Promise<AIWorkflowEntity> {
    const workflow = await this.findOne(id, user);
    if (dto.name !== undefined) workflow.name = dto.name;
    if (dto.description !== undefined) workflow.description = dto.description ?? null;
    if (dto.nodes !== undefined) workflow.nodes = dto.nodes;
    if (dto.edges !== undefined) workflow.edges = dto.edges;
    if (dto.variables !== undefined) workflow.variables = dto.variables;
    if (dto.status !== undefined) workflow.status = dto.status;
    if (dto.triggerType !== undefined) workflow.triggerType = dto.triggerType;
    if (dto.triggerFilter !== undefined) workflow.triggerFilter = dto.triggerFilter;
    workflow.updatedBy = user.userId;
    return this.workflowRepo.save(workflow);
  }

  async publish(id: string, user: AuthUser): Promise<AIWorkflowEntity> {
    const workflow = await this.findOne(id, user);
    workflow.status = 'published';
    workflow.version += 1;
    workflow.updatedBy = user.userId;
    return this.workflowRepo.save(workflow);
  }

  async disable(id: string, user: AuthUser): Promise<AIWorkflowEntity> {
    const workflow = await this.findOne(id, user);
    workflow.status = 'disabled';
    workflow.updatedBy = user.userId;
    return this.workflowRepo.save(workflow);
  }

  async execute(
    id: string,
    dto: ExecuteWorkflowDto,
    user: AuthUser,
  ): Promise<AIWorkflowInstanceEntity> {
    const workflow = await this.findOne(id, user);
    if (workflow.status !== 'published') {
      throw new NotFoundException('Workflow is not published');
    }
    return this.engine.runSync(workflow, dto.variables ?? {}, user);
  }

  async getInstance(instanceId: string): Promise<AIWorkflowInstanceEntity> {
    const instance = await this.instanceRepo.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('Workflow instance not found');
    return instance;
  }

  async pauseInstance(instanceId: string): Promise<AIWorkflowInstanceEntity | null> {
    return this.engine.pauseInstance(instanceId);
  }

  async resumeInstance(instanceId: string): Promise<AIWorkflowInstanceEntity | null> {
    return this.engine.resumeInstance(instanceId);
  }

  async listRuns(workflowId: string): Promise<AIWorkflowInstanceEntity[]> {
    return this.engine.listInstances(workflowId, 50);
  }
}
