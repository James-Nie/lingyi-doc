import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Form, Input, message } from 'antd';
import { authStore } from '../../stores/authStore';
import { PASSWORD_HINT, validatePassword } from '../../utils/passwordRules';

interface AccountSettingsSectionProps {
  focusPassword?: boolean;
}

export const AccountSettingsSection: React.FC<AccountSettingsSectionProps> = ({ focusPassword }) => {
  const navigate = useNavigate();
  const user = useSyncExternalStore(authStore.subscribe, () => authStore.getState().user);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordForm] = Form.useForm();

  useEffect(() => {
    if (focusPassword) {
      document.getElementById('account-password')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focusPassword]);

  const onChangePassword = async (values: {
    oldPassword: string;
    newPassword: string;
    confirm: string;
  }) => {
    if (values.newPassword !== values.confirm) {
      message.error('两次新密码不一致');
      return;
    }
    const pwdError = validatePassword(values.newPassword);
    if (pwdError) {
      message.error(pwdError);
      return;
    }
    setPasswordLoading(true);
    try {
      await authStore.changePassword(values.oldPassword, values.newPassword);
      message.success('密码已修改，请重新登录');
      passwordForm.resetFields();
      await authStore.logout();
      navigate('/login', { replace: true });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '修改失败');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="登录账号" bordered={false}>
        <div style={{ fontSize: 14, color: '#646a73', lineHeight: 2 }}>
          <div>登录邮箱：{user?.email || '—'}</div>
          <div style={{ color: '#8f959e', fontSize: 13, marginTop: 4 }}>
            邮箱为登录凭证，暂不支持在此修改。如需变更请联系管理员。
          </div>
        </div>
      </Card>

      <Card id="account-password" title="修改密码" bordered={false}>
        <Form form={passwordForm} layout="vertical" onFinish={onChangePassword} requiredMark={false}>
          <Form.Item
            name="oldPassword"
            label="当前密码"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              {
                validator: async (_, value) => {
                  const err = validatePassword(value || '');
                  if (err) throw new Error(err);
                },
              },
            ]}
            extra={PASSWORD_HINT}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator: async (_, value) => {
                  if (!value || getFieldValue('newPassword') === value) return;
                  throw new Error('两次新密码不一致');
                },
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={passwordLoading}>
              修改密码
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};
