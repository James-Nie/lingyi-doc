import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Button, Card, Descriptions, Form, Input, message } from 'antd';
import { authStore } from '../../stores/authStore';
import { formatCreatedAt, formatLastVisited, getAvatarColor, getAvatarText } from '../../utils/formatDate';

export const AccountProfileSection: React.FC = () => {
  const user = useSyncExternalStore(authStore.subscribe, () => authStore.getState().user);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldsValue({
      displayName: user?.displayName ?? '',
      avatarUrl: user?.avatarUrl ?? '',
    });
  }, [user?.displayName, user?.avatarUrl, form]);

  const onSave = async (values: { displayName: string; avatarUrl?: string }) => {
    setLoading(true);
    try {
      const avatarUrl = values.avatarUrl?.trim();
      await authStore.updateProfile({
        displayName: values.displayName.trim(),
        avatarUrl: avatarUrl ? avatarUrl : null,
      });
      message.success('资料已更新');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新失败');
    } finally {
      setLoading(false);
    }
  };

  const avatarLabel = user?.displayName || user?.email || '?';
  const avatarColor = getAvatarColor(avatarLabel);
  const avatarText = getAvatarText(avatarLabel);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="基本资料" bordered={false}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{
              width: 64, height: 64, borderRadius: '50%', background: avatarColor,
              color: '#fff', fontSize: 24, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {avatarText}
            </div>
          )}
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#1f2329' }}>{user?.displayName || '未设置昵称'}</div>
            <div style={{ fontSize: 13, color: '#8f959e', marginTop: 4 }}>{user?.email}</div>
          </div>
        </div>

        <Form form={form} layout="vertical" onFinish={onSave} requiredMark={false}>
          <Form.Item
            name="displayName"
            label="昵称"
            rules={[{ required: true, message: '请输入昵称' }, { max: 50, message: '昵称不超过 50 字' }]}
          >
            <Input placeholder="您的昵称" maxLength={50} />
          </Form.Item>
          <Form.Item
            name="avatarUrl"
            label="头像链接"
            extra="填写图片 URL，留空则使用默认头像"
          >
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              保存资料
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="账号概览" bordered={false}>
        <Descriptions column={1} labelStyle={{ width: 120, color: '#8f959e' }}>
          <Descriptions.Item label="邮箱">{user?.email || '—'}</Descriptions.Item>
          <Descriptions.Item label="账号类型">
            {user?.userType === 'admin' ? '管理员（可使用 C 端）' : '普通用户'}
          </Descriptions.Item>
          <Descriptions.Item label="账号状态">
            {user?.status === 'active' ? '正常' : user?.status || '—'}
          </Descriptions.Item>
          <Descriptions.Item label="注册时间">
            {user?.createdAt ? formatCreatedAt(user.createdAt) : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="最近登录">
            {user?.lastLoginAt ? formatLastVisited(user.lastLoginAt) : '—'}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
};
