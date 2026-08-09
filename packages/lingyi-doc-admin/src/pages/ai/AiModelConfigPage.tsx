import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Descriptions,
  Input,
  Select,
  Space,
  Switch,
  Tag,
  message,
} from 'antd';
import { authStore } from '../../stores/authStore';
import {
  fetchAiConfig,
  updateAiConfig,
  type AiModelConfig,
} from '../../api/ai';

export const AiModelConfigPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<AiModelConfig | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [defaultModel, setDefaultModel] = useState('');
  const [modelsText, setModelsText] = useState('');

  const canWrite = authStore.hasPermission('ai:config:write');

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchAiConfig();
      setConfig(data);
      setEnabled(data.enabled);
      setDefaultModel(data.defaultModel);
      setModelsText(data.models.join('\n'));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleSave = async () => {
    const models = modelsText
      .split(/[\n,]/)
      .map((m) => m.trim())
      .filter(Boolean);

    if (models.length === 0) {
      message.warning('请至少配置一个模型');
      return;
    }
    if (!defaultModel.trim()) {
      message.warning('请选择默认模型');
      return;
    }
    if (!models.includes(defaultModel.trim())) {
      message.warning('默认模型必须在可用模型列表中');
      return;
    }

    setSaving(true);
    try {
      const data = await updateAiConfig({
        enabled,
        defaultModel: defaultModel.trim(),
        models,
      });
      setConfig(data);
      message.success('配置已保存');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const modelOptions = modelsText
    .split(/[\n,]/)
    .map((m) => m.trim())
    .filter(Boolean)
    .map((id) => ({ value: id, label: id }));

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>AI 模型配置</h2>

      <Card loading={loading} style={{ marginBottom: 16 }}>
        <Descriptions title="网关信息（只读）" column={2} size="small">
          <Descriptions.Item label="配置来源">
            <Tag color={config?.source === 'database' ? 'blue' : 'default'}>
              {config?.source === 'database' ? '数据库覆盖' : '环境变量'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="默认 Provider">{config?.defaultProvider ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="网关地址">{config?.gateway.baseUrl || '—'}</Descriptions.Item>
          <Descriptions.Item label="API Key">
            {config?.gateway.apiKeyConfigured
              ? (config.gateway.apiKeyPreview ?? '已配置')
              : <Tag color="red">未配置</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="Embedding">
            {config?.embedding.provider} / {config?.embedding.model}
          </Descriptions.Item>
        </Descriptions>
        <p style={{ color: '#8c8c8c', fontSize: 12, margin: '12px 0 0' }}>
          网关地址与 API Key 需在服务端 .env 中配置，修改后需重启服务。
        </p>
      </Card>

      <Card title="运行时配置" loading={loading}>
        <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 640 }}>
          <div>
            <div style={{ marginBottom: 8 }}>启用 AI 模块</div>
            <Switch
              checked={enabled}
              onChange={setEnabled}
              disabled={!canWrite}
            />
          </div>

          <div>
            <div style={{ marginBottom: 8 }}>可用模型（每行一个，或用逗号分隔）</div>
            <Input.TextArea
              rows={6}
              value={modelsText}
              onChange={(e) => setModelsText(e.target.value)}
              disabled={!canWrite}
              placeholder="deepseek-v4-flash&#10;kimi-k2.6"
            />
          </div>

          <div>
            <div style={{ marginBottom: 8 }}>默认模型</div>
            <Select
              style={{ width: '100%' }}
              value={defaultModel || undefined}
              onChange={setDefaultModel}
              options={modelOptions}
              disabled={!canWrite}
              placeholder="选择默认模型"
            />
          </div>

          {canWrite && (
            <Button type="primary" loading={saving} onClick={() => void handleSave()}>
              保存配置
            </Button>
          )}
        </Space>
      </Card>
    </div>
  );
};
