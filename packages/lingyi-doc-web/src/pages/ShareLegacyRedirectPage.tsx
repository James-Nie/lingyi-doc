import React, { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';

/** 旧版 /share/:token 兼容：重定向到 canonical 路径 */
export const ShareLegacyRedirectPage: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('分享链接无效');
      return;
    }
    fetch(`/api/v1/share/${encodeURIComponent(token)}/resolve-path`)
      .then(async res => {
        const json = await res.json() as { code: number; data?: { path: string }; message?: string };
        if (json.code !== 0 || !json.data?.path) {
          throw new Error(json.message || '无法解析分享链接');
        }
        setTarget(json.data.path);
      })
      .catch(err => setError(err instanceof Error ? err.message : '无法解析分享链接'));
  }, [token]);

  if (target) {
    return <Navigate to={target} replace />;
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d83931' }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8f959e' }}>
      正在跳转…
    </div>
  );
};
