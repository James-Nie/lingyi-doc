/**
 * 工作流视图容器组件
 * 直接渲染内嵌工作流编辑器，不经过列表页。
 * workflowId 由视图配置持久化；未绑定时编辑器会恢复该表最近保存的工作流。
 */
import React from 'react';
import type { FieldOption, TableOption } from '@lingyi-doc/editor-sheet';
import { WorkflowEditorEmbed } from './WorkflowEditorEmbed';

export interface WorkflowViewContainerProps {
  tableId: string;
  docId: string;
  readOnly?: boolean;
  /** 视图绑定的工作流 ID（来自工作流视图配置） */
  workflowId?: string;
  /** 新建/恢复工作流后，绑定到当前视图配置 */
  onWorkflowCreated?: (id: string) => void;
  /** 表格字段选项（由外层从 columnDefs 注入） */
  fieldOptions?: FieldOption[];
  /** 可用数据表列表（由外层注入，触发器「选择数据表」使用） */
  tableOptions?: TableOption[];
}

export const WorkflowViewContainer: React.FC<WorkflowViewContainerProps> = ({
  tableId,
  docId,
  workflowId,
  onWorkflowCreated,
  fieldOptions,
  tableOptions,
}) => {
  return (
    <WorkflowEditorEmbed
      tableId={tableId}
      docId={docId}
      workflowId={workflowId}
      onWorkflowCreated={onWorkflowCreated}
      fieldOptions={fieldOptions}
      tableOptions={tableOptions}
    />
  );
};
