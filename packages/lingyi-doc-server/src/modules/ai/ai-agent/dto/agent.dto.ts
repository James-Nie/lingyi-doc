import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import type { AgentConfig } from '../../entities/ai.types';

export class AgentConfigDto implements AgentConfig {
  @IsString()
  model!: string;

  @IsNumber()
  @Min(0)
  @Max(2)
  temperature!: number;

  @IsNumber()
  @Min(1)
  maxTokens!: number;

  @IsString()
  systemPrompt!: string;

  @IsArray()
  @IsString({ each: true })
  tools!: string[];

  @IsOptional()
  @IsString()
  knowledgeBaseId?: string;

  @IsOptional()
  @IsString()
  workflowId?: string;
}

export class CreateAgentDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  type!: string;

  config!: AgentConfigDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  config?: Partial<AgentConfigDto>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ChatDto {
  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tools?: string[];
}

export class ListAgentDto {
  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsString()
  type?: string;
}

export class ListSessionDto {
  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;
}

export class CreateSessionDto {
  @IsOptional()
  @IsString()
  documentId?: string;
}
