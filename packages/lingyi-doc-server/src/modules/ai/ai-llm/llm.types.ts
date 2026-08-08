export interface LLMChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  toolCalls?: LLMToolCall[];
  toolCallId?: string;
}

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMRequest {
  model?: string;
  messages: LLMChatMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: unknown[];
  toolChoice?: 'auto' | 'none' | 'required';
  stream?: boolean;
}

export interface LLMResponse {
  id: string;
  content: string;
  toolCalls?: LLMToolCall[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: 'stop' | 'tool_calls' | 'length';
}

export interface LLMStreamChunk {
  id: string;
  delta: string;
  toolCalls?: LLMToolCall[];
  finished: boolean;
}

export interface LLMProvider {
  chat(request: LLMRequest): Promise<LLMResponse>;
  chatStream(request: LLMRequest): AsyncGenerator<LLMStreamChunk>;
}

export interface LLMUsageContext {
  userId?: string;
  tenantId?: string | null;
  agentId?: string;
  source?: 'chat' | 'stream' | 'embed';
}
