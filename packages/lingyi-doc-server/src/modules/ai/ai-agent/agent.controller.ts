import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthAudience } from '../../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../../auth/guards/tenant-context.guard';
import { AIModuleGuard } from '../ai.guard';
import { AgentService } from './agent.service';
import {
  ChatDto,
  CreateAgentDto,
  CreateSessionDto,
  ListAgentDto,
  ListSessionDto,
  UpdateAgentDto,
} from './dto/agent.dto';

@Controller('api/v1/ai/agents')
@UseGuards(JwtAuthGuard, TenantContextGuard, AIModuleGuard)
@AuthAudience('consumer')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAgentDto) {
    return this.agentService.create(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListAgentDto) {
    return this.agentService.findAll(query, user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.agentService.findOne(id, user);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.agentService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.agentService.remove(id, user);
  }

  @Post(':id/sessions')
  createSession(
    @CurrentUser() user: AuthUser,
    @Param('id') agentId: string,
    @Body() dto: CreateSessionDto,
  ) {
    return this.agentService.createSession(agentId, user, dto.documentId);
  }

  @Get(':id/sessions')
  getSessions(
    @CurrentUser() user: AuthUser,
    @Param('id') agentId: string,
    @Query() query: ListSessionDto,
  ) {
    return this.agentService.getSessions(agentId, query, user);
  }

  @Post(':id/chat')
  chat(
    @CurrentUser() user: AuthUser,
    @Param('id') agentId: string,
    @Body() dto: ChatDto,
  ) {
    return this.agentService.chat(agentId, dto, user);
  }

  @Post(':id/chat/stream')
  async chatStream(
    @CurrentUser() user: AuthUser,
    @Param('id') agentId: string,
    @Body() dto: ChatDto,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      for await (const event of this.agentService.chatStream(agentId, dto, user)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      res.write('data: [DONE]\n\n');
    } catch (err) {
      res.write(`data: ${JSON.stringify({ type: 'error', data: { message: (err as Error).message } })}\n\n`);
    } finally {
      res.end();
    }
  }
}
