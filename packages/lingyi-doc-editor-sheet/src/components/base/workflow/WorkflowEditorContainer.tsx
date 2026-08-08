/**
 * 工作流编辑器容器组件
 * 负责加载字段数据并传递给工作流画布和配置面板
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { message } from 'antd';
import { WorkflowCanvas, type CanvasNode, type CanvasEdge } from './WorkflowCanvas';
import { NodeConfigPanel, type FieldOption, type TableOption } from './NodeConfigPanel';
import { WorkflowTopBar } from './WorkflowTopBar';
import { RunHistoryDrawer } from './RunHistoryDrawer';
import type { WorkflowData, WorkflowInstance } from '@lingyi-doc/core-sheet';
import { reconnectEdgesAfterDelete } from '@lingyi-doc/core-sheet';
import './workflow-editor.css';

export interface WorkflowEditorContainerProps {
  /** 文档 ID */
  docId: string;
  /** 工作表/数据表 ID */
  sheetId: string;
  /** 多维表 ID（可选，默认使用 sheetId） */
  tableId?: string;
  /** 工作流数据 */
  workflow: WorkflowData;
  /** 工作流实例列表（运行历史） */
  instances?: WorkflowInstance[];
  /** 更新工作流回调 */
  onUpdateWorkflow?: (workflow: Partial<WorkflowData>) => void;
  /** 保存工作流回调 */
  onSave?: () => void;
  /** 返回列表回调 */
  onBack?: () => void;
  /** 自定义字段获取函数（可选，默认使用内置 fetch） */
  fetchFields?: (docId: string, sheetId: string) => Promise<FieldOption[]>;
  /** 可用数据表列表（可选，触发器「选择数据表」使用） */
  tableOptions?: TableOption[];
  /** 只读模式 */
  readOnly?: boolean;
}

/**
 * 默认的字段获取函数
 * 使用标准 API 路径：/api/v1/c/docs/{docId}/sheets/{sheetId}/fields
 */
async function defaultFetchFields(docId: string, sheetId: string): Promise<FieldOption[]> {
  // 参数校验
  if (!docId || typeof docId !== 'string') {
    throw new Error('Invalid docId parameter');
  }
  if (!sheetId || typeof sheetId !== 'string') {
    throw new Error('Invalid sheetId parameter');
  }
  
  // 防御性检查：docId 和 sheetId 不应该相同
  if (docId === sheetId) {
    console.warn('⚠️ Warning: docId and sheetId are the same, this might cause API errors');
  }

  const url = `/api/v1/c/docs/${docId}/sheets/${sheetId}/fields`;
  console.log('Fetching fields from:', url);
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch fields: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(data.message || 'Failed to fetch fields');
  }
  
  // 转换为 FieldOption 格式
  return (data.data?.fields || data.fields || []).map((field: any) => ({
    id: field.id || field.fieldId,
    name: field.name || field.label,
    type: field.type,
  }));
}

