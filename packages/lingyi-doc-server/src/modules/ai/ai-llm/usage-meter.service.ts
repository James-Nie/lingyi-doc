import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AILLMUsageLogEntity } from '../entities/ai-llm-usage-log.entity';
import type { LLMUsageContext } from './llm.types';

type TokenUsage = { promptTokens: number; completionTokens: number; totalTokens: number };

/** 统一 AI 用量落账（chat / stream / embed） */
@Injectable()
export class UsageMeterService {
  private readonly logger = new Logger(UsageMeterService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(AILLMUsageLogEntity)
    private readonly usageLogRepo: Repository<AILLMUsageLogEntity>,
  ) {}

  estimateCostUsd(model: string, usage: TokenUsage, kind: 'chat' | 'embed' = 'chat'): string {
    const rates = this.config.get<Record<string, {
      inputPer1k?: number;
      outputPer1k?: number;
      per1k?: number;
    }>>('ai.pricing', {});
    const rate = rates[model] ?? rates['*'] ?? {
      inputPer1k: 0.00015,
      outputPer1k: 0.0006,
      per1k: 0.00002,
    };

    if (kind === 'embed') {
      const per1k = rate.per1k ?? rate.inputPer1k ?? 0.00002;
      return ((usage.totalTokens / 1000) * per1k).toFixed(6);
    }

    const input = (usage.promptTokens / 1000) * (rate.inputPer1k ?? 0);
    const output = (usage.completionTokens / 1000) * (rate.outputPer1k ?? 0);
    return (input + output).toFixed(6);
  }

  async logUsage(
    model: string,
    usage: TokenUsage,
    latency: number,
    ctx?: LLMUsageContext,
    status = 'success',
  ): Promise<void> {
    const kind = ctx?.source === 'embed' ? 'embed' : 'chat';
    try {
      await this.usageLogRepo.save({
        id: uuidv4(),
        userId: ctx?.userId ?? null,
        tenantId: ctx?.tenantId ?? null,
        agentId: ctx?.agentId ?? null,
        source: ctx?.source ?? 'chat',
        model,
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        cost: this.estimateCostUsd(model, usage, kind),
        latency,
        status,
      });
    } catch (err) {
      this.logger.warn(`Failed to log LLM usage: ${(err as Error).message}`);
    }
  }
}
