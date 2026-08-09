import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { message } from 'antd';
import type { CellValue, ColumnDef, ColumnType } from '@lingyi-doc/core';
import { PublicFormFillView, type PublicFormSchemaField } from '@lingyi-doc/editor-pro';
import {
  DocumentShareApi,
  type PublicFormAccessPending,
  type PublicFormSchema,
  type PublicFormStats,
} from '../api/documentShare';
import { PublicFormAdminBar, type PublicFormAdminPanel } from '../components/formShare/PublicFormAdminBar';
import { PublicFormStatsCard } from '../components/formShare/PublicFormStatsCard';
import { PublicFormSubmissionsPanel } from '../components/formShare/PublicFormSubmissionsPanel';
import { PublicFormSupportFooter } from '../components/formShare/PublicFormSupportFooter';
import { mapApiSubmissions, type FormSubmissionItem } from '../components/formShare/formSubmissionUtils';
import { parseFormShareParams } from '../utils/formShareLink';

function isAccessPending(v: unknown): v is PublicFormAccessPending {
  return !!v && typeof v === 'object' && (v as PublicFormAccessPending).requirePassword === true;
}

function toSchemaFields(schema: PublicFormSchema): PublicFormSchemaField[] {
  return schema.fields.map(f => ({
    fieldId: f.fieldId,
    question: f.question,
    description: f.description,
    required: f.required,
    column: {
      ...f.column,
      id: f.column.id,
      name: f.column.name,
      type: (f.column.type || 'text') as ColumnType,
    } as ColumnDef,
  }));
}

