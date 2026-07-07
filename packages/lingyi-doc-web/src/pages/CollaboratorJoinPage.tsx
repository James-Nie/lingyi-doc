import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  DocumentShareApi,
  type CollaboratorJoinInfo,
} from '../api/documentShare';
import { authStore } from '../stores/authStore';
import { appPath } from '../utils/appPaths';

export const CollaboratorJoinPage: React.FC = () => {
  const { spaceSlug = '', bookSlug = '', docSlug = '' } = useParams<{
    spaceSlug: string;
    bookSlug: string;
    docSlug: string;
  }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const [info, setInfo] = useState<CollaboratorJoinInfo | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!token || !spaceSlug || !bookSlug || !docSlug) {
      setError('分享链接无效');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    DocumentShareApi.getCollaboratorJoinInfo(spaceSlug, bookSlug, docSlug, token)
      .then(res => {
        setInfo(res);
        if (res.closed) setError('分享已关闭');
        else if (res.expired) setError('分享链接已过期');
        else if (res.alreadyCollaborator || res.joinRequestStatus === 'approved') {
          navigate(res.docUrl, { replace: true });
        } else if (res.joinRequestStatus === 'pending') {
          setApplied(true);
        }
      })
      .catch(err => setError(err instanceof Error ? err.message : '无法加载分享信息'))
      .finally(() => setLoading(false));
  }, [spaceSlug, bookSlug, docSlug, token, navigate]);

  const handleApply = async () => {
    if (!authStore.isAuthenticated()) {
      const returnUrl = `${window.location.pathname}${window.location.search}`;
      navigate(`/login?redirect=${encodeURIComponent(returnUrl)}`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await DocumentShareApi.applyCollaboratorJoin(
        spaceSlug,
        bookSlug,
        docSlug,
        token,
        message || undefined,
      );
      if (res.status === 'approved') {
        navigate(res.docUrl, { replace: true });
      } else {
        setApplied(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '申请失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Shell><CenterText>加载中…</CenterText></Shell>;
  }

  if (error && !info) {
    return <Shell><CenterText style={{ color: '#d83931' }}>{error}</CenterText></Shell>;
  }

  if (!info) {
    return <Shell><CenterText>无法打开此分享</CenterText></Shell>;
  }

  if (applied) {
    return (
      <Shell title={info.title}>
        <div style={cardStyle}>
          <div style={{ fontSize: 15, color: '#1f2329', marginBottom: 8 }}>申请已提交</div>
          <div style={{ fontSize: 13, color: '#646a73', lineHeight: 1.6 }}>
            文档拥有者审核通过后，你将可以访问该文档。审核通过后请使用文档链接打开：
          </div>
          <div style={{
            marginTop: 12, padding: '10px 12px', background: '#f5f6f7',
            borderRadius: 6, fontSize: 13, wordBreak: 'break-all',
          }}>
            {window.location.origin}{info.docUrl}
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={info.title}>
      <div style={cardStyle}>
        <div style={{ fontSize: 13, color: '#646a73', marginBottom: 16 }}>
          申请加入后，需文档拥有者审核通过方可查看。
        </div>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="可选：向文档拥有者说明申请理由"
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '10px 12px',
            border: '1px solid #dee0e3', borderRadius: 6, fontSize: 14,
            marginBottom: 12, resize: 'vertical',
          }}
        />
        {error && <div style={{ color: '#d83931', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <button
          type="button"
          disabled={submitting || info.closed || info.expired}
          onClick={() => void handleApply()}
          style={{
            width: '100%', padding: '10px 12px', border: 'none', borderRadius: 6,
            background: '#3370ff', color: '#fff', fontSize: 14, cursor: 'pointer',
          }}
        >
          {submitting ? '提交中…' : authStore.isAuthenticated() ? '申请加入文档' : '登录并申请加入'}
        </button>
      </div>
    </Shell>
  );
};

/** 旧版 /g/.../link/join 兼容：重定向到 canonical 路径 */
export const PublicLinkJoinPage: React.FC = () => {
  const { spaceSlug = '', bookSlug = '', docSlug = '' } = useParams<{
    spaceSlug: string;
    bookSlug: string;
    docSlug: string;
  }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  if (!token) {
    return <Shell><CenterText style={{ color: '#d83931' }}>分享链接无效</CenterText></Shell>;
  }

  const params = new URLSearchParams(searchParams);
  return <Navigate to={`${appPath.docPublic(spaceSlug, bookSlug, docSlug)}?${params.toString()}`} replace />;
};

function Shell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fa', padding: '48px 24px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {title && (
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#1f2329', marginBottom: 16 }}>{title}</h1>
        )}
        {children}
      </div>
    </div>
  );
}

function CenterText({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ textAlign: 'center', color: '#8f959e', padding: 48, ...style }}>{children}</div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #dee0e3',
  borderRadius: 8,
  padding: 20,
};
