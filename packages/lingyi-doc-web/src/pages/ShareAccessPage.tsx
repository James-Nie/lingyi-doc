import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DocumentShareApi, type PublicShareDocument, type PublicShareInfo } from '../api/documentShare';
import { DocumentPreviewView } from '../components/DocumentPreviewView';

export const ShareAccessPage: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [info, setInfo] = useState<PublicShareInfo | null>(null);
  const [document, setDocument] = useState<PublicShareDocument | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    DocumentShareApi.getPublicInfo(token)
      .then(res => {
        setInfo(res);
        if (res.closed) setError('分享已关闭');
        else if (res.expired) setError('分享链接已过期');
        else if (!res.requirePassword) {
          return DocumentShareApi.verifyPublic(token).then(setDocument);
        }
        return undefined;
      })
      .catch(err => setError(err instanceof Error ? err.message : '无法访问此分享'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleVerify = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const doc = await DocumentShareApi.verifyPublic(token, password || undefined);
      setDocument(doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <PageShell><div style={centerTextStyle}>加载中…</div></PageShell>;
  }

  if (error && !document) {
    return (
      <PageShell>
        <div style={{ ...centerTextStyle, color: '#d83931' }}>{error}</div>
        {info?.requirePassword && !info.closed && !info.expired && (
          <PasswordForm
            password={password}
            onPasswordChange={setPassword}
            onSubmit={() => void handleVerify()}
            submitting={submitting}
            error={error}
          />
        )}
      </PageShell>
    );
  }

  if (info?.requirePassword && !document) {
    return (
      <PageShell title={info.title}>
        <PasswordForm
          password={password}
          onPasswordChange={setPassword}
          onSubmit={() => void handleVerify()}
          submitting={submitting}
          error={error}
        />
      </PageShell>
    );
  }

  if (!document) {
    return <PageShell><div style={centerTextStyle}>无法打开文档</div></PageShell>;
  }

  return (
    <PageShell title={document.title}>
      <div style={{
        background: '#fff',
        border: '1px solid #dee0e3',
        borderRadius: 8,
        overflow: 'hidden',
        minHeight: 480,
      }}>
        <div style={{ fontSize: 12, color: '#8f959e', padding: '12px 16px', borderBottom: '1px solid #eef0f3' }}>
          只读预览 · 权限：{document.permissionLevel}
        </div>
        <DocumentPreviewView
          title={document.title}
          docType={document.docType}
          data={document.data}
        />
      </div>
    </PageShell>
  );
};

function PasswordForm({
  password,
  onPasswordChange,
  onSubmit,
  submitting,
  error,
}: {
  password: string;
  onPasswordChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <div style={{ maxWidth: 360, margin: '0 auto' }}>
      <div style={{ fontSize: 14, color: '#646a73', marginBottom: 8 }}>此文档需要访问密码</div>
      <input
        type="password"
        value={password}
        onChange={e => onPasswordChange(e.target.value)}
        placeholder="请输入访问密码"
        style={{
          width: '100%', boxSizing: 'border-box', padding: '10px 12px',
          border: '1px solid #dee0e3', borderRadius: 6, fontSize: 14, marginBottom: 8,
        }}
        onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
      />
      {error && <div style={{ color: '#d83931', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      <button
        type="button"
        disabled={submitting}
        onClick={onSubmit}
        style={{
          width: '100%', padding: '10px 12px', border: 'none', borderRadius: 6,
          background: '#3370ff', color: '#fff', fontSize: 14, cursor: 'pointer',
        }}
      >
        {submitting ? '验证中…' : '访问文档'}
      </button>
    </div>
  );
}

function PageShell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fa', padding: '48px 24px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {title && (
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#1f2329', marginBottom: 16 }}>{title}</h1>
        )}
        {children}
      </div>
    </div>
  );
}

const centerTextStyle: React.CSSProperties = {
  textAlign: 'center', color: '#8f959e', padding: 48,
};
