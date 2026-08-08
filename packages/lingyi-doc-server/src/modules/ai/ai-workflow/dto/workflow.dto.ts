import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowTriggerFilter,
  WorkflowVariable,
} from '../../entities/ai.types';

export class CreateWorkflowDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  nodes?: WorkflowNode[];

  @IsOptional()
  @IsArray()
  edges?: WorkflowEdge[];

  @IsOptional()
  @IsArray()
  variables?: WorkflowVariable[];

  @IsOptional()
  @IsString()
  docId?: string;

  @IsOptional()
  @IsString()
  tableId?: string;

  @IsOptional()
  @IsString()
  triggerType?: string;

  @IsOptional()
  triggerFilter?: WorkflowTriggerFilter;
}

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  nodes?: WorkflowNode[];

  @IsOptional()
  @IsArray()
  edges?: WorkflowEdge[];

  @IsOptional()
  @IsArray()
  variables?: WorkflowVariable[];

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  triggerType?: string;

  @IsOptional()
  triggerFilter?: WorkflowTriggerFilter | null;
}

export class ExecuteWorkflowDto {
  variables?: Record<string, unknown>;
}

export class ListWorkflowDto {
  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  docId?: string;

  @IsOptional()
  @IsString()
  tableId?: string;
}
