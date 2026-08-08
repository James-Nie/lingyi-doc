import type { ConfigService } from '@nestjs/config';
import type { LLMProvider, LLMRequest, LLMResponse, LLMStreamChunk } from '../llm.types';

export class AnthropicProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('ai.anthropic.apiKey', '');
    this.baseUrl = config.get<string>('ai.anthropic.baseUrl', 'https://api.anthropic.com/v1');
  }

  private toAnthropicMessages(messages: LLMRequest['messages']) {
    const system = messages.find((m) => m.role === 'system')?.content || '';
    const rest = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content || '',
      }));
    return { system, messages: rest };
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const { system, messages } = this.toAnthropicMessages(request.messages);

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        system,
        messages,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature,
      }),
    });

    const data = await response.json() as {
      error?: { message: string };
      id: string;
      model: string;
      usage?: { input_tokens: number; output_tokens: number };
      content: Array<{ type: string; text?: string }>;
      stop_reason: string;
    };

    if (data.error) throw new Error(data.error.message);
    if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);

    const text = data.content.find((c) => c.type === 'text')?.text || '';
    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;

    return {
      id: data.id,
      content: text,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      model: data.model,
      finishReason: data.stop_reason === 'end_turn' ? 'stop' : 'length',
    };
  }

  async *chatStream(request: LLMRequest): AsyncGenerator<LLMStreamChunk> {
    const { system, messages } = this.toAnthropicMessages(request.messages);

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        system,
        messages,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Anthropic stream error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let messageId = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(line.slice(6)) as {
            type: string;
            message?: { id: string };
            delta?: { type: string; text?: string };
          };
          if (parsed.type === 'message_start' && parsed.message) {
            messageId = parsed.message.id;
          }
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            yield {
              id: messageId,
              delta: parsed.delta.text,
              finished: false,
            };
          }
          if (parsed.type === 'message_stop') {
            yield { id: messageId, delta: '', finished: true };
            return;
          }
        } catch {
          // skip malformed chunks
        }
      }
    }
  }
}
