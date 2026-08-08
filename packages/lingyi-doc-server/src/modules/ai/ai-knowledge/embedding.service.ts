import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsageMeterService } from '../ai-llm/usage-meter.service';
import type { LLMUsageContext } from '../ai-llm/llm.types';

export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly usageMeter: UsageMeterService,
  ) {}

  async embed(text: string, usageCtx?: LLMUsageContext): Promise<EmbeddingResult> {
    const provider = this.config.get<string>('ai.embedding.provider', 'openai');
    const start = Date.now();
    let model = '';
    try {
      let result: EmbeddingResult;
      switch (provider) {
        case 'openai':
          model = this.config.get<string>('ai.embedding.model', 'text-embedding-3-small');
          result = await this.embedWithOpenAI(text);
          break;
        case 'alibaba':
          model = this.config.get<string>('ai.embedding.alibabaModel', 'text-embedding-v2');
          result = await this.embedWithDashScope(text);
          break;
        default:
          throw new Error(`Unsupported embedding provider: ${provider}`);
      }
      await this.usageMeter.logUsage(
        model,
        {
          promptTokens: result.tokenCount,
          completionTokens: 0,
          totalTokens: result.tokenCount,
        },
        Date.now() - start,
        { ...usageCtx, source: 'embed' },
      );
      return result;
    } catch (err) {
      if (model) {
        await this.usageMeter.logUsage(
          model,
          { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          Date.now() - start,
          { ...usageCtx, source: 'embed' },
          'error',
        );
      }
      throw err;
    }
  }

  async embedBatch(texts: string[], usageCtx?: LLMUsageContext): Promise<EmbeddingResult[]> {
    return Promise.all(texts.map((text) => this.embed(text, usageCtx)));
  }

  cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dotProduct / denom;
  }

  private async embedWithOpenAI(text: string): Promise<EmbeddingResult> {
    const apiKey = this.config.get<string>('ai.openai.apiKey', '');
    const model = this.config.get<string>('ai.embedding.model', 'text-embedding-3-small');
    const baseUrl = this.config.get<string>('ai.openai.baseUrl', 'https://llm.dtzhejiang.com/v1');

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: text }),
    });

    const data = await response.json() as {
      error?: { message: string };
      data: Array<{ embedding: number[] }>;
      usage?: { total_tokens: number };
    };

    if (data.error) throw new Error(data.error.message);
    if (!response.ok) throw new Error(`OpenAI embedding error: ${response.status}`);

    return {
      embedding: data.data[0].embedding,
      tokenCount: data.usage?.total_tokens ?? 0,
    };
  }

  private async embedWithDashScope(text: string): Promise<EmbeddingResult> {
    const apiKey = this.config.get<string>('ai.alibaba.apiKey', '');
    const model = this.config.get<string>('ai.embedding.alibabaModel', 'text-embedding-v2');

    const response = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, input: { texts: [text] } }),
      },
    );

    const data = await response.json() as {
      code?: string;
      message?: string;
      output?: { embeddings: Array<{ embedding: number[] }> };
      usage?: { total_tokens: number };
    };

    if (data.code) throw new Error(data.message ?? data.code);
    if (!response.ok) throw new Error(`DashScope embedding error: ${response.status}`);

    return {
      embedding: data.output!.embeddings[0].embedding,
      tokenCount: data.usage?.total_tokens ?? 0,
    };
  }
}
