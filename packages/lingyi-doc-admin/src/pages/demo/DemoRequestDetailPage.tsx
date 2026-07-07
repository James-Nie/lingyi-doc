import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Descriptions, Form, Input, Select, Space, Tag, message } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { adminFetch, authStore } from '../../stores/authStore';
import {
  DEMO_STATUS_COLORS,
  DEMO_STATUS_LABELS,
  type DemoRequestItem,
  type DemoRequestStatus,
} from './demoConstants';

export const DemoRequestDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<DemoRequestItem | null>(null);
  const [form] = Form.useForm<{ status: DemoRequestStatus; handleComment: string }>();

  const canWrite = authStore.hasPermission('demo:write');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await adminFetch<DemoRequestItem>(`/api/v1/admin/demo-requests/${id}`);
      setDetail(data);
      form.setFieldsValue({
        status: data.status === 'pending' ? 'contacted' : data.status,
        handleComment: data.handleComment ?? '',
      });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [form, id]);

  useEffect(() => { void load(); }, [load]);

  const handleProcess = async (values: { status: DemoRequestStatus; handleComment: string }) => {
    if (!id) return;
    setSubmitting(true);
    try {
      const updated = await adminFetch<DemoRequestItem>(`/api/v1/admin/demo-requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      });
      message.success('处理记录已保存');
      setDetail(updated);
      form.setFieldsValue({
        status: updated.status,
        handleComment: updated.handleComment ?? '',
      });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !detail) {
    return <div style={{ padding: 24 }}>加载中…</div>;
  }

  if (!detail) {
    return (
      <div>
        <Button type="link" onClick={() => navigate('/demo-requests')}>← 返回列表</Button>
        <p>预约记录不存在</p>
      </div>
    );
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="link" onClick={() => navigate('/demo-requests')} style={{ paddingLeft: 0 }}>
          ← 返回列表
        </Button>
      </Space>

      <h2 style={{ marginTop: 0 }}>预约演示详情</h2>

      <Card title="申请信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="姓名">{detail.name}</Descriptions.Item>
          <Descriptions.Item label="联系电话">{detail.phone}</Descriptions.Item>
          <Descriptions.Item label="公司名称">{detail.company}</Descriptions.Item>
          <Descriptions.Item label="企业规模">{detail.companySize}</Descriptions.Item>
          <Descriptions.Item label="使用场景">{detail.scenario}</Descriptions.Item>
          <Descriptions.Item label="提交时间">
            {new Date(detail.createdAt).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="申请产品" span={2}>
            {detail.products.map(p => (
              <Tag key={p} style={{ marginBottom: 4 }}>{p}</Tag>
            ))}
          </Descriptions.Item>
          <Descriptions.Item label="主要问题" span={2}>
            <div style={{ whiteSpace: 'pre-wrap' }}>{detail.questions}</div>
          </Descriptions.Item>
          <Descriptions.Item label="提交 IP">{detail.ip || '—'}</Descriptions.Item>
          <Descriptions.Item label="User-Agent">
            <span style={{ wordBreak: 'break-all' }}>{detail.userAgent || '—'}</span>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="处理信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="处理状态">
            <Tag color={DEMO_STATUS_COLORS[detail.status]}>
              {DEMO_STATUS_LABELS[detail.status]}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="是否已处理">
            <Tag color={detail.isProcessed ? 'green' : 'default'}>
              {detail.isProcessed ? '是' : '否'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="处理人">{detail.processedByName || '—'}</Descriptions.Item>
          <Descriptions.Item label="处理时间">
            {detail.processedAt ? new Date(detail.processedAt).toLocaleString() : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="首次跟进">
            {detail.contactedAt ? new Date(detail.contactedAt).toLocaleString() : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="最后更新">
            {new Date(detail.updatedAt).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="处理意见" span={2}>
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {detail.handleComment || '—'}
            </div>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {canWrite && detail.status !== 'closed' && (
        <Card title="处理预约">
          <Form
            form={form}
            layout="vertical"
            onFinish={values => void handleProcess(values)}
            style={{ maxWidth: 560 }}
          >
            <Form.Item
              name="status"
              label="更新状态"
              rules={[{ required: true, message: '请选择处理状态' }]}
            >
              <Select
                options={[
                  { label: '跟进中', value: 'contacted' },
                  { label: '已处理', value: 'closed' },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="handleComment"
              label="处理意见"
              rules={[{ required: true, message: '请填写处理意见' }]}
            >
              <Input.TextArea rows={4} placeholder="记录跟进情况、沟通结论等" maxLength={2000} showCount />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={submitting}>
                保存处理记录
              </Button>
            </Form.Item>
          </Form>
        </Card>
      )}

      {detail.status === 'closed' && (
        <Card>
          <p style={{ margin: 0, color: '#64748b' }}>该预约已标记为「已处理」，如需修改请联系超级管理员。</p>
        </Card>
      )}
    </div>
  );
};
