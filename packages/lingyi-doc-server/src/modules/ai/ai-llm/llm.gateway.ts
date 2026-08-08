import { Injectable, Logger } from '@nestjs/common';
import { LLMRouter } from './llm.router';
import { AiConfigService } from '../ai-config.service';
import { UsageMeterService } from './usage-meter.service';
import type {
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  LLMUsageContext,
} from './llm.types';

@Injectable()
export class LLMGateway {
  private readonly logger = new Logger(LLMGateway.name);

  constructor(
    private readonly router: LLMRouter,
    private readonly aiConfigService: AiConfigService,
    private readonly usageMeter: UsageMeterService,
  ) {}

  async chat(request: LLMRequest, usageCtx?: LLMUsageContext): Promise<LLMResponse> {
    const model = request.model || await this.aiConfigService.getDefaultModel();
    const start = Date.now();

    this.logger.log(`Chat request to model: ${model}`);

    try {
      const provider = this.router.getProvider(model);
      const response = await provider.chat({ ...request, model });
      await this.usageMeter.logUsage(model, response.usage, Date.now() - start, usageCtx);
      return response;
    } catch (error) {
      const fallbackModel = this.router.getFallbackModel(model);
      if (fallbackModel) {
        this.logger.warn(`Trying fallback model: ${fallbackModel}`);
        return this.chat({ ...request, model: fallbackModel }, usageCtx);
      }
      await this.usageMeter.logUsage(
        model,
        { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        Date.now() - start,
        usageCtx,
        'error',
      );
      throw error;
    }
  }

  async *chatStream(
    request: LLMRequest,
    usageCtx?: LLMUsageContext,
  ): AsyncGenerator<LLMStreamChunk> {
    const model = request.model || await this.aiConfigService.getDefaultModel();
    const provider = this.router.getProvider(model);
    const start = Date.now();
    let totalTokens = 0;

    for await (const chunk of provider.chatStream({ ...request, model, stream: true })) {
      if (chunk.delta) totalTokens += Math.ceil(chunk.delta.length / 4);
      yield chunk;
    }

    await this.usageMeter.logUsage(
      model,
      { promptTokens: 0, completionTokens: totalTokens, totalTokens },
      Date.now() - start,
      { ...usageCtx, source: usageCtx?.source ?? 'stream' },
    );
  }
}
