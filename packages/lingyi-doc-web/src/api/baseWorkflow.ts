/**
 * 多维表工作流前端 API 客户端
 * 类型定义统一来自 @lingyi-doc/core-sheet，此处仅保留 API 层（authFetch 封装）。
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
  type WorkflowData,
  type WorkflowInstance,
  type CreateWorkflowInput,
  type UpdateWorkflowInput,
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
  WorkflowData,
  WorkflowInstance,
  CreateWorkflowInput,
  UpdateWorkflowInput,
  NodeTypeMeta,
} from '@lingyi-doc/core-sheet';

// ==================== API 客户端 ====================

const BASE = '/api/v1/c/base';

export const baseWorkflowApi = {
  list: async (tableId: string, status?: string): Promise<{ items: WorkflowData[]; total: number }> => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return authFetch(`${BASE}/tables/${tableId}/workflows${qs}`);
  },

  create: async (tableId: string, input: CreateWorkflowInput): Promise<WorkflowData> => {
    return authFetch(`${BASE}/tables/${tableId}/workflows`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  get: async (id: string): Promise<WorkflowData> => {
    return authFetch(`${BASE}/workflows/${id}`);
  },

  update: async (id: string, input: UpdateWorkflowInput): Promise<WorkflowData> => {
    return authFetch(`${BASE}/workflows/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  publish: async (id: string): Promise<WorkflowData> => {
    return authFetch(`${BASE}/workflows/${id}/publish`, { method: 'POST' });
  },

  disable: async (id: string): Promise<WorkflowData> => {
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
