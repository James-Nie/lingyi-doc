/**
 * 工作流节点元数据注册表（前端单一事实源）
 *
 * - NodeTypeMeta：节点类型/展示/默认配置/分支端点（兼容旧 nodeCatalog 形态）
 * - configFields：配置 Schema，驱动通用配置表单自动渲染
 * - 支持运行时 registerNodeMeta() 增量注册：新增节点无需改动编辑器核心
 */
import type { WorkflowNodeType } from './types';

export type WorkflowValueType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'tags'
  | 'secret'
  | 'field-select'
  | 'multi-field-select'
  | 'table-select'
  | 'condition-group'
  | 'field-map';

export interface NodeConfigField {
  key: string;
  label: string;
  type: WorkflowValueType;
  required?: boolean;
  description?: string;
  placeholder?: string;
  default?: unknown;
  options?: Array<{ value: string; label: string }>;
  secret?: boolean;
  /** 条件显示：仅当 config[onlyFor.key] === onlyFor.value 时渲染 */
  onlyFor?: { key: string; value: unknown };
}

export interface NodeTypeMeta {
  type: WorkflowNodeType;
  label: string;
  category: 'common' | 'feishu' | 'dingtalk' | 'ai' | 'shortcut' | 'integration';
  icon: string;
  color: string;
  description?: string;
  defaultConfig?: Record<string, unknown>;
  branches?: Array<{ key: string; label: string }>;
  /** 触发器分组（仅 trigger 节点）：table / todo / tool */
  triggerGroup?: 'table' | 'todo' | 'tool';
  /** async：需要结果回调续跑 */
  kind?: 'sync' | 'async';
  /** 配置 Schema：驱动通用配置表单 */
  configFields?: NodeConfigField[];
  /** 「输出」页签数据 */
  outputs?: Array<{ key: string; description: string }>;
  /** 「输入」页签数据 */
  inputs?: Array<{ key: string; description: string }>;
}

const registry: NodeTypeMeta[] = [];

/** 运行时注册节点元数据（插件入口）；同类型覆盖 */
export function registerNodeMeta(meta: NodeTypeMeta): void {
  const idx = registry.findIndex((m) => m.type === meta.type);
  if (idx >= 0) registry[idx] = meta;
  else registry.push(meta);
}

/** 注册一批（内置目录初始化用） */
export function seedNodeMetaCatalog(metas: NodeTypeMeta[]): void {
  for (const m of metas) registerNodeMeta(m);
}

export function listNodeMetas(): NodeTypeMeta[] {
  return [...registry];
}

export function getNodeMeta(type: WorkflowNodeType): NodeTypeMeta | undefined {
  return registry.find((m) => m.type === type);
}
