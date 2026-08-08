import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { LLMGateway } from '../ai-llm/llm.gateway';
import { AgentTools, type ToolExecutionContext } from './agent.tools';
import { DocumentContextService } from './document-context.service';
import type { AIAgentEntity } from '../entities/ai-agent.entity';
import type { ChatMessage } from '../entities/ai.types';
import type { LLMChatMessage, LLMToolCall, LLMResponse } from '../ai-llm/llm.types';

export interface ExecutionContext extends ToolExecutionContext {
  tools?: string[];
  source?: 'chat' | 'stream';
}

const MAX_TOOL_ROUNDS = 5;

@Injectable()
export class AgentExecutor {
  constructor(
    private readonly llmGateway: LLMGateway,
    private readonly tools: AgentTools,
    private readonly documentContext: DocumentContextService,
  ) {}

  async execute(
    agent: AIAgentEntity,
    messages: ChatMessage[],
    context: ExecutionContext,
  ): Promise<ChatMessage> {
    const llmMessages = await this.toLlmMessages(agent, messages, context);
    const availableTools = this.tools.getToolDefinitions(
      context.tools ?? agent.config.tools,
    );

    let response = await this.llmGateway.chat(
      {
        model: agent.config.model,
        messages: llmMessages,
        temperature: agent.config.temperature,
        maxTokens: agent.config.maxTokens,
        tools: availableTools.length > 0 ? availableTools : undefined,
      },
      {
        userId: context.userId,
        tenantId: context.tenantId,
        agentId: agent.id,
        source: context.source ?? 'chat',
      },
    );

    let rounds = 0;
    let documentUpdated = false;
    while (response.toolCalls?.length && rounds < MAX_TOOL_ROUNDS) {
      rounds += 1;
      const toolResult = await this.handleToolCalls(agent, llmMessages, response.toolCalls, context);
      response = toolResult.response;
      documentUpdated = documentUpdated || toolResult.documentUpdated;
    }

    return {
      id: uuidv4(),
      role: 'assistant',
      content: response.content,
      timestamp: new Date().toISOString(),
      tokenUsage: {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
      },
      metadata: documentUpdated ? { documentUpdated: true, documentId: context.documentId } : undefined,
    };
  }

  async *executeStream(
    agent: AIAgentEntity,
    messages: ChatMessage[],
    context: ExecutionContext,
  ): AsyncGenerator<{ type: 'delta' | 'done'; content?: string; message?: ChatMessage }> {
    // 绑定文档时需要工具写回，走非流式执行
    if (context.documentId) {
      const message = await this.execute(agent, messages, {
        ...context,
        source: 'stream',
      });
      if (message.content) {
        yield { type: 'delta', content: message.content };
      }
      yield { type: 'done', message };
      return;
    }

    const llmMessages = await this.toLlmMessages(agent, messages, context);

    let fullContent = '';
    for await (const chunk of this.llmGateway.chatStream(
      {
        model: agent.config.model,
        messages: llmMessages,
        temperature: agent.config.temperature,
        maxTokens: agent.config.maxTokens,
      },
      {
        userId: context.userId,
        tenantId: context.tenantId,
        agentId: agent.id,
        source: context.source ?? 'stream',
      },
    )) {
      if (chunk.delta) {
        fullContent += chunk.delta;
        yield { type: 'delta', content: chunk.delta };
      }
      if (chunk.finished) break;
    }

    const message: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: fullContent,
      timestamp: new Date().toISOString(),
    };
    yield { type: 'done', message };
  }

  private async toLlmMessages(
    agent: AIAgentEntity,
    messages: ChatMessage[],
    context: ExecutionContext,
  ): Promise<LLMChatMessage[]> {
    let systemPrompt = agent.config.systemPrompt;

    if (context.documentId) {
      const docCtx = await this.documentContext.load(context.documentId);
      if (docCtx) {
        systemPrompt = `${systemPrompt}\n\n${this.documentContext.formatForPrompt(docCtx)}`;
      } else {
        systemPrompt = `${systemPrompt}\n\n当前绑定的文档ID为 ${context.documentId}，但未能读取文档内容，请先调用 read_document。`;
      }
    }

    const systemMessage: LLMChatMessage = {
      role: 'system',
      content: systemPrompt,
    };

    const converted = messages.map((m) => ({
      role: m.role,
      content: m.content,
    })) as LLMChatMessage[];

    return [systemMessage, ...converted];
  }

  private async handleToolCalls(
    agent: AIAgentEntity,
    llmMessages: LLMChatMessage[],
    toolCalls: LLMToolCall[],
    context: ExecutionContext,
  ): Promise<{ response: LLMResponse; documentUpdated: boolean }> {
    let documentUpdated = false;

    llmMessages.push({
      role: 'assistant',
      content: '',
      toolCalls,
    });

    for (const toolCall of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
      } catch {
        args = {};
      }

      if (context.documentId && !args.documentId) {
        args.documentId = context.documentId;
      }

      let result: unknown;
      try {
        result = await this.tools.executeTool(toolCall.function.name, args, context);
      } catch (err) {
        result = { error: (err as Error).message };
      }

      if (
        toolCall.function.name === 'write_document'
        && typeof result === 'object'
        && result !== null
        && (result as { success?: boolean }).success
      ) {
        documentUpdated = true;
      }

      llmMessages.push({
        role: 'tool',
        content: JSON.stringify(result),
        toolCallId: toolCall.id,
      });
    }

    const availableTools = this.tools.getToolDefinitions(agent.config.tools);

    const response = await this.llmGateway.chat(
      {
        model: agent.config.model,
        messages: llmMessages,
        temperature: agent.config.temperature,
        maxTokens: agent.config.maxTokens,
        tools: availableTools.length > 0 ? availableTools : undefined,
      },
      {
        userId: context.userId,
        tenantId: context.tenantId,
        agentId: agent.id,
        source: context.source ?? 'chat',
      },
    );

    return { response, documentUpdated };
  }
}
