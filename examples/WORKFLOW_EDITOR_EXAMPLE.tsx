/**
 * 工作流编辑器页面示例
 * 展示如何正确使用 WorkflowEditorContainer 避免 API 404 错误
 */
import React, { useState, useEffect } from 'react';
import { message, Spin } from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import { WorkflowEditorContainer } from '@lingyi-doc/editor-sheet';
import type { WorkflowData, WorkflowInstance } from '@lingyi-doc/core-sheet';

/**
 * 工作流编辑器页面组件
 * 
 * 路由示例：/docs/:docId/sheets/:sheetId/workflows/:workflowId/edit
 */
export const WorkflowEditorPageExample: React.FC = () => {
  // 从路由参数获取 ID
  const { docId, sheetId, workflowId } = useParams<{
    docId: string;
    sheetId: string;
    workflowId: string;
  }>();
  
  const navigate = useNavigate();
  
  const [workflow, setWorkflow] = useState<WorkflowData | null>(null);
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ==================== 数据加载 ====================

  // 加载工作流数据
  useEffect(() => {
    if (!docId || !sheetId || !workflowId) {
      message.error('缺少必要的参数');
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);

        // 加载工作流详情
        const workflowRes = await fetch(`/api/v1/c/workflows/${workflowId}`);
        const workflowData = await workflowRes.json();

        if (workflowData.code !== 0) {
          throw new Error(workflowData.message || '加载工作流失败');
        }

        setWorkflow(workflowData.data);

        // 加载运行历史（可选）
        const instancesRes = await fetch(`/api/v1/c/workflows/${workflowId}/instances?limit=10`);
        const instancesData = await instancesRes.json();

        if (instancesData.code === 0) {
          setInstances(instancesData.data?.list || []);
        }
      } catch (error) {
        console.error('Failed to load workflow:', error);
        message.error('加载工作流失败');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [docId, sheetId, workflowId]);

  // ==================== 事件处理 ====================

  // 更新工作流（本地状态）
  const handleUpdateWorkflow = (patch: Partial<WorkflowData>) => {
    if (!workflow) return;
    
    setWorkflow({
      ...workflow,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  };

  // 保存工作流到服务器
  const handleSave = async () => {
    if (!workflow) return;

    try {
      setSaving(true);

      const response = await fetch(`/api/v1/c/workflows/${workflowId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: workflow.name,
          description: workflow.description,
          nodes: workflow.nodes,
          edges: workflow.edges,
          variables: workflow.variables,
          triggerType: workflow.triggerType,
          triggerFilter: workflow.triggerFilter,
          status: workflow.status,
        }),
      });

      const data = await response.json();

      if (data.code === 0) {
        message.success('保存成功');
        setWorkflow(data.data);
      } else {
        message.error(data.message || '保存失败');
      }
    } catch (error) {
      console.error('Failed to save workflow:', error);
      message.error('保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  // 返回工作流列表
  const handleBack = () => {
    navigate(`/docs/${docId}/sheets/${sheetId}/workflows`);
  };

  // ==================== 渲染 ====================

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <Spin size="large" />
        <div style={{ color: '#86909c', fontSize: 14 }}>加载工作流中...</div>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ fontSize: 16, color: '#1d2129' }}>工作流不存在</div>
        <button onClick={handleBack}>返回列表</button>
      </div>
    );
  }

  // ✅ 核心修复：使用 WorkflowEditorContainer，正确传递 docId 和 sheetId
  return (
    <WorkflowEditorContainer
      docId={docId!}
      sheetId={sheetId!}
      workflow={workflow}
      instances={instances}
      onUpdateWorkflow={handleUpdateWorkflow}
      onSave={handleSave}
      onBack={handleBack}
      readOnly={saving}
    />
  );
};

// ==================== 其他使用场景 ====================

/**
 * 场景2：从数据表对象获取 ID
 */
export const WorkflowEditorWithSheetObject: React.FC<{
  sheet: {
    id: string;
    docId: string;
    name: string;
  };
  workflowId: string;
}> = ({ sheet, workflowId }) => {
  const [workflow, setWorkflow] = useState<WorkflowData | null>(null);

  // ... 数据加载逻辑

  if (!workflow) return null;

  return (
    <WorkflowEditorContainer
      docId={sheet.docId}    // ✅ 从 sheet 对象获取 docId
      sheetId={sheet.id}     // ✅ 使用 sheet.id 作为 sheetId
      workflow={workflow}
      onUpdateWorkflow={setWorkflow}
    />
  );
};

/**
 * 场景3：自定义字段获取（如果你的 API 路径不同）
 */
export const WorkflowEditorWithCustomAPI: React.FC<{
  docId: string;
  sheetId: string;
  workflow: WorkflowData;
}> = ({ docId, sheetId, workflow }) => {
  // 自定义字段获取函数
  const fetchFields = async (docId: string, sheetId: string) => {
    // 使用你自己的 API 路径
    const response = await fetch(
      `/api/v2/tables/${sheetId}/columns?docId=${docId}`
    );
    
    const data = await response.json();
    
    // 转换为组件需要的格式
    return data.columns.map((col: any) => ({
      id: col.columnId,
      name: col.columnName,
      type: col.columnType,
    }));
  };

  return (
    <WorkflowEditorContainer
      docId={docId}
      sheetId={sheetId}
      workflow={workflow}
      fetchFields={fetchFields}  // ✅ 使用自定义字段获取函数
      onUpdateWorkflow={() => {}}
    />
  );
};

/**
 * 场景4：只读模式（查看工作流）
 */
export const WorkflowViewer: React.FC<{
  docId: string;
  sheetId: string;
  workflowId: string;
}> = ({ docId, sheetId, workflowId }) => {
  const [workflow, setWorkflow] = useState<WorkflowData | null>(null);

  // ... 数据加载逻辑

  if (!workflow) return null;

  return (
    <WorkflowEditorContainer
      docId={docId}
      sheetId={sheetId}
      workflow={workflow}
      readOnly={true}  // ✅ 只读模式
    />
  );
};

export default WorkflowEditorPageExample;
