import React, { useState, useSyncExternalStore } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Form, Input, message } from 'antd';
import { authStore } from '../../stores/authStore';
import { AuthPageLayout } from '../../components/auth/AuthPageLayout';
import { PASSWORD_HINT, validatePassword } from '../../utils/passwordRules';
import { appPath } from '../../utils/appPaths';

interface ForceChangePasswordFormValues {
  oldPassword: string;
  newPassword: string;
  confirm: string;
}

/** 首次登录强制修改初始密码（后端 need_change_password 置位时由 AuthGuard 跳转而来） */
export const ForceChangePasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useSyncExternalStore(authStore.subscribe, () => authStore.getState().user);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm<ForceChangePasswordFormValues>();
  const redirect = searchParams.get('redirect');

  const onSubmit = async (values: ForceChangePasswordFormValues) => {
    if (values.newPassword !== values.confirm) {
      message.error('两次新密码不一致');
      return;
    }
    const pwdError = validatePassword(values.newPassword);
    if (pwdError) {
      message.error(pwdError);
      return;
    }
    setLoading(true);
    try {
      await authStore.changePassword(values.oldPassword, values.newPassword);
      // 服务端改密后已强制下线并清除 needChangePassword，用新密码重新登录
      const email = user?.email ?? '';
      if (email) {
        await authStore.login(email, values.newPassword, true);
      }
      message.success('密码修改成功');
      navigate(redirect && redirect.startsWith('/') ? redirect : appPath.workspaceSelect, { replace: true });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '修改失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout>
      <div className="auth-panel-inner">
        <h1 className="auth-heading">修改初始密码</h1>
        <p className="auth-subheading">首次登录需修改初始密码后方可使用零一文档</p>

        <Alert
          type="warning"
          showIcon
          message="出于安全考虑，首次登录必须修改初始密码。"
          description="修改成功后会自动使用新密码重新登录。"
          style={{ marginBottom: 16 }}
        />

        <Form
          form={form}
          className="auth-form"
          layout="vertical"
          onFinish={onSubmit}
          requiredMark={false}
          initialValues={{ oldPassword: '', newPassword: '', confirm: '' }}
        >
          <Form.Item
            name="oldPassword"
            label="当前密码（初始密码）"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password size="large" placeholder="请输入当前密码（初始密码）" autoComplete="current-password" />
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
            <Input.Password size="large" placeholder="设置新密码" autoComplete="new-password" />
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
            <Input.Password size="large" placeholder="再次输入新密码" autoComplete="new-password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" size="large" block loading={loading} className="auth-submit">
              确认修改并登录
            </Button>
          </Form.Item>
        </Form>
      </div>
    </AuthPageLayout>
  );
};
