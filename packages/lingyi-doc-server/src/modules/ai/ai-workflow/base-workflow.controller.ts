/**
 * 多维表工作流：base 路径下的 REST 接口
 *
 * 路径约定：
 *   GET    /api/v1/c/base/tables/:tableId/workflows         当前表工作流列表
 *   POST   /api/v1/c/base/tables/:tableId/workflows         新建工作流
 *   GET    /api/v1/c/base/workflows/:id                     详情
 *   PATCH  /api/v1/c/base/workflows/:id                     更新
 *   DELETE /api/v1/c/base/workflows/:id                     删除
 *   POST   /api/v1/c/base/workflows/:id/publish             发布/启用
 *   POST   /api/v1/c/base/workflows/:id/disable              停用
 *   POST   /api/v1/c/base/workflows/:id/trigger             手动触发（带变量）
 *   GET    /api/v1/c/base/workflows/:id/runs                运行历史
 *   GET    /api/v1/c/base/workflows/runs/:instanceId        单次运行详情
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthAudience } from '../../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../../auth/guards/tenant-context.guard';
import { AIWorkflowEntity } from '../entities/ai-workflow.entity';
import { AIWorkflowInstanceEntity } from '../entities/ai-workflow-instance.entity';
import { WorkflowService } from './workflow.service';
import { WorkflowEngine } from './workflow.engine';
import { WorkflowNodeRegistryService } from './workflow-node-registry.service';
import {
  CreateWorkflowDto,
  ExecuteWorkflowDto,
  UpdateWorkflowDto,
} from './dto/workflow.dto';

@Controller('api/v1/c/base')
@UseGuards(JwtAuthGuard, TenantContextGuard)
@AuthAudience('consumer')
export class BaseWorkflowController {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly engine: WorkflowEngine,
    private readonly nodeRegistry: WorkflowNodeRegistryService,
  ) {}

  private validateNodes(nodes?: Array<{ type: string; config?: Record<string, unknown> }>): void {
    if (!nodes) return;
    for (const n of nodes) {
      if (!this.nodeRegistry.has(n.type)) continue; // 兼容历史/外部未注册类型，交由引擎按 skipped 处理
      const err = this.nodeRegistry.validateConfig(n.type, n.config ?? {});
      if (err) throw new BadRequestException(err);
    }
  }

  @Get('tables/:tableId/workflows')
  async list(
    @CurrentUser() user: AuthUser,
    @Param('tableId') tableId: string,
    @Query('status') status?: string,
  ): Promise<{ items: AIWorkflowEntity[]; total: number }> {
    return this.workflowService.findAll(
      { page: 1, limit: 100, tableId, status },
      user,
    );
  }

  @Post('tables/:tableId/workflows')
  create(
    @CurrentUser() user: AuthUser,
    @Param('tableId') tableId: string,
    @Body() dto: CreateWorkflowDto,
  ) {
    this.validateNodes(dto.nodes);
    return this.workflowService.create(
      { ...dto, tableId, docId: dto.docId },
      user,
    );
  }

  @Get('workflows/:id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflowService.findOne(id, user);
  }

  @Patch('workflows/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    this.validateNodes(dto.nodes);
    return this.workflowService.update(id, dto, user);
  }

  @Delete('workflows/:id')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    const wf = await this.workflowService.findOne(id, user);
    // 软删除：直接转 disabled
    return this.workflowService.disable(wf.id, user);
  }

  @Post('workflows/:id/publish')
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflowService.publish(id, user);
  }

  @Post('workflows/:id/disable')
  disable(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflowService.disable(id, user);
  }

  @Post('workflows/:id/trigger')
  async trigger(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ExecuteWorkflowDto,
  ): Promise<AIWorkflowInstanceEntity> {
    return this.workflowService.execute(id, dto, user);
  }

  @Get('workflows/:id/runs')
  async listRuns(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    const wf = await this.workflowService.findOne(id, user);
    return this.engine.listInstances(wf.id, 50);
  }

  @Get('workflows/runs/:instanceId')
  async getRun(
    @Param('instanceId') instanceId: string,
  ): Promise<AIWorkflowInstanceEntity> {
    const inst = await this.engine.getInstanceWithHistory(instanceId);
    if (!inst) throw new NotFoundException('Run not found');
    return inst;
  }

  /** 开放平台：返回当前已注册的全部节点元数据（前端/第三方可动态获取目录） */
  @Get('workflows/nodes')
  listNodeCatalog() {
    return this.nodeRegistry.listDefinitions();
  }

  /**
   * 结果回调：恢复挂起(waiting)的实例并从等待节点继续执行。
   * Body: { waitToken: string, result: { payload?: Record<string, unknown>, branchOutput?: string } }
   */
  @Post('workflows/runs/:instanceId/resume')
  async resume(
    @CurrentUser() user: AuthUser,
    @Param('instanceId') instanceId: string,
    @Body() body: { waitToken: string; result?: { payload?: Record<string, unknown>; branchOutput?: string } },
  ): Promise<AIWorkflowInstanceEntity> {
    if (!body?.waitToken) throw new BadRequestException('缺少 waitToken');
    const inst = await this.engine.resume(instanceId, body.waitToken, body.result ?? {}, user);
    if (!inst) throw new NotFoundException('实例不存在或不在等待状态');
    return inst;
  }
}