/** 公开表单填写页：独立 form API，强校验 token；管理员可见右上角管理操作 */
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

  const [schema, setSchema] = useState<PublicFormSchema | null>(null);
  const [pending, setPending] = useState<PublicFormAccessPending | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [adminPanel, setAdminPanel] = useState<PublicFormAdminPanel>('none');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [stats, setStats] = useState<PublicFormStats | null>(null);
  const [submissions, setSubmissions] = useState<FormSubmissionItem[]>([]);
  const [reviewValues, setReviewValues] = useState<Record<string, CellValue> | null>(null);

  const formQuery = useMemo(() => ({
    token,
    sheetId,
    viewId,
    password: password || undefined,
  }), [token, sheetId, viewId, password]);

  const load = useCallback(async (pwd?: string, opts?: { soft?: boolean }) => {
    if (!opts?.soft) setLoading(true);
    setError(null);
    try {
      if (!token) {
        throw new Error('分享链接无效，缺少 token');
      }
      if (!sheetId || !viewId) {
        throw new Error('分享链接无效，缺少表单参数');
      }

      const raw = await DocumentShareApi.getPublicForm(spaceSlug, bookSlug, docSlug, {
        token,
        sheetId,
        viewId,
        password: pwd || undefined,
      });

      if (isAccessPending(raw)) {
        setPending(raw);
        setSchema(null);
        return;
      }

      setPending(null);
      setSchema(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '无法打开表单';
      if (msg.includes('登录') || msg.includes('110001')) {
        const returnUrl = `${window.location.pathname}${window.location.search}`;
        navigate(`/login?redirect=${encodeURIComponent(returnUrl)}`, { replace: true });
        return;
      }
      setError(msg);
      setSchema(null);
    } finally {
      if (!opts?.soft) setLoading(false);
    }
  }, [spaceSlug, bookSlug, docSlug, token, sheetId, viewId, navigate]);

  useEffect(() => {
    setSchema(null);
    setPending(null);
    setError(null);
    setPassword('');
    setSubmitted(false);
    setSubmitError(null);
    setAdminPanel('none');
    setSelectedRecordId(null);
    setStats(null);
    setSubmissions([]);
    setReviewValues(null);
  }, [spaceSlug, bookSlug, docSlug, token, sheetId, viewId]);

  useEffect(() => {
    void load();
  }, [load]);

  const reloadAdminData = useCallback(async () => {
    if (!schema?.canManage) return;
    try {
      const [statsRes, listRes] = await Promise.all([
        DocumentShareApi.getPublicFormStats(spaceSlug, bookSlug, docSlug, formQuery),
        DocumentShareApi.listPublicFormSubmissions(spaceSlug, bookSlug, docSlug, formQuery),
      ]);
      setStats(statsRes);
      setSubmissions(mapApiSubmissions(listRes.items));
    } catch {
      setStats(null);
      setSubmissions([]);
    }
  }, [schema?.canManage, spaceSlug, bookSlug, docSlug, formQuery]);

  useEffect(() => {
    if (!schema?.canManage) return;
    void reloadAdminData();
  }, [schema?.canManage, reloadAdminData]);

  useEffect(() => {
    if (adminPanel !== 'submissions') {
      setReviewValues(null);
      return;
    }
    const activeId = selectedRecordId ?? submissions[0]?.recordId;
    if (!activeId) {
      setReviewValues(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const detail = await DocumentShareApi.getPublicFormSubmissionDetail(
          spaceSlug,
          bookSlug,
          docSlug,
          activeId,
          formQuery,
        );
        if (!cancelled) {
          setReviewValues(detail.fieldValues as Record<string, CellValue>);
        }
      } catch {
        if (!cancelled) setReviewValues(null);
      }
    })();
    return () => { cancelled = true; };
  }, [adminPanel, selectedRecordId, submissions, spaceSlug, bookSlug, docSlug, formQuery]);

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
      if (schema?.canManage) {
        void reloadAdminData();
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const buildEditorUrl = useCallback((opts?: { grid?: boolean }) => {
    const params = new URLSearchParams();
    if (sheetId) params.set('sheetId', sheetId);
    if (!opts?.grid && viewId) params.set('viewId', viewId);
    if (opts?.grid) params.set('view', 'grid');
    const qs = params.toString();
    return `/${spaceSlug}/${bookSlug}/${docSlug}${qs ? `?${qs}` : ''}`;
  }, [spaceSlug, bookSlug, docSlug, sheetId, viewId]);

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

  if (error || !schema) {
    return (
      <PageShell>
        <CenterText style={{ color: '#d83931' }}>{error ?? '无法打开表单'}</CenterText>
      </PageShell>
    );
  }

  const isAdmin = schema.canManage;
  const reviewingSubmissions = isAdmin && adminPanel === 'submissions';
  const activeSubmission = reviewingSubmissions
    ? (submissions.find(s => s.recordId === selectedRecordId) ?? submissions[0] ?? null)
    : null;
  const shareLink = typeof window !== 'undefined'
    ? window.location.href
    : `/${spaceSlug}/${bookSlug}/${docSlug}?form=1&sheetId=${sheetId}&viewId=${viewId}&token=${token}`;
  const fields = toSchemaFields(schema);

  const openSubmissions = () => {
    setAdminPanel('submissions');
    setSelectedRecordId(submissions[0]?.recordId ?? null);
  };

  return (
    <PublicFormFillView
      title={schema.title}
      description={schema.description}
      fields={fields}
      submitting={submitting}
      submitted={submitted}
      submitError={submitError}
      onSubmit={values => void handleSubmit(values)}
      onSubmitAgain={() => setSubmitted(false)}
      supportFooter={<PublicFormSupportFooter />}
      readOnly={reviewingSubmissions && !!activeSubmission}
      reviewValues={reviewValues}
      reviewKey={activeSubmission?.recordId ?? (reviewingSubmissions ? 'empty' : 'fill')}
      headerExtra={isAdmin ? (
        <PublicFormAdminBar
          activePanel={adminPanel}
          shareLink={shareLink}
          onEditForm={() => navigate(buildEditorUrl())}
          onToggleStats={() => setAdminPanel(p => (p === 'stats' ? 'none' : 'stats'))}
          onToggleSubmissions={() => {
            if (adminPanel === 'submissions') {
              setAdminPanel('none');
              setSelectedRecordId(null);
            } else {
              openSubmissions();
            }
          }}
        />
      ) : undefined}
      leftSidebar={reviewingSubmissions ? (
        <PublicFormSubmissionsPanel
          items={submissions}
          selectedRecordId={activeSubmission?.recordId ?? null}
          onSelect={setSelectedRecordId}
          onClose={() => {
            setAdminPanel('none');
            setSelectedRecordId(null);
          }}
        />
      ) : undefined}
      contentOverlay={isAdmin && adminPanel === 'stats' ? (
        <PublicFormStatsCard
          title={schema.title}
          submittedCount={stats?.submittedCount ?? 0}
          requiredCount={stats?.requiredCount ?? 0}
          submittedPeopleCount={stats?.submittedPeopleCount ?? 0}
          pendingRequiredCount={stats?.pendingRequiredCount ?? 0}
          onViewResults={() => navigate(buildEditorUrl({ grid: true }))}
          onUrgeFill={() => message.info('催填功能开发中')}
          onViewPendingRequired={() => message.info('必填人未提交列表开发中')}
        />
      ) : undefined}
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
