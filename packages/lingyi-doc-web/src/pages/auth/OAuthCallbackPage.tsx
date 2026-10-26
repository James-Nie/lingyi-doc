/**
 * 第三方扫码登录回调页
 * 后端把令牌放在 URL fragment（不进服务端日志），此处提取后立即写入本地存储并清空地址，
 * 随后跳转到用户原本要去的业务路径。
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin, Result, Button } from 'antd';
import { AuthPageLayout } from '../../components/auth/AuthPageLayout';
import { authStore } from '../../stores/authStore';
import { parseOAuthCallbackFragment } from '../../services/oauthApi';

export const OAuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    // 防止 StrictMode 下重复执行导致 refresh token 被消费两次
    if (handledRef.current) return;
    handledRef.current = true;

    const { accessToken, refreshToken, redirect, error: fragmentError } =
      parseOAuthCallbackFragment(window.location.hash);

    // 令牌已读入内存，立刻清空地址栏，避免令牌残留在浏览器历史
    window.history.replaceState(null, '', window.location.pathname);

    if (fragmentError) {
      setError(fragmentError);
      return;
    }
    if (!accessToken || !refreshToken) {
      setError('登录凭证缺失，请重新扫码登录');
      return;
    }

    (async () => {
      try {
        await authStore.loginWithTokens(accessToken, refreshToken);
        navigate(redirect.startsWith('/') ? redirect : '/', { replace: true });
      } catch (err) {
        setError((err as Error).message || '登录失败，请重新扫码');
      }
    })();
  }, [navigate]);

  return (
    <AuthPageLayout>
      {error ? (
        <Result
          status="warning"
          title="扫码登录未完成"
          subTitle={error}
          extra={
            <Button type="primary" onClick={() => navigate('/login', { replace: true })}>
              返回登录
            </Button>
          }
        />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
          <Spin tip="正在完成登录…" size="large">
            <div style={{ width: 160, height: 80 }} />
          </Spin>
        </div>
      )}
    </AuthPageLayout>
  );
};
