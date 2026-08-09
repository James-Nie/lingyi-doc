/**
 * 工作流编辑器 - 嵌入式组件
 * 不依赖 react-router，通过 props 接收 tableId/workflowId，
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Spin, message, Modal } from 'antd';
import { WorkflowCanvas, NodeConfigPanel, RunHistoryDrawer, WorkflowTopBar } from '@lingyi-doc/editor-sheet';
import type { CanvasNode, CanvasEdge, FieldOption, TableOption } from '@lingyi-doc/editor-sheet';
import {
  baseWorkflowApi,
  getNodeMeta,
  type Workflow,
  type WorkflowEdge,
  type WorkflowNode,
} from '../../api/baseWorkflow';
import { type WorkflowInstance, type ConditionGroup, type Condition, computeWorkflowLayout, reconnectEdgesAfterDelete } from '@lingyi-doc/core-sheet';
import '../../components/baseWorkflow/workflow-editor.css';

function uuidv4(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 从 trigger 节点 config 提取标准条件组 {op, conditions[]}，供 triggerFilter 落库 */
function extractTriggerFilter(config: Record<string, unknown> | undefined): ConditionGroup | null {
  if (!config || typeof config !== 'object') return null;
  const isGroup = (v: unknown): v is { op: string; conditions: unknown[] } =>
    !!v && typeof v === 'object'
    && (v as { op?: unknown }).op != null
    && Array.isArray((v as { conditions?: unknown }).conditions);
  const cand = isGroup(config) ? config
    : isGroup(config.filter) ? (config.filter as Record<string, unknown>)
    : isGroup(config.conditions) ? (config.conditions as Record<string, unknown>)
    : null;
  if (!cand) return null;
  return { op: cand.op === 'or' ? 'or' : 'and', conditions: cand.conditions as Condition[] };
}

export interface WorkflowEditorEmbedProps {
  tableId: string;
  /** 文档 ID - 必需，用于获取字段列表 */
  docId: string;
  /** workflowId 为空/undefined 表示新建 */
  workflowId?: string;
  /** 新建工作流保存成功后回调 */
  onWorkflowCreated?: (id: string) => void;
  /** 表格字段选项（由外部从 columnDefs 注入；缺省时才请求 fields 接口） */
  fieldOptions?: FieldOption[];
  /** 可用数据表列表（可选，触发器「选择数据表」使用） */
  tableOptions?: TableOption[];
}

