/**
 * 多维表工作流前端 API 客户端
 * 类型定义已迁移至 @lingyi-doc/core-sheet，此处仅保留 API 层。
 */
import { authFetch } from '../stores/authStore';
import {
  NODE_TYPE_CATALOG,
  getNodeMeta,
  type WorkflowNodeType,
  type WorkflowNode,
  type WorkflowEdge,
  type Condition,
  type ConditionGroup,
  type NodeExecution,
  type WorkflowInstance,
} from '@lingyi-doc/core-sheet';

// 重新导出共享类型（向后兼容）
export {
  NODE_TYPE_CATALOG,
  getNodeMeta,
};
export type {
  WorkflowNodeType,
  WorkflowNode,
  WorkflowEdge,
  Condition,
  ConditionGroup,
  NodeExecution,
  WorkflowInstance,
  NodeTypeMeta,
} from '@lingyi-doc/core-sheet';

// ==================== API 专用类型 ====================

/** API 返回的工作流对象（与 WorkflowData 对应，variables 为 any[] 格式） */
export interface Workflow {
  id: string;
  name: string;
  description?: string | null;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: unknown[];
  status: 'draft' | 'published' | 'disabled';
  tenantId?: string | null;
  docId?: string | null;
  tableId?: string | null;
  triggerType?: string | null;
  triggerFilter?: ConditionGroup | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  docId?: string;
  tableId: string;
  triggerType?: string;
  triggerFilter?: ConditionGroup | null;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  triggerType?: string;
  triggerFilter?: ConditionGroup | null;
  status?: string;
}

// ==================== API 客户端 ====================

const BASE = '/api/v1/c/base';

export const baseWorkflowApi = {
  list: async (tableId: string, status?: string): Promise<{ items: Workflow[]; total: number }> => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return authFetch(`${BASE}/tables/${tableId}/workflows${qs}`);
  },

  create: async (tableId: string, input: CreateWorkflowInput): Promise<Workflow> => {
    return authFetch(`${BASE}/tables/${tableId}/workflows`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  get: async (id: string): Promise<Workflow> => {
    return authFetch(`${BASE}/workflows/${id}`);
  },

  update: async (id: string, input: UpdateWorkflowInput): Promise<Workflow> => {
    return authFetch(`${BASE}/workflows/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  publish: async (id: string): Promise<Workflow> => {
    return authFetch(`${BASE}/workflows/${id}/publish`, { method: 'POST' });
  },

  disable: async (id: string): Promise<Workflow> => {
    return authFetch(`${BASE}/workflows/${id}/disable`, { method: 'POST' });
  },

  trigger: async (id: string, variables: Record<string, unknown> = {}): Promise<WorkflowInstance> => {
    return authFetch(`${BASE}/workflows/${id}/trigger`, {
      method: 'POST',
      body: JSON.stringify({ variables }),
    });
  },

  listRuns: async (id: string): Promise<WorkflowInstance[]> => {
    return authFetch(`${BASE}/workflows/${id}/runs`);
  },

  getRun: async (instanceId: string): Promise<WorkflowInstance> => {
    return authFetch(`${BASE}/workflows/runs/${instanceId}`);
  },
};
