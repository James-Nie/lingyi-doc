import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { CellValue } from '@lingyi-doc/core';
import { DocumentManager } from '@lingyi-doc/core';
import { PublicFormFillView } from '@lingyi-doc/editor';
import { DocumentShareApi } from '../api/documentShare';
import { parseFormShareParams } from '../utils/formShareLink';
import { resolvePublicFormFromWorkbook, type ResolvedPublicForm } from '../utils/resolvePublicForm';

interface PathAccessPending {
  requirePassword: true;
  title: string;
  docType: string;
}

function isAccessPending(v: unknown): v is PathAccessPending {
  return !!v && typeof v === 'object' && (v as PathAccessPending).requirePassword === true;
}

/** 公开表单填写页：无菜单、无编辑器，仅展示填写界面 */
export const PublicFormFillPage: React.FC = () => {
  const { spaceSlug = '', bookSlug = '', docSlug = '' } = useParams<{
    spaceSlug: string;
    bookSlug: string;
    docSlug: string;
  }>();
  const [searchParams] = useSearchParams();
  const { sheetId, viewId } = parseFormShareParams(searchParams);
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const [docData, setDocData] = useState<unknown>(null);
  const [pending, setPending] = useState<PathAccessPending | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async (pwd?: string) => {
    setLoading(true);
    setError(null);
    try {
      if (!token) {
        throw new Error('分享链接无效，缺少 token');
      }
      if (!sheetId || !viewId) {
        throw new Error('分享链接无效，缺少表单参数');
      }

      const raw = pwd
        ? await DocumentManager.verifyDocumentByPath(spaceSlug, bookSlug, docSlug, { token, password: pwd })
        : await DocumentManager.fetchDocumentByPath(spaceSlug, bookSlug, docSlug, { token });

      if (isAccessPending(raw)) {
        setPending(raw);
        setDocData(null);
        return;
      }

      if (!raw.data) throw new Error('无法加载表单');
      resolvePublicFormFromWorkbook(raw.data, sheetId, viewId);
      setPending(null);
      setDocData(raw.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '无法打开表单';
      if (msg.includes('登录') || msg.includes('110001')) {
        const returnUrl = `${window.location.pathname}${window.location.search}`;
        navigate(`/login?redirect=${encodeURIComponent(returnUrl)}`, { replace: true });
        return;
      }
      setError(msg);
      setDocData(null);
    } finally {
      setLoading(false);
    }
  }, [spaceSlug, bookSlug, docSlug, token, sheetId, viewId, navigate]);

  useEffect(() => {
    setDocData(null);
    setPending(null);
    setError(null);
    setPassword('');
    setSubmitted(false);
    setSubmitError(null);
  }, [spaceSlug, bookSlug, docSlug, token, sheetId, viewId]);

  useEffect(() => {
    void load();
  }, [load]);

  const formContext = useMemo((): ResolvedPublicForm | { error: string } | null => {
    if (!docData) return null;
    try {
      return resolvePublicFormFromWorkbook(docData, sheetId, viewId);
    } catch (err) {
      return { error: err instanceof Error ? err.message : '无法解析表单' };
    }
  }, [docData, sheetId, viewId]);

  const handleVerifyPassword = async () => {
    setVerifying(true);
    try {
      await load(password);
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async (values: Record<string, CellValue>) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await DocumentShareApi.submitPublicForm(spaceSlug, bookSlug, docSlug, {
        token,
        password: password || undefined,
        sheetId,
        viewId,
        fieldValues: values,
      });
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !pending) {
    return <PageShell><CenterText>正在加载表单…</CenterText></PageShell>;
  }

  if (pending) {
    return (
      <PageShell title={pending.title}>
        <div style={cardStyle}>
          <div style={{ fontSize: 14, color: '#646a73', marginBottom: 8 }}>此表单需要访问密码</div>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="请输入访问密码"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px',
              border: '1px solid #dee0e3', borderRadius: 6, fontSize: 14, marginBottom: 8,
            }}
            onKeyDown={e => { if (e.key === 'Enter') void handleVerifyPassword(); }}
          />
          {error && <div style={{ color: '#d83931', fontSize: 13, marginBottom: 8 }}>{error}</div>}
          <button
            type="button"
            disabled={verifying}
            onClick={() => void handleVerifyPassword()}
            style={{
              width: '100%', padding: '10px 12px', border: 'none', borderRadius: 6,
              background: '#3370ff', color: '#fff', fontSize: 14, cursor: 'pointer',
            }}
          >
            {verifying ? '验证中…' : '进入表单'}
          </button>
        </div>
      </PageShell>
    );
  }

  if (error || !formContext || 'error' in formContext) {
    const message = error ?? (formContext && 'error' in formContext ? formContext.error : '无法打开表单');
    return (
      <PageShell>
        <CenterText style={{ color: '#d83931' }}>{message}</CenterText>
      </PageShell>
    );
  }

  return (
    <PublicFormFillView
      table={formContext.table}
      formView={formContext.formView}
      submitting={submitting}
      submitted={submitted}
      submitError={submitError}
      onSubmit={values => void handleSubmit(values)}
      onSubmitAgain={() => setSubmitted(false)}
    />
  );
};

function PageShell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#E8EDF5', padding: title ? '48px 24px' : 0 }}>
      <div style={{ maxWidth: title ? 480 : undefined, margin: '0 auto' }}>
        {title && (
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#1f2329', marginBottom: 16, textAlign: 'center' }}>
            {title}
          </h1>
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
  maxWidth: 360,
  margin: '0 auto',
};
