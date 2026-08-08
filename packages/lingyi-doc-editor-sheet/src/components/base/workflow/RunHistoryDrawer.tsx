/**
 * 工作流编辑器 - 运行日志抽屉
 */
import React from 'react';
import { Button, Drawer, Empty, Space, Spin, Tag, Typography } from 'antd';
import { ReloadOutlined, ThunderboltOutlined, CheckCircleFilled, CloseCircleFilled, LoadingOutlined, MinusCircleFilled } from '@ant-design/icons';
import { getNodeMeta, type WorkflowNode, type WorkflowInstance } from '@lingyi-doc/core-sheet';

function formatDateTime(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

interface WorkflowInfo {
  id: string;
  name: string;
  status: string;
  nodes: WorkflowNode[];
}

interface RunHistoryDrawerProps {
  open: boolean;
  workflow: WorkflowInfo | null;
  runs: WorkflowInstance[] | null;
  loading: boolean;
  running: boolean;
  expanded: string | null;
  onClose: () => void;
  onTrigger: () => void;
  onReload: () => void;
  onExpand: (id: string | null) => void;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  running: { label: '运行中', className: 'bwf-runs__status--running' },
  completed: { label: '已完成', className: 'bwf-runs__status--completed' },
  failed: { label: '失败', className: 'bwf-runs__status--failed' },
  paused: { label: '已暂停', className: 'bwf-runs__status--paused' },
};

export const RunHistoryDrawer: React.FC<RunHistoryDrawerProps> = ({
  open, workflow, runs, loading, running, expanded,
  onClose, onTrigger, onReload, onExpand,
}) => {
  return (
    <Drawer
      open={open} onClose={onClose} title="运行日志" width={420}
      extra={
        <Space>
          <Button icon={<ThunderboltOutlined spin={running} />} disabled={!workflow || workflow.status !== 'published'}
            onClick={onTrigger} loading={running}>测试运行</Button>
          <Button icon={<ReloadOutlined />} onClick={onReload} loading={loading} />
        </Space>
      }
    >
      {!workflow && <Empty description="未选择工作流" />}
      {workflow && (
        <div>
          <div style={{ padding: '0 0 12px', fontSize: 13, color: '#4e5969' }}>
            <div>工作流：<strong>{workflow.name}</strong></div>
            <div>状态：<Tag color={workflow.status === 'published' ? 'green' : workflow.status === 'draft' ? 'orange' : 'default'}>
              {workflow.status === 'published' ? '已发布' : workflow.status === 'draft' ? '草稿' : '已停用'}
            </Tag></div>
            {workflow.status !== 'published' && (
              <div style={{ color: '#ff7d00', fontSize: 12, marginTop: 4 }}>工作流需先发布后才能测试运行</div>
            )}
          </div>
          {loading && <Spin />}
          {!loading && runs && runs.length === 0 && <Empty description="暂无运行记录" />}
          {runs && runs.length > 0 && (
            <div className="bwf-runs">
              {runs.map((r) => {
                const meta = STATUS_META[r.status] ?? STATUS_META.completed;
                const dur = calcDuration(r);
                const isOpen = expanded === r.id;
                return (
                  <div key={r.id}>
                    <div className="bwf-runs__item" onClick={() => onExpand(isOpen ? null : r.id)}>
                      <div className="bwf-runs__head">
                        <span className={`bwf-runs__status ${meta.className}`}>{meta.label}</span>
                        <span className="bwf-runs__time">{formatDateTime(r.createdAt)}</span>
                        <span className="bwf-runs__duration">{dur}</span>
                      </div>
                      {r.error && <div style={{ color: '#f53f3f', fontSize: 12, marginTop: 4 }}>{r.error}</div>}
                    </div>
                    {isOpen && <RunDetail run={r} workflow={workflow} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
};

const RunDetail: React.FC<{ run: WorkflowInstance; workflow: WorkflowInfo }> = ({ run, workflow }) => (
  <div className="bwf-runs__detail">
    {run.history.map((step, i) => {
      const node = workflow.nodes.find((n) => n.id === step.nodeId);
      const meta = node ? getNodeMeta(node.type) : undefined;
      const statusIcon =
        step.status === 'completed' ? <CheckCircleFilled /> :
        step.status === 'failed' ? <CloseCircleFilled /> :
        step.status === 'running' ? <LoadingOutlined /> :
        <MinusCircleFilled />;
      return (
        <div key={`${step.nodeId}-${i}`} className="bwf-runs__step">
          <span className={`bwf-runs__step-icon bwf-runs__step-icon--${step.status}`} style={meta ? { background: meta.color } : undefined}>
            {meta?.icon ?? statusIcon}
          </span>
          <div className="bwf-runs__step-body">
            <div className="bwf-runs__step-title">{node?.name ?? meta?.label ?? step.nodeId}</div>
            <div className="bwf-runs__step-meta">{step.status} · {step.duration ?? 0}ms{step.branchOutput && step.branchOutput !== 'default' && ` · ${step.branchOutput}`}</div>
            {step.error && <div className="bwf-runs__step-error">{step.error}</div>}
            {step.output ? (
              <Typography.Paragraph type="secondary" style={{ fontSize: 11, marginTop: 4, marginBottom: 0 }} ellipsis={{ rows: 2, expandable: true }}>
                {JSON.stringify(step.output)}
              </Typography.Paragraph>
            ) : null}
          </div>
        </div>
      );
    })}
  </div>
);

function calcDuration(run: WorkflowInstance): string {
  if (!run.createdAt) return '-';
  const start = new Date(run.createdAt).getTime();
  const end = run.updatedAt ? new Date(run.updatedAt).getTime() : Date.now();
  const ms = Math.max(0, end - start);
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
