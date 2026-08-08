import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { AlibabaProvider } from './providers/alibaba.provider';
import type { LLMProvider } from './llm.types';

@Injectable()
export class LLMRouter {
  private readonly providers = new Map<string, LLMProvider>();
  private readonly fallbackMap = new Map<string, string>();
  private readonly configuredModels: string[];

  constructor(private readonly config: ConfigService) {
    this.configuredModels = this.config.get<string[]>('ai.models') ?? [];
    this.initProviders();
  }

  private initProviders(): void {
    if (this.config.get<string>('ai.openai.apiKey')) {
      this.providers.set('openai', new OpenAIProvider(this.config));
    }
    if (this.config.get<string>('ai.anthropic.apiKey')) {
      this.providers.set('anthropic', new AnthropicProvider(this.config));
    }
    if (this.config.get<string>('ai.alibaba.apiKey')) {
      this.providers.set('alibaba', new AlibabaProvider(this.config));
    }

    const fallbackRaw = process.env.LLM_FALLBACK_MODELS || '';
    for (const pair of fallbackRaw.split(',')) {
      const [from, to] = pair.split(':').map((item) => item.trim());
      if (from && to) this.fallbackMap.set(from, to);
    }

    // 未显式配置降级链时，按模型列表顺序自动串联
    if (this.fallbackMap.size === 0 && this.configuredModels.length > 1) {
      for (let i = 0; i < this.configuredModels.length - 1; i += 1) {
        this.fallbackMap.set(this.configuredModels[i], this.configuredModels[i + 1]);
      }
    }
  }

  getAvailableModels(): string[] {
    if (this.configuredModels.length > 0) return this.configuredModels;
    const defaultModel = this.config.get<string>('ai.defaultModel', 'deepseek-v4-flash');
    return [defaultModel];
  }

  getProvider(model?: string): LLMProvider {
    const providerName = this.getProviderName(model);
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`LLM provider not configured for model: ${model ?? 'default'}`);
    }
    return provider;
  }

  getFallbackModel(model: string): string | null {
    return this.fallbackMap.get(model) ?? null;
  }

  private getProviderName(model?: string): string {
    if (!model) {
      return this.config.get<string>('ai.defaultProvider', 'openai');
    }
    if (model.startsWith('gpt-')) return 'openai';
    if (model.startsWith('claude-')) return 'anthropic';
    if (model.startsWith('qwen-') && !model.includes('/')) return 'alibaba';
    // 自定义网关模型（deepseek / kimi / MiniMax / glm / bailian/* 等）统一走 OpenAI 兼容接口
    if (this.providers.has('openai')) return 'openai';
    return this.config.get<string>('ai.defaultProvider', 'openai');
  }
}
