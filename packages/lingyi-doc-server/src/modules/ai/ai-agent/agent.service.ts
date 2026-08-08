import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { AIAgentEntity } from '../entities/ai-agent.entity';
import { AIAgentSessionEntity } from '../entities/ai-agent-session.entity';
import type { ChatMessage } from '../entities/ai.types';
import { AgentExecutor } from './agent.executor';
import { BUILTIN_AGENTS } from './builtin-agents';
import type { ChatDto, CreateAgentDto, ListAgentDto, ListSessionDto, UpdateAgentDto } from './dto/agent.dto';
import type { AuthUser } from '../../../auth/decorators/current-user.decorator';

@Injectable()
export class AgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AIAgentEntity)
    private readonly agentRepo: Repository<AIAgentEntity>,
    @InjectRepository(AIAgentSessionEntity)
    private readonly sessionRepo: Repository<AIAgentSessionEntity>,
    private readonly executor: AgentExecutor,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.get<boolean>('ai.enabled')) return;
    await this.ensureBuiltinAgents();
  }

  private async ensureBuiltinAgents(): Promise<void> {
    const defaultModel = this.config.get<string>('ai.defaultModel', 'deepseek-v4-flash');

    for (const def of BUILTIN_AGENTS) {
      const config = {
        ...def.config,
        model: defaultModel,
      };
      const existing = await this.agentRepo.findOne({ where: { id: def.id } });
      if (existing) {
        let changed = false;
        if (existing.config.model !== defaultModel) {
          existing.config = { ...existing.config, model: defaultModel };
          changed = true;
        }
        if (existing.config.systemPrompt !== def.config.systemPrompt) {
          existing.config = { ...existing.config, systemPrompt: def.config.systemPrompt };
          changed = true;
        }
        if (changed) await this.agentRepo.save(existing);
        continue;
      }

      await this.agentRepo.save({
        id: def.id,
        name: def.name,
        description: def.description,
        type: def.type,
        config,
        capabilities: def.capabilities,
        isActive: true,
        tenantId: null,
      });
    }
  }

  async create(dto: CreateAgentDto, user: AuthUser): Promise<AIAgentEntity> {
    const agent = this.agentRepo.create({
      id: uuidv4(),
      name: dto.name,
      description: dto.description ?? null,
      type: dto.type,
      config: dto.config,
      capabilities: dto.capabilities ?? [],
      isActive: dto.isActive !== false,
      tenantId: user.currentTenantId ?? null,
    });
    return this.agentRepo.save(agent);
  }

  async findAll(
    query: ListAgentDto,
    user: AuthUser,
  ): Promise<{ items: AIAgentEntity[]; total: number }> {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const qb = this.agentRepo.createQueryBuilder('a')
      .where('a.is_active = true')
      .andWhere('(a.tenant_id IS NULL OR a.tenant_id = :tenantId)', {
        tenantId: user.currentTenantId ?? '',
      });

    if (query.type) {
      qb.andWhere('a.type = :type', { type: query.type });
    }

    const [items, total] = await qb
      .orderBy('a.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, total };
  }

  async findOne(id: string, user: AuthUser): Promise<AIAgentEntity> {
    const agent = await this.agentRepo.findOne({ where: { id, isActive: true } });
    if (!agent) throw new NotFoundException('Agent not found');
    if (agent.tenantId && agent.tenantId !== user.currentTenantId) {
      throw new NotFoundException('Agent not found');
    }
    return agent;
  }

  async update(id: string, dto: UpdateAgentDto, user: AuthUser): Promise<AIAgentEntity> {
    const agent = await this.findOne(id, user);
    if (dto.name !== undefined) agent.name = dto.name;
    if (dto.description !== undefined) agent.description = dto.description ?? null;
    if (dto.type !== undefined) agent.type = dto.type;
    if (dto.config !== undefined) agent.config = { ...agent.config, ...dto.config };
    if (dto.capabilities !== undefined) agent.capabilities = dto.capabilities;
    if (dto.isActive !== undefined) agent.isActive = dto.isActive;
    return this.agentRepo.save(agent);
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const agent = await this.findOne(id, user);
    if (agent.id.startsWith('builtin-')) {
      agent.isActive = false;
      await this.agentRepo.save(agent);
      return;
    }
    await this.agentRepo.remove(agent);
  }

  async createSession(
    agentId: string,
    user: AuthUser,
    documentId?: string,
  ): Promise<AIAgentSessionEntity> {
    await this.findOne(agentId, user);
    const session = this.sessionRepo.create({
      id: uuidv4(),
      userId: user.userId,
      agentId,
      documentId: documentId ?? null,
      messages: [],
      metadata: {},
      status: 'active',
    });
    return this.sessionRepo.save(session);
  }

  async getSessions(
    agentId: string,
    query: ListSessionDto,
    user: AuthUser,
  ): Promise<{ items: AIAgentSessionEntity[]; total: number }> {
    await this.findOne(agentId, user);
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const [items, total] = await this.sessionRepo.findAndCount({
      where: { agentId, userId: user.userId },
      skip: (page - 1) * limit,
      take: limit,
      order: { updatedAt: 'DESC' },
    });
    return { items, total };
  }

  async chat(agentId: string, dto: ChatDto, user: AuthUser): Promise<ChatMessage> {
    const agent = await this.findOne(agentId, user);

    let session: AIAgentSessionEntity | null = null;
    if (dto.sessionId) {
      session = await this.sessionRepo.findOne({
        where: { id: dto.sessionId, agentId, userId: user.userId },
      });
    }
    if (!session) {
      session = await this.createSession(agentId, user, dto.documentId);
    }

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: dto.content,
      timestamp: new Date().toISOString(),
    };
    session.messages = [...(session.messages ?? []), userMessage];

    const assistantMessage = await this.executor.execute(agent, session.messages, {
      documentId: dto.documentId ?? session.documentId ?? undefined,
      tools: dto.tools,
      tenantId: user.currentTenantId,
      userId: user.userId,
      source: 'chat',
    });

    session.messages.push(assistantMessage);
    if (dto.documentId) session.documentId = dto.documentId;
    await this.sessionRepo.save(session);

    return assistantMessage;
  }

  async *chatStream(
    agentId: string,
    dto: ChatDto,
    user: AuthUser,
  ): AsyncGenerator<{ type: string; data: unknown }> {
    const agent = await this.findOne(agentId, user);

    let session: AIAgentSessionEntity | null = null;
    if (dto.sessionId) {
      session = await this.sessionRepo.findOne({
        where: { id: dto.sessionId, agentId, userId: user.userId },
      });
    }
    if (!session) {
      session = await this.createSession(agentId, user, dto.documentId);
    }

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: dto.content,
      timestamp: new Date().toISOString(),
    };
    session.messages = [...(session.messages ?? []), userMessage];

    yield { type: 'session', data: { sessionId: session.id } };

    let assistantMessage: ChatMessage | undefined;
    for await (const chunk of this.executor.executeStream(agent, session.messages, {
      documentId: dto.documentId ?? session.documentId ?? undefined,
      tenantId: user.currentTenantId,
      userId: user.userId,
      source: 'stream',
    })) {
      if (chunk.type === 'delta') {
        yield { type: 'delta', data: { content: chunk.content } };
      } else if (chunk.type === 'done' && chunk.message) {
        assistantMessage = chunk.message;
      }
    }

    if (assistantMessage) {
      session.messages.push(assistantMessage);
      if (dto.documentId) session.documentId = dto.documentId;
      await this.sessionRepo.save(session);
      yield { type: 'done', data: assistantMessage };
    }
  }
}
