import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Card, Form, Input } from 'antd';
import { authStore } from '../../stores/authStore';
import { tenantStore } from '../../stores/tenantStore';
import { AppLogoWithName } from '../../components/AppLogo';

export const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  // 用 context 版 message 而非静态 message.success：
  // 静态方法读不到 ConfigProvider 的主题，弹层会是 antd 默认皮肤，与全站不一致
  const { message } = App.useApp();

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      await authStore.login(values.email, values.password);
      await tenantStore.load();
      message.success('登录成功');
      navigate('/', { replace: true });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-bg-page)',
    }}>
      <Card style={{ width: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <AppLogoWithName size={40} fontSize={18} suffix="管理后台" />
        </div>
        <p style={{ color: 'var(--color-text-2)', marginBottom: 24, textAlign: 'center' }}>运营人员专用登录入口</p>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="email" label="邮箱" rules={[{ required: true }, { type: 'email' }]}>
            <Input size="large" placeholder="admin@lingyidoc.com" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true }]}>
            <Input.Password size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
};
