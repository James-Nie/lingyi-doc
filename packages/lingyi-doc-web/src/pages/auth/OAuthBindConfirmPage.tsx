/**
 * 第三方扫码「确认合并」页
 *
 * 触发场景：扫码得到的手机号/邮箱命中了既有本地账号。
 * 出于防账号接管考虑，不做自动合并，而是要求用户证明自己也是该本地账号的
 * 持有者——输入该账号的登录密码。验证通过后才建立绑定并登录。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Form, Input, message } from 'antd';
import { AuthPageLayout } from '../../components/auth/AuthPageLayout';
import { authStore } from '../../stores/authStore';
import { parseBindConfirmFragment, type OAuthBindConfirmContext } from '../../services/oauthApi';

export const OAuthBindConfirmPage: React.FC = () => {
  const navigate = useNavigate();
  const [context, setContext] = useState<OAuthBindConfirmContext | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const readRef = useRef(false);

  useEffect(() => {
    if (readRef.current) return;
    readRef.current = true;
    const parsed = parseBindConfirmFragment(window.location.hash);
    // 令牌已读入内存，立刻清空地址栏
    window.history.replaceState(null, '', window.location.pathname);
    setContext(parsed);
  }, []);

  const description = useMemo(() => {
    if (!context) return '';
    const who = context.targetHint
      ? `${context.targetDisplayName}（${context.targetHint}）`
      : context.targetDisplayName || '该账号';
    return `你的${context.providerName}账号所绑定的手机号/邮箱，已注册为本平台的账号：「${who}」。`;
  }, [context]);

  const handleSubmit = async (values: { password: string }) => {
    if (!context) return;
    setSubmitting(true);
    try {
      await authStore.confirmOAuthBind(context.pendingToken, values.password);
      message.success('已合并并登录');
      navigate(context.redirect.startsWith('/') ? context.redirect : '/', { replace: true });
    } catch (err) {
      message.error((err as Error).message || '合并失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (!context) {
    return (
      <AuthPageLayout>
        <Alert
          type="warning"
          showIcon
          message="确认信息已失效"
          description="请重新使用第三方扫码登录。"
          style={{ marginBottom: 16 }}
        />
        <Button type="primary" block onClick={() => navigate('/login', { replace: true })}>
          返回登录
        </Button>
      </AuthPageLayout>
    );
  }

  return (
    <AuthPageLayout>
      <Alert
        type="info"
        showIcon
        message="该账号已存在，需要确认后合并"
        description={description}
        style={{ marginBottom: 20 }}
      />
      <p style={{ fontSize: 13, color: '#4e5969', marginBottom: 20, lineHeight: 1.7 }}>
        如果你就是这个账号的主人，请输入<strong>该账号的登录密码</strong>完成合并。
        合并后，{context.providerName}扫码与原有密码两种方式均可登录同一账号。
        <br />
        如果你不是该账号的主人，请返回并<a onClick={() => navigate('/login', { replace: true })}>用其他方式登录</a>。
      </p>
      <Form form={form} className="auth-form" layout="vertical" onFinish={handleSubmit} requiredMark={false}>
        <Form.Item
          name="password"
          label="该账号的登录密码"
          rules={[{ required: true, message: '请输入密码' }]}
        >
          <Input.Password size="large" placeholder="请输入密码" autoComplete="current-password" />
        </Form.Item>
        <Form.Item style={{ marginBottom: 12 }}>
          <Button type="primary" htmlType="submit" size="large" block loading={submitting} className="auth-submit">
            确认合并并登录
          </Button>
        </Form.Item>
        <Button block onClick={() => navigate('/login', { replace: true })}>
          取消
        </Button>
      </Form>
    </AuthPageLayout>
  );
};
