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
  ) {}

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
    const inst = await this.workflowService.getInstance(instanceId);
    if (!inst) throw new NotFoundException('Run not found');
    return inst;
  }
}
