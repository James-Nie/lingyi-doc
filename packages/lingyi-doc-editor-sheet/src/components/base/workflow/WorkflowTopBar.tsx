/**
 * 工作流编辑器 - 顶栏
 */
import React from 'react';
import { ArrowLeftOutlined, CloudSyncOutlined, HistoryOutlined, PoweroffOutlined, SaveOutlined } from '@ant-design/icons';
import { Button, Input, Switch, Tooltip } from 'antd';
import type { WorkflowStatus } from '@lingyi-doc/core-sheet';

interface WorkflowTopBarProps {
  name: string;
  onNameChange: (v: string) => void;
  status: WorkflowStatus;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  dirty: boolean;
  saving: boolean;
  publishing: boolean;
  onSave: () => void;
  onPublish: () => void;
  onOpenRuns: () => void;
}

export const WorkflowTopBar: React.FC<WorkflowTopBarProps> = ({
  name,
  onNameChange,
  status,
  enabled,
  onEnabledChange,
  dirty,
  saving,
  publishing,
  onSave,
  onPublish,
  onOpenRuns,
}) => {
  const statusMeta = {
    draft: { label: '草稿', dotClass: 'bwf-topbar__status-dot--draft' },
    published: { label: '已发布', dotClass: 'bwf-topbar__status-dot--published' },
    disabled: { label: '已停用', dotClass: 'bwf-topbar__status-dot--disabled' },
  }[status] ?? { label: status, dotClass: '' };

  return (
    <div className="bwf-topbar">
      <Input
        className="bwf-topbar__name"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="未命名工作流"
        maxLength={64}
      />
      <div className="bwf-topbar__status">
        <span className={`bwf-topbar__status-dot ${statusMeta.dotClass}`} />
        {statusMeta.label}
      </div>
      {dirty && <span className="bwf-topbar__dirty">· 有未保存修改</span>}
      <span className="bwf-topbar__divider" />
      <Tooltip title="启用后，触发器将按本工作流执行">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <PoweroffOutlined style={{ color: enabled ? '#00b96b' : '#86909c' }} />
          启用
          <Switch size="small" checked={enabled} disabled={status === 'draft'} onChange={onEnabledChange} />
        </span>
      </Tooltip>
      <span className="bwf-topbar__spacer" />
      <Button icon={<HistoryOutlined />} onClick={onOpenRuns}>运行日志</Button>
      <Button icon={<SaveOutlined />} onClick={onSave} loading={saving} disabled={!dirty}>保存</Button>
      <Button type="primary" icon={<CloudSyncOutlined />} onClick={onPublish} loading={publishing}>
        保存并启用
      </Button>
    </div>
  );
};