export const WorkflowEditorContainer: React.FC<WorkflowEditorContainerProps> = ({
  docId,
  sheetId,
  tableId,
  workflow,
  instances = [],
  onUpdateWorkflow,
  onSave,
  onBack,
  fetchFields = defaultFetchFields,
  tableOptions,
  readOnly = false,
}) => {
  const [fieldOptions, setFieldOptions] = useState<FieldOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);

  // 加载字段列表
  useEffect(() => {
    let mounted = true;

    const loadFields = async () => {
      try {
        setLoading(true);
        
        // 参数校验日志
        console.log('WorkflowEditorContainer - Loading fields with params:', {
          docId,
          sheetId,
          tableId: tableId || sheetId,
        });
        
        const fields = await fetchFields(docId, sheetId);
        
        if (mounted) {
          setFieldOptions(fields);
          console.log(`Loaded ${fields.length} fields successfully`);
        }
      } catch (error) {
        console.error('Failed to load field options:', error);
        if (mounted) {
          message.error('加载字段列表失败，请检查文档和工作表 ID 是否正确');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadFields();

    return () => {
      mounted = false;
    };
  }, [docId, sheetId, fetchFields]);

  // 节点操作回调
  const handleUpdateNode = useCallback(
    (id: string, patch: Partial<CanvasNode>) => {
      const updatedNodes = workflow.nodes.map((n) =>
        n.id === id ? { ...n, ...patch } : n
      );
      onUpdateWorkflow?.({ nodes: updatedNodes });
    },
    [workflow.nodes, onUpdateWorkflow]
  );

  const handleDeleteNode = useCallback(
    (id: string) => {
      const node = workflow.nodes.find((n) => n.id === id);
      if (!node) return;
      if (node.type.startsWith('trigger.') || node.type === 'start' || node.type === 'end') return;
      const updatedNodes = workflow.nodes.filter((n) => n.id !== id);
      const updatedEdges = reconnectEdgesAfterDelete(workflow.edges, id);
      onUpdateWorkflow?.({ nodes: updatedNodes, edges: updatedEdges });
      if (selectedNodeId === id) {
        setSelectedNodeId(null);
      }
    },
    [workflow.nodes, workflow.edges, selectedNodeId, onUpdateWorkflow]
  );

  const handleRenameNode = useCallback(
    (id: string, name: string) => {
      handleUpdateNode(id, { name });
    },
    [handleUpdateNode]
  );

  const handleChangeNodeType = useCallback(
    (id: string, newType: string) => {
      handleUpdateNode(id, { type: newType as any, config: {} });
    },
    [handleUpdateNode]
  );

  const handleDuplicateNode = useCallback(
    (id: string) => {
      const node = workflow.nodes.find((n) => n.id === id);
      if (!node) return;

      const newNode: CanvasNode = {
        ...node,
        id: `node_${Date.now()}`,
        name: `${node.name} (副本)`,
        position: { x: node.position.x + 50, y: node.position.y + 50 },
      };

      onUpdateWorkflow?.({ nodes: [...workflow.nodes, newNode] });
    },
    [workflow.nodes, onUpdateWorkflow]
  );

  const handleInsertNodeOnEdge = useCallback(
    (edgeId: string, type: string) => {
      const edge = workflow.edges.find((e) => e.id === edgeId);
      if (!edge) return;

      const sourceNode = workflow.nodes.find((n) => n.id === edge.sourceNodeId);
      const targetNode = workflow.nodes.find((n) => n.id === edge.targetNodeId);
      if (!sourceNode || !targetNode) return;

      const newNode: CanvasNode = {
        id: `node_${Date.now()}`,
        type: type as any,
        name: '',
        config: {},
        position: {
          x: (sourceNode.position.x + targetNode.position.x) / 2,
          y: (sourceNode.position.y + targetNode.position.y) / 2,
        },
      };

      const newEdge1: CanvasEdge = {
        id: `edge_${Date.now()}_1`,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: newNode.id,
        branch: edge.branch,
      };

      const newEdge2: CanvasEdge = {
        id: `edge_${Date.now()}_2`,
        sourceNodeId: newNode.id,
        targetNodeId: edge.targetNodeId,
      };

      const updatedEdges = workflow.edges.filter((e) => e.id !== edgeId);
      onUpdateWorkflow?.({
        nodes: [...workflow.nodes, newNode],
        edges: [...updatedEdges, newEdge1, newEdge2],
      });
    },
    [workflow.nodes, workflow.edges, onUpdateWorkflow]
  );

  const selectedNode = useMemo(
    () => workflow.nodes.find((n) => n.id === selectedNodeId) || null,
    [workflow.nodes, selectedNodeId]
  );

  if (loading) {
    return (
      <div className="bwf-page">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          加载中...
        </div>
      </div>
    );
  }

  return (
    <div className="bwf-page">
      <WorkflowTopBar
        name={workflow.name}
        onNameChange={(v) => onUpdateWorkflow?.({ name: v })}
        status={workflow.status as 'draft' | 'published' | 'disabled'}
        enabled={workflow.status === 'published'}
        onEnabledChange={() => onUpdateWorkflow?.({ status: workflow.status === 'published' ? 'disabled' : 'published' })}
        dirty={false}
        saving={false}
        publishing={false}
        onSave={onSave ?? (() => {})}
        onPublish={onSave ?? (() => {})}
        onOpenRuns={() => setHistoryDrawerOpen(true)}
      />
      <div className="bwf-body">
        <WorkflowCanvas
          nodes={workflow.nodes}
          edges={workflow.edges}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onDeleteNode={handleDeleteNode}
          onRenameNode={handleRenameNode}
          onChangeNodeType={handleChangeNodeType}
          onDuplicateNode={handleDuplicateNode}
          onInsertNodeOnEdge={handleInsertNodeOnEdge}
        />
        <NodeConfigPanel
          node={selectedNode}
          fieldOptions={fieldOptions}
          tableOptions={tableOptions}
          onUpdateNode={handleUpdateNode}
        />
      </div>
      <RunHistoryDrawer
        open={historyDrawerOpen}
        workflow={workflow}
        runs={instances}
        loading={false}
        running={false}
        expanded={null}
        onClose={() => setHistoryDrawerOpen(false)}
        onTrigger={() => {}}
        onReload={() => {}}
        onExpand={() => {}}
      />
    </div>
  );
};
