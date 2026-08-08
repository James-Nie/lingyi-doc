import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthAudience } from '../../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../../auth/guards/tenant-context.guard';
import { AIModuleGuard } from '../ai.guard';
import { WorkflowService } from './workflow.service';
import {
  CreateWorkflowDto,
  ExecuteWorkflowDto,
  ListWorkflowDto,
  UpdateWorkflowDto,
} from './dto/workflow.dto';

@Controller('api/v1/ai/workflows')
@UseGuards(JwtAuthGuard, TenantContextGuard, AIModuleGuard)
@AuthAudience('consumer')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkflowDto) {
    return this.workflowService.create(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListWorkflowDto) {
    return this.workflowService.findAll(query, user);
  }

  @Get('instances/:id')
  getInstance(@Param('id') id: string) {
    return this.workflowService.getInstance(id);
  }

  @Post('instances/:id/pause')
  pauseInstance(@Param('id') id: string) {
    return this.workflowService.pauseInstance(id);
  }

  @Post('instances/:id/resume')
  resumeInstance(@Param('id') id: string) {
    return this.workflowService.resumeInstance(id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflowService.findOne(id, user);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflowService.update(id, dto, user);
  }

  @Post(':id/publish')
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflowService.publish(id, user);
  }

  @Post(':id/disable')
  disable(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflowService.disable(id, user);
  }

  @Post(':id/execute')
  execute(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ExecuteWorkflowDto,
  ) {
    return this.workflowService.execute(id, dto, user);
  }

  @Get(':id/runs')
  async listRuns(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    const workflow = await this.workflowService.findOne(id, user);
    return this.workflowService.listRuns(workflow.id);
  }
}
