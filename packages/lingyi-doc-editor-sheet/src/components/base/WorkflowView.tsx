/**
 * 多维表工作流视图
 * 作为视图类型嵌入编辑器，不单独作为路由存在。
 * 通过 props 接收工作流数据和操作回调，由上层 web 包负责 API 调用。
 */
import React, { useMemo, useState } from 'react';
import { Input, Tag, Empty, Spin, Button, Popconfirm } from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  EditOutlined,
  DeleteOutlined,
  PoweroffOutlined,
} from '@ant-design/icons';
import { BASE_THEME, type WorkflowItem, type WorkflowStatus } from '@lingyi-doc/core-sheet';

export type { WorkflowItem, WorkflowStatus } from '@lingyi-doc/core-sheet';

export interface WorkflowViewProps {
  /** 工作流列表 */
  workflows: WorkflowItem[];
  /** 是否加载中 */
  loading?: boolean;
  /** 新建工作流 */
  onCreate?: () => void;
  /** 编辑工作流 */
  onEdit?: (id: string) => void;
  /** 启用/停用工作流 */
  onToggle?: (id: string, status: WorkflowStatus) => void;
  /** 删除工作流 */
  onDelete?: (id: string) => void;
  /** 只读模式 */
  readOnly?: boolean;
}

// ==================== 常量 ====================

const STATUS_CONFIG: Record<WorkflowStatus, { label: string; color: string }> = {
  published: { label: '已发布', color: 'green' },
  draft: { label: '草稿', color: 'orange' },
  disabled: { label: '已停用', color: 'default' },
};

const TRIGGER_LABELS: Record<string, string> = {
  'trigger.record_added': '创建记录时',
  'trigger.record_updated': '记录变更时',
  'trigger.record_match': '新增或修改的记录满足条件时',
  'trigger.record_deleted': '删除记录时',
  'trigger.record_datetime': '到达记录中的时间时',
  'trigger.scheduled': '定时触发',
  'trigger.comment_received': '收到评论时',
  'trigger.button_clicked': '点击按钮时',
  'trigger.form_submitted': '表单提交时',
  'trigger.todo_completed': '待办完成时',
  'trigger.webhook': 'Webhook',
  'trigger.manual': '手动触发',
};

// ==================== 组件 ====================

export const WorkflowView: React.FC<WorkflowViewProps> = ({
  workflows,
  loading = false,
  onCreate,
  onEdit,
  onToggle,
  onDelete,
  readOnly = false,
}) => {
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(() => {
    if (!keyword.trim()) return workflows;
    return workflows.filter(w => w.name.includes(keyword.trim()));
  }, [workflows, keyword]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: 300,
      }}>
        <Spin tip="加载工作流中…" />
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* 顶栏 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 0 16px',
        flexShrink: 0,
      }}>
        <Input
          size="small"
          allowClear
          placeholder="搜索工作流"
          prefix={<SearchOutlined style={{ color: BASE_THEME.secondaryTextColor }} />}
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          style={{ width: 240, borderRadius: 6 }}
        />
        {!readOnly && onCreate && (
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={onCreate}>
            新建工作流
          </Button>
        )}
      </div>

      {/* 列表 */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {filtered.length === 0 ? (
          <Empty
            description={keyword.trim() ? '无匹配结果' : '暂无工作流'}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ marginTop: 60 }}
          >
            {!readOnly && onCreate && !keyword.trim() && (
              <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
                新建工作流
              </Button>
            )}
          </Empty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(wf => {
              const statusCfg = STATUS_CONFIG[wf.status];
              const triggerLabel = wf.triggerType
                ? TRIGGER_LABELS[wf.triggerType] || wf.triggerType
                : null;
              const canEdit = !readOnly && onEdit;
              const canDelete = !readOnly && onDelete;

              return (
                <div
                  key={wf.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '14px 16px',
                    borderRadius: 8,
                    border: `1px solid ${BASE_THEME.gridColor}`,
                    background: '#fff',
                    gap: 12,
                    cursor: canEdit ? 'pointer' : 'default',
                    transition: 'box-shadow 0.15s',
                  }}
                  onClick={() => canEdit && onEdit?.(wf.id)}
                  onMouseEnter={e => {
                    if (canEdit) (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                  }}
                  onMouseLeave={e => {
                    if (canEdit) (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                  }}
                >
                  <ThunderboltOutlined
                    style={{
                      fontSize: 20,
                      color: wf.status === 'published' ? '#52c41a' : wf.status === 'draft' ? '#faad14' : '#bfbfbf',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: BASE_THEME.cellTextColor,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {wf.name}
                    </div>
                    {wf.description && (
                      <div style={{
                        fontSize: 12,
                        color: BASE_THEME.secondaryTextColor,
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {wf.description}
                      </div>
                    )}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 4,
                    }}>
                      <Tag color={statusCfg.color} style={{ margin: 0, fontSize: 11, lineHeight: '18px' }}>
                        {statusCfg.label}
                      </Tag>
                      {triggerLabel && (
                        <span style={{ fontSize: 11, color: BASE_THEME.secondaryTextColor }}>
                          {triggerLabel}
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: BASE_THEME.secondaryTextColor }}>
                        v{wf.version}
                      </span>
                    </div>
                  </div>
                  {!readOnly && (
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
                      onClick={e => e.stopPropagation()}
                    >
                      {onToggle && (
                        <Button
                          size="small"
                          type="text"
                          icon={<PoweroffOutlined />}
                          onClick={() => onToggle(wf.id, wf.status)}
                          title={wf.status === 'published' ? '停用' : '启用'}
                        />
                      )}
                      {canEdit && (
                        <Button
                          size="small"
                          type="text"
                          icon={<EditOutlined />}
                          onClick={() => onEdit?.(wf.id)}
                        />
                      )}
                      {canDelete && (
                        <Popconfirm
                          title="删除工作流"
                          description={`确定删除「${wf.name}」？`}
                          onConfirm={() => onDelete(wf.id)}
                          okText="删除"
                          cancelText="取消"
                          okButtonProps={{ danger: true }}
                        >
                          <Button
                            size="small"
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                          />
                        </Popconfirm>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
