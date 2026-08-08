import type { ConfigService } from '@nestjs/config';
import type { LLMProvider, LLMRequest, LLMResponse, LLMStreamChunk } from '../llm.types';

export class OpenAIProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('ai.openai.apiKey', '');
    this.baseUrl = config.get<string>('ai.openai.baseUrl', 'https://api.openai.com/v1');
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        tools: request.tools,
        tool_choice: request.toolChoice,
      }),
    });

    const data = await response.json() as {
      error?: { message: string };
      id: string;
      model: string;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      choices: Array<{
        finish_reason: LLMResponse['finishReason'];
        message: { content?: string; tool_calls?: LLMResponse['toolCalls'] };
      }>;
    };

    if (data.error) throw new Error(data.error.message);
    if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);

    const choice = data.choices[0];
    return {
      id: data.id,
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      model: data.model,
      finishReason: choice.finish_reason,
    };
  }

  async *chatStream(request: LLMRequest): AsyncGenerator<LLMStreamChunk> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        tools: request.tools,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`OpenAI stream error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data) as {
            id: string;
            choices: Array<{
              delta: { content?: string; tool_calls?: LLMResponse['toolCalls'] };
              finish_reason: string | null;
            }>;
          };
          const choice = parsed.choices[0];
          yield {
            id: parsed.id,
            delta: choice.delta.content || '',
            toolCalls: choice.delta.tool_calls,
            finished: choice.finish_reason !== null,
          };
        } catch {
          // skip malformed chunks
        }
      }
    }
  }
}
