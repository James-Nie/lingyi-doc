import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Select, Tooltip, message } from 'antd';
import { CloseOutlined, RobotOutlined } from '@ant-design/icons';
import { AgentChat, createAgentApi, useAgentStore } from '@lingyi-doc/editor-pro';
import { authFetch, aiRawFetch, fetchAiAgents, type AiAgentItem } from '../../api/ai';
import './doc-ai-panel.css';

export interface DocAiPanelProps {
  documentId: string;
  documentTitle?: string;
  onClose: () => void;
  onDocumentUpdated?: () => void | Promise<void>;
}

export const DocAiPanel: React.FC<DocAiPanelProps> = ({
  documentId,
  documentTitle,
  onClose,
  onDocumentUpdated,
}) => {
  const [agents, setAgents] = useState<AiAgentItem[]>([]);
  const [agentId, setAgentId] = useState('builtin-chat-assistant');
  const [loadingAgents, setLoadingAgents] = useState(true);

  const api = useMemo(() => createAgentApi(authFetch, aiRawFetch), []);

  useEffect(() => {
    useAgentStore.getState().resetChat();
  }, [agentId, documentId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchAiAgents();
        if (cancelled) return;
        setAgents(result.items);
        if (result.items.length > 0 && !result.items.some((a) => a.id === agentId)) {
          setAgentId(result.items[0].id);
        }
      } catch {
        // 静默失败，保留默认内置 Agent
      } finally {
        if (!cancelled) setLoadingAgents(false);
      }
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  const handleAssistantMessage = useCallback(async (msg: { metadata?: Record<string, unknown> }) => {
    if (msg.metadata?.documentUpdated) {
      message.success('文档内容已更新');
      await onDocumentUpdated?.();
    }
  }, [onDocumentUpdated]);

  return (
    <aside className="doc-ai-panel">
      <div className="doc-ai-panel-header">
        <div className="doc-ai-panel-title">
          <RobotOutlined />
          <span>AI 助手</span>
        </div>
        <Tooltip title="关闭">
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
        </Tooltip>
      </div>

      {documentTitle && (
        <div className="doc-ai-panel-doc-title" title={documentTitle}>
          当前文档：{documentTitle}
        </div>
      )}

      <div className="doc-ai-panel-agent-select">
        <Select
          loading={loadingAgents}
          value={agentId}
          onChange={setAgentId}
          style={{ width: '100%' }}
          options={agents.map((agent) => ({
            value: agent.id,
            label: agent.name,
          }))}
          placeholder="选择智能体"
        />
      </div>

      <div className="doc-ai-panel-body">
        <AgentChat
          key={`${agentId}-${documentId}`}
          agentId={agentId}
          documentId={documentId}
          fetch={authFetch}
          rawFetch={aiRawFetch}
          api={api}
          useStream
          onAssistantMessage={handleAssistantMessage}
        />
      </div>
    </aside>
  );
};
