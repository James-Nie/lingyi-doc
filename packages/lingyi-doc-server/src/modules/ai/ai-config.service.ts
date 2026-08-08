import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SystemConfigRepository } from '../../repositories/system-config.repository';

export interface AiModelConfig {
  enabled: boolean;
  defaultModel: string;
  models: string[];
  defaultProvider: string;
  gateway: {
    baseUrl: string;
    apiKeyConfigured: boolean;
    apiKeyPreview: string | null;
  };
  embedding: {
    provider: string;
    model: string;
  };
  source: 'env' | 'database';
}

export interface UpdateAiModelConfigDto {
  enabled?: boolean;
  defaultModel?: string;
  models?: string[];
}

@Injectable()
export class AiConfigService {
  constructor(
    private readonly config: ConfigService,
    private readonly systemConfigRepository: SystemConfigRepository,
  ) {}

  private maskApiKey(key: string): string | null {
    if (!key) return null;
    if (key.length <= 8) return '****';
    return `${key.slice(0, 4)}****${key.slice(-4)}`;
  }

  async isEnabled(): Promise<boolean> {
    const dbValue = await this.systemConfigRepository.getValue<boolean | null>('ai.enabled', null);
    if (dbValue !== null) return Boolean(dbValue);
    return this.config.get<boolean>('ai.enabled', true);
  }

  async getDefaultModel(): Promise<string> {
    const dbValue = await this.systemConfigRepository.getValue<string | null>('ai.default_model', null);
    if (dbValue) return dbValue;
    return this.config.get<string>('ai.defaultModel', 'deepseek-v4-flash');
  }

  async getModels(): Promise<string[]> {
    const dbValue = await this.systemConfigRepository.getValue<string[] | null>('ai.models', null);
    if (dbValue && dbValue.length > 0) return dbValue;
    const envModels = this.config.get<string[]>('ai.models') ?? [];
    if (envModels.length > 0) return envModels;
    return [await this.getDefaultModel()];
  }

  async getConfigForAdmin(): Promise<AiModelConfig> {
    const dbEnabled = await this.systemConfigRepository.get('ai.enabled');
    const dbDefaultModel = await this.systemConfigRepository.get('ai.default_model');
    const dbModels = await this.systemConfigRepository.get('ai.models');

    const enabled = await this.isEnabled();
    const defaultModel = await this.getDefaultModel();
    const models = await this.getModels();
    const apiKey = this.config.get<string>('ai.openai.apiKey', '');

    return {
      enabled,
      defaultModel,
      models,
      defaultProvider: this.config.get<string>('ai.defaultProvider', 'openai'),
      gateway: {
        baseUrl: this.config.get<string>('ai.openai.baseUrl', ''),
        apiKeyConfigured: Boolean(apiKey),
        apiKeyPreview: this.maskApiKey(apiKey),
      },
      embedding: {
        provider: this.config.get<string>('ai.embedding.provider', 'openai'),
        model: this.config.get<string>('ai.embedding.model', 'text-embedding-3-small'),
      },
      source: dbEnabled || dbDefaultModel || dbModels ? 'database' : 'env',
    };
  }

  async updateConfig(dto: UpdateAiModelConfigDto, updatedBy: string): Promise<AiModelConfig> {
    if (dto.enabled !== undefined) {
      await this.systemConfigRepository.set(
        'ai.enabled',
        dto.enabled,
        updatedBy,
        '是否启用 AI 模块',
      );
    }

    if (dto.models !== undefined) {
      const cleaned = dto.models.map((m) => m.trim()).filter(Boolean);
      await this.systemConfigRepository.set(
        'ai.models',
        cleaned,
        updatedBy,
        '可用 LLM 模型列表',
      );
    }

    if (dto.defaultModel !== undefined) {
      const model = dto.defaultModel.trim();
      if (model) {
        await this.systemConfigRepository.set(
          'ai.default_model',
          model,
          updatedBy,
          '默认 LLM 模型',
        );
      }
    }

    return this.getConfigForAdmin();
  }
}
