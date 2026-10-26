import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Alert, Button, Checkbox, Form, Input, message } from 'antd';
import { authStore } from '../../stores/authStore';
import { resetPasswordBySms, sendSmsCode, verifySmsCode } from '../../api/sms';
import { AuthPageLayout } from '../../components/auth/AuthPageLayout';
import { PASSWORD_HINT, validatePassword } from '../../utils/passwordRules';
import { appPath } from '../../utils/appPaths';
import {
  fetchOAuthProviders,
  startOAuthLogin,
  type OAuthProviderSummary,
} from '../../services/oauthApi';
import '../../components/auth/auth.css';

export type AuthMode = 'login' | 'register' | 'forgot';

interface AuthPageProps {
  initialMode?: AuthMode;
}

const SMS_COUNTDOWN_SEC = 60;

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPhone(value: string): boolean {
  return /^1[3-9]\d{9}$/.test(value.replace(/[\s-]/g, ''));
}

function PasswordRuleList({ password }: { password: string }) {
  const rules = useMemo(() => [
    { label: '8-20 个字符', met: password.length >= 8 && password.length <= 20 },
    { label: '包含大写字母', met: /[A-Z]/.test(password) },
    { label: '包含小写字母', met: /[a-z]/.test(password) },
    { label: '包含数字', met: /\d/.test(password) },
    { label: '包含特殊字符 (!@#$%^&*)', met: /[!@#$%^&*]/.test(password) },
  ], [password]);

  return (
    <ul className="auth-password-rules">
      {rules.map(rule => (
        <li key={rule.label} className={rule.met ? 'met' : undefined}>{rule.label}</li>
      ))}
    </ul>
  );
}

export const AuthPage: React.FC<AuthPageProps> = ({ initialMode = 'login' }) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [registerStep, setRegisterStep] = useState(0);
  const [verifiedPhone, setVerifiedPhone] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsCountdown, setSmsCountdown] = useState(0);
  const [loginType, setLoginType] = useState<'email' | 'phone'>('email');
  const [oauthProviders, setOauthProviders] = useState<OAuthProviderSummary[]>([]);
  const [loginForm] = Form.useForm();
  const [phoneForm] = Form.useForm();
  const [registerForm] = Form.useForm();
  const [forgotForm] = Form.useForm();
  const [forgotPassword, setForgotPassword] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotVerified, setForgotVerified] = useState(false);
  const [forgotToken, setForgotToken] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');
  const suspended = (location.state as { reason?: string } | null)?.reason === 'suspended';

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // 第三方扫码渠道：仅 SaaS 且已配置凭证时后端才返回，私有化返回空
  useEffect(() => {
    let cancelled = false;
    void fetchOAuthProviders().then(items => {
      if (!cancelled) setOauthProviders(items);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (suspended) {
      message.warning('您的账号已被禁用，请联系管理员');
    }
  }, [suspended]);

  useEffect(() => {
    if (smsCountdown <= 0) return undefined;
    const timer = window.setTimeout(() => setSmsCountdown(prev => prev - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [smsCountdown]);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setRegisterStep(0);
    setVerifiedPhone('');
    setVerificationToken('');
    phoneForm.resetFields();
    registerForm.resetFields();
    setRegisterPassword('');
    forgotForm.resetFields();
    setForgotPassword('');
    setForgotVerified(false);
    setForgotToken('');
    navigate(
      next === 'login' ? '/login' : next === 'register' ? '/register' : '/forgot-password',
      { replace: true },
    );
  };

  const openForgotPassword = () => {
    setMode('forgot');
    setRegisterStep(0);
    setVerifiedPhone('');
    setVerificationToken('');
    forgotForm.resetFields();
    setForgotPassword('');
    setForgotVerified(false);
    setForgotToken('');
    navigate('/forgot-password', { replace: true });
  };

  const sendForgotSms = useCallback(async () => {
    try {
      const phone = forgotForm.getFieldValue('phone');
      await forgotForm.validateFields(['phone']);
      setSmsSending(true);
      const result = await sendSmsCode(String(phone), 'reset_password');
      message.success('验证码已发送');
      setSmsCountdown(Math.min(result.expiresIn ?? SMS_COUNTDOWN_SEC, SMS_COUNTDOWN_SEC));
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(err instanceof Error ? err.message : '发送验证码失败');
    } finally {
      setSmsSending(false);
    }
  }, [forgotForm]);

  const onVerifyForgotPhone = async (values: { phone: string; smsCode: string }) => {
    const phone = values.phone.replace(/[\s-]/g, '');
    setForgotSubmitting(true);
    try {
      const token = await verifySmsCode(phone, values.smsCode, 'reset_password');
      setVerifiedPhone(phone);
      setForgotToken(token);
      setForgotVerified(true);
      message.success('手机号验证成功，请设置新密码');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '验证码校验失败');
    } finally {
      setForgotSubmitting(false);
    }
  };

  const onSubmitNewPassword = async (values: { password: string; confirm: string }) => {
    if (!verifiedPhone || !forgotToken) {
      message.error('请先完成手机号验证');
      return;
    }
    const pwdError = validatePassword(values.password);
    if (pwdError) {
      message.error(pwdError);
      return;
    }
    if (values.password !== values.confirm) {
      message.error('两次密码不一致');
      return;
    }

    setLoading(true);
    try {
      await resetPasswordBySms({
        phone: verifiedPhone,
        verificationToken: forgotToken,
        newPassword: values.password,
      });
      message.success('密码重置成功，请使用新密码登录');
      switchMode('login');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '重置密码失败');
    } finally {
      setLoading(false);
    }
  };

  const onLogin = async (values: { account: string; password: string; remember?: boolean }) => {
    const account = values.account.trim();
    const normalized = account.replace(/[\s-]/g, '');
    if (loginType === 'email') {
      if (!isEmail(account)) {
        message.error('请输入正确的邮箱');
        return;
      }
    } else if (!isPhone(normalized)) {
      message.error('请输入正确的手机号');
      return;
    }

    setLoading(true);
    try {
      await authStore.login(
        loginType === 'phone' ? normalized : account,
        values.password,
        values.remember !== false,
        loginType,
      );
      message.success('登录成功');
      navigate(redirect && redirect.startsWith('/') ? redirect : appPath.workspaceSelect, { replace: true });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSendSms = useCallback(async () => {
    try {
      const phone = phoneForm.getFieldValue('phone');
      await phoneForm.validateFields(['phone']);
      setSmsSending(true);
      const result = await sendSmsCode(String(phone), 'register');
      message.success('验证码已发送');
      setSmsCountdown(Math.min(result.expiresIn ?? SMS_COUNTDOWN_SEC, SMS_COUNTDOWN_SEC));
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(err instanceof Error ? err.message : '发送验证码失败');
    } finally {
      setSmsSending(false);
    }
  }, [phoneForm]);

  const onVerifyPhone = async (values: { phone: string; smsCode: string }) => {
    const phone = values.phone.replace(/[\s-]/g, '');
    setLoading(true);
    try {
      const token = await verifySmsCode(phone, values.smsCode, 'register');
      setVerifiedPhone(phone);
      setVerificationToken(token);
      setRegisterStep(1);
      message.success('手机号验证成功');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '验证码校验失败');
    } finally {
      setLoading(false);
    }
  };

  const onRegister = async (values: {
    displayName: string;
    email: string;
    password: string;
    confirm: string;
    agreement?: boolean;
  }) => {
    if (!verifiedPhone || !verificationToken) {
      message.error('请先完成手机号验证');
      setRegisterStep(0);
      return;
    }
    if (!values.agreement) {
      message.error('请先阅读并同意用户协议和隐私政策');
      return;
    }

    const pwdError = validatePassword(values.password);
    if (pwdError) {
      message.error(pwdError);
      return;
    }
    if (values.password !== values.confirm) {
      message.error('两次密码不一致');
      return;
    }

    setLoading(true);
    try {
      await authStore.register(
        values.email,
        values.password,
        values.displayName,
        verifiedPhone,
        verificationToken,
      );
      message.success('注册成功，欢迎使用零一文档');
      navigate(appPath.workspaceSelect, { replace: true });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '注册失败');
    } finally {
      setLoading(false);
    }
  };

  const heading = mode === 'login'
    ? { title: '欢迎回来', subtitle: loginType === 'phone' ? '使用手机号登录零一文档' : '使用邮箱登录零一文档' }
    : mode === 'forgot'
      ? forgotVerified
        ? { title: '设置新密码', subtitle: '请输入新密码以完成重置' }
        : { title: '找回密码', subtitle: '通过手机号验证后重置登录密码' }
      : registerStep === 0
        ? { title: '创建账号', subtitle: '验证手机号，开启高效协作' }
        : { title: '完善信息', subtitle: '设置姓名、邮箱与登录密码' };

  return (
    <AuthPageLayout>
      <div className="auth-panel-inner">
        <h1 className="auth-heading">{heading.title}</h1>
        <p className="auth-subheading">{heading.subtitle}</p>

        {mode === 'login' ? (
          <>
            {suspended && (
              <Alert
                type="error"
                showIcon
                message="账号已被禁用"
                description="请联系管理员恢复账号后再登录。"
                style={{ marginBottom: 16 }}
              />
            )}
            <Form
              form={loginForm}
              className="auth-form"
              layout="vertical"
              onFinish={onLogin}
              requiredMark={false}
              initialValues={{
                account: authStore.getRememberedEmail(),
                remember: true,
              }}
            >
              <div className="auth-tabs" role="tablist" style={{ marginBottom: 20 }}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={loginType === 'email'}
                  className={`auth-tab${loginType === 'email' ? ' active' : ''}`}
                  onClick={() => setLoginType('email')}
                >
                  邮箱登录
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={loginType === 'phone'}
                  className={`auth-tab${loginType === 'phone' ? ' active' : ''}`}
                  onClick={() => setLoginType('phone')}
                >
                  手机号登录
                </button>
              </div>
              <Form.Item
                name="account"
                label={loginType === 'phone' ? '手机号' : '邮箱'}
                rules={[
                  {
                    required: true,
                    message: loginType === 'phone' ? '请输入手机号' : '请输入邮箱',
                  },
                ]}
              >
                <Input
                  size="large"
                  placeholder={loginType === 'phone' ? '请输入手机号' : '请输入邮箱'}
                  autoComplete="username"
                />
              </Form.Item>
              <Form.Item
                name="password"
                label="密码"
                rules={[{ required: true, message: '请输入密码' }]}
              >
                <Input.Password size="large" placeholder="请输入密码" autoComplete="current-password" />
              </Form.Item>
              <div className="auth-form-row">
                <Form.Item name="remember" valuePropName="checked">
                  <Checkbox>记住我</Checkbox>
                </Form.Item>
                <button type="button" className="auth-link-button" onClick={openForgotPassword}>
                  忘记密码？
                </button>
              </div>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" size="large" block loading={loading} className="auth-submit">
                  登录
                </Button>
              </Form.Item>
            </Form>
            {oauthProviders.length > 0 && (
              <div className="auth-oauth">
                <div className="auth-oauth-divider"><span>或</span></div>
                {oauthProviders.map(provider => (
                  <Button
                    key={provider.provider}
                    size="large"
                    block
                    className={`auth-oauth-btn auth-oauth-btn--${provider.provider}`}
                    onClick={() => startOAuthLogin(
                      provider.provider,
                      redirect && redirect.startsWith('/') ? redirect : '/',
                    )}
                  >
                    {provider.name}扫码登录
                  </Button>
                ))}
              </div>
            )}
            <div className="auth-footer">
              还没有账号？
              <button type="button" className="auth-link-button" onClick={() => switchMode('register')}>
                立即注册
              </button>
            </div>
          </>
        ) : mode === 'forgot' ? (
          <>
            <div className="auth-steps" aria-hidden>
              <span className={`auth-step-dot${!forgotVerified ? ' active' : ''}`} />
              <span className={`auth-step-dot${forgotVerified ? ' active' : ''}`} />
            </div>

            {!forgotVerified ? (
              <Form
                form={forgotForm}
                className="auth-form"
                layout="vertical"
                onFinish={onVerifyForgotPhone}
                requiredMark={(label, { required }) => (
                  <>
                    {label}
                    {required && <span style={{ color: '#f54a45', marginLeft: 2 }}>*</span>}
                  </>
                )}
              >
                <Form.Item
                  name="phone"
                  label="手机号"
                  rules={[
                    { required: true, message: '请输入手机号' },
                    {
                      validator: async (_, value) => {
                        if (!value || isPhone(String(value))) return;
                        throw new Error('请输入正确的手机号');
                      },
                    },
                  ]}
                >
                  <Input size="large" placeholder="请输入手机号" maxLength={11} autoComplete="tel" />
                </Form.Item>
                <Form.Item label="验证码" required style={{ marginBottom: 24 }}>
                  <div className="auth-sms-row">
                    <Form.Item
                      name="smsCode"
                      noStyle
                      rules={[
                        { required: true, message: '请输入验证码' },
                        { pattern: /^\d{4,8}$/, message: '验证码格式不正确' },
                      ]}
                    >
                      <Input size="large" placeholder="请输入验证码" maxLength={8} autoComplete="one-time-code" />
                    </Form.Item>
                    <Button
                      htmlType="button"
                      className="auth-sms-btn"
                      size="large"
                      disabled={smsCountdown > 0}
                      loading={smsSending}
                      onClick={sendForgotSms}
                    >
                      {smsCountdown > 0 ? `${smsCountdown}s 后重发` : '获取验证码'}
                    </Button>
                  </div>
                </Form.Item>
                <Form.Item style={{ marginBottom: 0 }}>
                  <Button type="primary" htmlType="submit" size="large" block loading={forgotSubmitting} className="auth-submit">
                    下一步
                  </Button>
                </Form.Item>
              </Form>
            ) : (
              <>
                <div className="auth-step-back">
                  <button
                    type="button"
                    className="auth-link-button"
                    onClick={() => {
                      setForgotVerified(false);
                      setForgotToken('');
                      setVerifiedPhone('');
                      setForgotPassword('');
                      forgotForm.resetFields(['password', 'confirm']);
                    }}
                  >
                    ← 返回修改手机号
                  </button>
                </div>
                <Form
                  form={forgotForm}
                  className="auth-form"
                  layout="vertical"
                  onFinish={onSubmitNewPassword}
                  requiredMark={(label, { required }) => (
                    <>
                      {label}
                      {required && <span style={{ color: '#f54a45', marginLeft: 2 }}>*</span>}
                    </>
                  )}
                >
                  <Form.Item label="手机号">
                    <Input size="large" value={verifiedPhone} disabled />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label="新密码"
                    rules={[
                      { required: true, message: '请设置新密码' },
                      {
                        validator: async (_, value) => {
                          const err = validatePassword(value || '');
                          if (err) throw new Error(err);
                        },
                      },
                    ]}
                    extra={PASSWORD_HINT}
                  >
                    <Input.Password
                      size="large"
                      placeholder="请输入新密码"
                      autoComplete="new-password"
                      onChange={e => setForgotPassword(e.target.value)}
                    />
                  </Form.Item>
                  <PasswordRuleList password={forgotPassword} />
                  <Form.Item
                    name="confirm"
                    label="确认新密码"
                    dependencies={['password']}
                    rules={[
                      { required: true, message: '请再次输入新密码' },
                      ({ getFieldValue }) => ({
                        validator: async (_, value) => {
                          if (!value || getFieldValue('password') === value) return;
                          throw new Error('两次密码不一致');
                        },
                      }),
                    ]}
                    style={{ marginTop: 16 }}
                  >
                    <Input.Password size="large" placeholder="再次输入新密码" autoComplete="new-password" />
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button type="primary" htmlType="submit" size="large" block loading={loading} className="auth-submit">
                      重置密码
                    </Button>
                  </Form.Item>
                </Form>
              </>
            )}
            <div className="auth-footer">
              想起密码了？
              <button type="button" className="auth-link-button" onClick={() => switchMode('login')}>
                返回登录
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="auth-steps" aria-hidden>
              <span className={`auth-step-dot${registerStep === 0 ? ' active' : ''}`} />
              <span className={`auth-step-dot${registerStep === 1 ? ' active' : ''}`} />
            </div>

            {registerStep === 0 ? (
              <Form
                form={phoneForm}
                className="auth-form"
                layout="vertical"
                onFinish={onVerifyPhone}
                requiredMark={(label, { required }) => (
                  <>
                    {label}
                    {required && <span style={{ color: '#f54a45', marginLeft: 2 }}>*</span>}
                  </>
                )}
              >
                <Form.Item
                  name="phone"
                  label="手机号"
                  rules={[
                    { required: true, message: '请输入手机号' },
                    {
                      validator: async (_, value) => {
                        if (!value || isPhone(String(value))) return;
                        throw new Error('请输入正确的手机号');
                      },
                    },
                  ]}
                >
                  <Input size="large" placeholder="请输入手机号" maxLength={11} autoComplete="tel" />
                </Form.Item>
                <Form.Item label="验证码" required style={{ marginBottom: 24 }}>
                  <div className="auth-sms-row">
                    <Form.Item
                      name="smsCode"
                      noStyle
                      rules={[
                        { required: true, message: '请输入验证码' },
                        { pattern: /^\d{4,8}$/, message: '验证码格式不正确' },
                      ]}
                    >
                      <Input size="large" placeholder="请输入验证码" maxLength={8} autoComplete="one-time-code" />
                    </Form.Item>
                    <Button
                      htmlType="button"
                      className="auth-sms-btn"
                      size="large"
                      disabled={smsCountdown > 0}
                      loading={smsSending}
                      onClick={handleSendSms}
                    >
                      {smsCountdown > 0 ? `${smsCountdown}s 后重发` : '获取验证码'}
                    </Button>
                  </div>
                </Form.Item>
                <Form.Item style={{ marginBottom: 0 }}>
                  <Button type="primary" htmlType="submit" size="large" block loading={loading} className="auth-submit">
                    下一步
                  </Button>
                </Form.Item>
              </Form>
            ) : (
              <>
                <div className="auth-step-back">
                  <button
                    type="button"
                    className="auth-link-button"
                    onClick={() => {
                      setRegisterStep(0);
                      setVerifiedPhone('');
                      setVerificationToken('');
                    }}
                  >
                    ← 返回修改手机号
                  </button>
                </div>
                <Form
                  form={registerForm}
                  className="auth-form"
                  layout="vertical"
                  onFinish={onRegister}
                  requiredMark={(label, { required }) => (
                    <>
                      {label}
                      {required && <span style={{ color: '#f54a45', marginLeft: 2 }}>*</span>}
                    </>
                  )}
                >
                  <Form.Item label="手机号">
                    <Input size="large" value={verifiedPhone} disabled />
                  </Form.Item>
                  <Form.Item
                    name="displayName"
                    label="姓名"
                    rules={[
                      { required: true, message: '请输入真实姓名' },
                      { max: 50, message: '姓名不超过 50 字' },
                    ]}
                  >
                    <Input size="large" placeholder="请输入真实姓名" maxLength={50} />
                  </Form.Item>
                  <Form.Item
                    name="email"
                    label="邮箱"
                    rules={[
                      { required: true, message: '请输入邮箱地址' },
                      { type: 'email', message: '邮箱格式不正确' },
                    ]}
                  >
                    <Input size="large" placeholder="请输入邮箱地址" autoComplete="email" />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label="密码"
                    rules={[
                      { required: true, message: '请设置登录密码' },
                      {
                        validator: async (_, value) => {
                          const err = validatePassword(value || '');
                          if (err) throw new Error(err);
                        },
                      },
                    ]}
                    extra={PASSWORD_HINT}
                  >
                    <Input.Password
                      size="large"
                      placeholder="设置登录密码"
                      autoComplete="new-password"
                      onChange={e => setRegisterPassword(e.target.value)}
                    />
                  </Form.Item>
                  <PasswordRuleList password={registerPassword} />
                  <Form.Item
                    name="confirm"
                    label="确认密码"
                    dependencies={['password']}
                    rules={[
                      { required: true, message: '请再次输入密码' },
                      ({ getFieldValue }) => ({
                        validator: async (_, value) => {
                          if (!value || getFieldValue('password') === value) return;
                          throw new Error('两次密码不一致');
                        },
                      }),
                    ]}
                    style={{ marginTop: 16 }}
                  >
                    <Input.Password size="large" placeholder="再次输入密码" autoComplete="new-password" />
                  </Form.Item>
                  <Form.Item
                    name="agreement"
                    valuePropName="checked"
                    rules={[
                      {
                        validator: async (_, value) => {
                          if (value) return;
                          throw new Error('请先阅读并同意用户协议和隐私政策');
                        },
                      },
                    ]}
                  >
                    <Checkbox>
                      我已阅读并同意
                      <button type="button" className="auth-link-button" style={{ margin: '0 4px' }} onClick={() => message.info('用户协议开发中')}>
                        用户协议
                      </button>
                      和
                      <button type="button" className="auth-link-button" style={{ margin: '0 4px' }} onClick={() => message.info('隐私政策开发中')}>
                        隐私政策
                      </button>
                    </Checkbox>
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button type="primary" htmlType="submit" size="large" block loading={loading} className="auth-submit">
                      注册账号
                    </Button>
                  </Form.Item>
                </Form>
              </>
            )}
            <div className="auth-footer">
              已有账号？
              <button type="button" className="auth-link-button" onClick={() => switchMode('login')}>
                立即登录
              </button>
            </div>
          </>
        )}
      </div>
    </AuthPageLayout>
  );
};