export const WorkflowEditorEmbed: React.FC<WorkflowEditorEmbedProps> = ({
  tableId,
  docId,
  workflowId,
  onWorkflowCreated,
  fieldOptions,
  tableOptions,
}) => {
  const isNew = !workflowId || workflowId === 'new';
  const forceBlank = workflowId === 'new';

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [name, setName] = useState('');
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [runsOpen, setRunsOpen] = useState(false);
  const [runs, setRuns] = useState<WorkflowInstance[] | null>(null);
  const [runsLoading, setRunsLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [fetchedFieldOptions, setFetchedFieldOptions] = useState<FieldOption[]>([]);
  const effectiveFieldOptions = fieldOptions ?? fetchedFieldOptions;

  // 加载工作流详情
  useEffect(() => {
    if (!tableId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        if (isNew) {
          // 若该表已保存过工作流，恢复最近更新的一条（避免切换视图后已保存数据丢失）；
          // workflowId === 'new' 时跳过恢复，强制从零创建。
          let restored: Workflow | null = null;
          if (!forceBlank) {
            try {
              const list = await baseWorkflowApi.list(tableId);
              if (!cancelled && list?.items?.length) {
                restored = list.items[0];
              }
            } catch { /* 列表拉取失败按新建处理 */ }
          }
          if (cancelled) return;
          if (restored) {
            setWorkflow(restored);
            setName(restored.name);
            setNodes(computeWorkflowLayout((restored.nodes ?? []) as CanvasNode[], (restored.edges ?? []) as CanvasEdge[]));
            setEdges((restored.edges ?? []) as CanvasEdge[]);
            setEnabled(restored.status === 'published');
          } else {
            const triggerId = uuidv4();
            const endId = uuidv4();
            const initialNodes: CanvasNode[] = [
              { id: triggerId, type: 'trigger.record_added', name: '添加新记录时', config: (getNodeMeta('trigger.record_added')?.defaultConfig as Record<string, unknown>) ?? {}, position: { x: 0, y: 0 } },
              { id: endId, type: 'end', name: '结束', config: {}, position: { x: 0, y: 0 } },
            ];
            const initialEdges: CanvasEdge[] = [{ id: uuidv4(), sourceNodeId: triggerId, targetNodeId: endId, branch: 'default' }];
            const layoutedNodes = computeWorkflowLayout(initialNodes, initialEdges);
            setWorkflow({ id: '', name: '未命名工作流', version: 1, nodes: layoutedNodes, edges: initialEdges, variables: [], status: 'draft', tenantId: null, docId: null, tableId, triggerType: 'record_added', triggerFilter: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
            setName('未命名工作流');
            setNodes(layoutedNodes);
            setEdges(initialEdges);
            setEnabled(false);
          }
        } else {
          const wf = await baseWorkflowApi.get(workflowId!);
          if (cancelled) return;
          setWorkflow(wf);
          setName(wf.name);
          setNodes(computeWorkflowLayout((wf.nodes ?? []) as CanvasNode[], (wf.edges ?? []) as CanvasEdge[]));
          setEdges((wf.edges ?? []) as CanvasEdge[]);
          setEnabled(wf.status === 'published');
        }
        if (!fieldOptions) {
          await loadTableFields(docId, tableId).then(setFetchedFieldOptions).catch(() => undefined);
        }
      } catch (err) {
        if (cancelled) return;
        message.error(`加载工作流失败：${(err as Error).message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isNew, message, tableId, workflowId]);

  // 连线事件
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ sourceNodeId: string; targetNodeId: string; branch?: string }>).detail;
      if (!detail) return;
      const exists = edges.find((ed) => ed.sourceNodeId === detail.sourceNodeId && ed.targetNodeId === detail.targetNodeId && (ed.branch ?? 'default') === (detail.branch ?? 'default'));
      if (exists) return;
      const newEdge: CanvasEdge = { id: uuidv4(), sourceNodeId: detail.sourceNodeId, targetNodeId: detail.targetNodeId, branch: detail.branch, sourceHandle: detail.branch };
      setEdges((prev) => [...prev, newEdge]);
      setDirty(true);
    };
    window.addEventListener('bwf:connect', handler);
    return () => window.removeEventListener('bwf:connect', handler);
  }, [edges]);

  const handleUpdateNode = useCallback((id: string, patch: Partial<WorkflowNode>) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    setDirty(true);
  }, []);

  const handleDeleteNode = useCallback((id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    if (node.type.startsWith('trigger.') || node.type === 'start' || node.type === 'end') return;
    Modal.confirm({
      title: '删除节点？',
      content: '删除节点会同时删除与其相连的边。',
      okType: 'danger',
      onOk: () => {
        const nextNodes = nodes.filter((n) => n.id !== id);
        const nextEdges = reconnectEdgesAfterDelete(edges, id);
        setNodes(computeWorkflowLayout(nextNodes, nextEdges));
        setEdges(nextEdges);
        if (selectedNodeId === id) setSelectedNodeId(null);
        setDirty(true);
      },
    });
  }, [edges, nodes, selectedNodeId]);

  const handleRenameNode = useCallback((id: string, n: string) => {
    setNodes((prev) => prev.map((node) => (node.id === id ? { ...node, name: n } : node)));
    setDirty(true);
  }, []);

  const handleChangeNodeType = useCallback((id: string, newType: string) => {
    setNodes((prev) => prev.map((n) => {
      if (n.id !== id) return n;
      const meta = getNodeMeta(newType as never);
      return { ...n, type: newType as never, name: meta?.label ?? n.name, config: (meta?.defaultConfig as Record<string, unknown>) ?? {} };
    }));
    setDirty(true);
  }, []);

  const handleDuplicateNode = useCallback((id: string) => {
    setNodes((prev) => {
      const src = prev.find((n) => n.id === id);
      if (!src) return prev;
      const newNode: CanvasNode = { ...src, id: uuidv4(), name: `${src.name || '节点'} - 副本`, position: { x: 0, y: 0 }, config: { ...(src.config ?? {}) } };
      const nextNodes = [...prev, newNode];
      return computeWorkflowLayout(nextNodes, edges);
    });
    setDirty(true);
  }, [edges]);

  const handleInsertNodeOnEdge = useCallback((edgeId: string, type: string) => {
    const target = edges.find((e) => e.id === edgeId);
    if (!target) return;
    const meta = getNodeMeta(type as never);
    const newNodeId = uuidv4();
    const newNode: CanvasNode = { id: newNodeId, type: type as never, name: meta?.label ?? type, config: (meta?.defaultConfig as Record<string, unknown>) ?? {}, position: { x: 0, y: 0 } };
    const newEdge1: CanvasEdge = { id: uuidv4(), sourceNodeId: target.sourceNodeId, targetNodeId: newNodeId, branch: target.branch, sourceHandle: target.sourceHandle };
    const newEdge2: CanvasEdge = { id: uuidv4(), sourceNodeId: newNodeId, targetNodeId: target.targetNodeId, branch: 'default' };
    const nextEdges = [...edges.filter((e) => e.id !== edgeId), newEdge1, newEdge2];
    setNodes((prev) => computeWorkflowLayout([...prev, newNode], nextEdges));
    setEdges(nextEdges);
    setSelectedNodeId(newNodeId);
    setDirty(true);
  }, [edges]);

  const handleSave = useCallback(async () => {
    if (!tableId) return;
    setSaving(true);
    try {
      const trigger = nodes.find((n) => n.type.startsWith('trigger.'));
      const triggerType = trigger?.type.replace(/^trigger\./, '') ?? null;
      const triggerFilter = extractTriggerFilter(trigger?.config);
      let saved: Workflow;
      if (workflow?.id) {
        saved = await baseWorkflowApi.update(workflow.id, { name, nodes: nodes as WorkflowNode[], edges: edges as WorkflowEdge[], triggerType: triggerType ?? undefined, triggerFilter: triggerFilter ?? null });
      } else {
        saved = await baseWorkflowApi.create(tableId, { name: name || '未命名工作流', tableId, nodes: nodes as WorkflowNode[], edges: edges as WorkflowEdge[], triggerType: triggerType ?? 'manual', triggerFilter: triggerFilter ?? null });
      }
      setWorkflow(saved);
      setDirty(false);
      message.success('已保存');
      onWorkflowCreated?.(saved.id);
    } catch (err) {
      message.error(`保存失败：${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [edges, message, name, nodes, onWorkflowCreated, tableId, workflow]);

  const handlePublish = useCallback(async () => {
    if (!tableId) return;
    setPublishing(true);
    try {
      let id: string | undefined = workflow?.id;
      if (id) {
        await baseWorkflowApi.update(id, { name, nodes: nodes as WorkflowNode[], edges: edges as WorkflowEdge[] });
      } else {
        const created = await baseWorkflowApi.create(tableId, { name: name || '未命名工作流', tableId, nodes: nodes as WorkflowNode[], edges: edges as WorkflowEdge[] });
        setWorkflow(created);
        id = created.id;
      }
      const published = await baseWorkflowApi.publish(id!);
      setWorkflow(published);
      setEnabled(true);
      setDirty(false);
      message.success('已发布并启用');
      onWorkflowCreated?.(id!);
    } catch (err) {
      message.error(`发布失败：${(err as Error).message}`);
    } finally {
      setPublishing(false);
    }
  }, [edges, message, name, nodes, onWorkflowCreated, tableId, workflow]);

  const handleEnabledChange = useCallback(async (v: boolean) => {
    if (!workflow?.id) { message.warning('请先保存工作流'); return; }
    try {
      const updated = v ? await baseWorkflowApi.publish(workflow.id) : await baseWorkflowApi.disable(workflow.id);
      setWorkflow(updated);
      setEnabled(v);
      message.success(v ? '已启用' : '已停用');
    } catch (err) {
      message.error(`切换状态失败：${(err as Error).message}`);
    }
  }, [message, workflow]);

  const selectedNode = useMemo(() => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null), [nodes, selectedNodeId]);

  const handleReloadRuns = useCallback(async () => {
    if (!workflow) return;
    setRunsLoading(true);
    try { const data = await baseWorkflowApi.listRuns(workflow.id); setRuns(data); } catch { setRuns([]); } finally { setRunsLoading(false); }
  }, [workflow]);

  const handleTrigger = useCallback(async () => {
    if (!workflow || workflow.status !== 'published') return;
    setRunning(true);
    try { await baseWorkflowApi.trigger(workflow.id, {}); message.success('已触发一次测试运行'); await handleReloadRuns(); } catch (err) { message.error(`触发失败：${(err as Error).message}`); } finally { setRunning(false); }
  }, [handleReloadRuns, message, workflow]);

  useEffect(() => { if (runsOpen && workflow) { void handleReloadRuns(); } }, [runsOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}><Spin /></div>;

  return (
    <div className="bwf-page">
      <WorkflowTopBar
        name={name} onNameChange={(v) => { setName(v); setDirty(true); }}
        status={(workflow?.status ?? 'draft') as Workflow['status']}
        enabled={enabled} onEnabledChange={handleEnabledChange}
        dirty={dirty} saving={saving} publishing={publishing}
        onSave={handleSave} onPublish={handlePublish}
        onOpenRuns={() => setRunsOpen(true)}
      />
      <div className="bwf-body">
        <WorkflowCanvas
          nodes={nodes} edges={edges} selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onDeleteNode={handleDeleteNode}
          onRenameNode={handleRenameNode} onChangeNodeType={handleChangeNodeType}
          onDuplicateNode={handleDuplicateNode} onInsertNodeOnEdge={handleInsertNodeOnEdge}
        />
        {
          selectedNode ? <NodeConfigPanel node={selectedNode} fieldOptions={effectiveFieldOptions} tableOptions={tableOptions} onUpdateNode={handleUpdateNode} /> : null
        }
      </div>
      <RunHistoryDrawer
        open={runsOpen} workflow={workflow} runs={runs} loading={runsLoading} running={running} expanded={expandedRunId}
        onClose={() => setRunsOpen(false)} onTrigger={handleTrigger} onReload={handleReloadRuns} onExpand={setExpandedRunId}
      />
    </div>
  );
};

async function loadTableFields(docId: string, tableId: string): Promise<FieldOption[]> {
  try {
    // ✅ 修复：使用正确的 docId 和 tableId
    const res = await fetch(`/api/v1/c/docs/${encodeURIComponent(docId)}/sheets/${encodeURIComponent(tableId)}/fields`, { credentials: 'include' });
    if (!res.ok) {
      console.error(`Failed to fetch fields: ${res.status} ${res.statusText}`);
      return [];
    }
    const data = await res.json();
    return (data?.items ?? data?.fields ?? data ?? []).map((f: { id?: string; fieldId?: string; name: string; type: string }) => ({ id: f.id ?? f.fieldId ?? f.name, name: f.name, type: f.type }));
  } catch (error) {
    console.error('Failed to load table fields:', error);
    return [];
  }
}
