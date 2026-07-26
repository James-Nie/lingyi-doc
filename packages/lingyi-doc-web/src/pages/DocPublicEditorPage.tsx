import React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DocumentManager, type DocumentApiResponse } from '@lingyi-doc/core';
import { EditorPage } from './EditorPage';
import { DocEditorPage } from './DocEditorPage';
import { MindNoteEditorPage } from './MindNoteEditorPage';
import { WhiteboardEditorPage } from './WhiteboardEditorPage';
import { authStore } from '../stores/authStore';
import { activeDocumentStore } from '../stores/activeDocumentStore';
import { useDocumentViewMode } from '../utils/documentViewMode';
import { TemplatePickerProvider } from '../components/templates/TemplatePickerContext';
import { rememberDocPathContext } from '../utils/navigateToDoc';
import type { DocPathContext } from '../api/documentShare';

interface PathAccessPending {
  requirePassword: true;
  title: string;
  docType: string;
}

function isAccessPending(v: unknown): v is PathAccessPending {
  return !!v && typeof v === 'object' && (v as PathAccessPending).requirePassword === true;
}

function toApiEntry(raw: DocumentApiResponse & { id?: string }): DocumentApiResponse & { docId: string } {
  const docId = raw.id;
  if (!docId) throw new Error('文档 ID 缺失');
  return { ...raw, docId };
}

/** 语雀风格路径 /{space}/{book}/{doc}：统一文档入口，权限由后端动态返回 */
export const DocPublicEditorPage: React.FC<{ inShell?: boolean }> = ({ inShell = false }) => {
  const { spaceSlug = '', bookSlug = '', docSlug = '' } = useParams<{
    spaceSlug: string;
    bookSlug: string;
    docSlug: string;
  }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? undefined;
  const navigate = useNavigate();

  const [entry, setEntry] = React.useState<(DocumentApiResponse & { docId: string }) | null>(null);
  const [pending, setPending] = React.useState<PathAccessPending | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async (pwd?: string) => {
    setLoading(true);
    setError(null);
    try {
      const raw = pwd
        ? await DocumentManager.verifyDocumentByPath(spaceSlug, bookSlug, docSlug, { token, password: pwd })
        : await DocumentManager.fetchDocumentByPath(spaceSlug, bookSlug, docSlug, { token });
      if (isAccessPending(raw)) {
        setPending(raw);
        setEntry(null);
        return;
      }
      if (!raw.data) throw new Error('文档不存在');
      setPending(null);
      setEntry(toApiEntry(raw));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '无法打开文档';
      if (msg.includes('登录') || msg.includes('110001')) {
        const returnUrl = `${window.location.pathname}${window.location.search}`;
        navigate(`/login?redirect=${encodeURIComponent(returnUrl)}`, { replace: true });
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [spaceSlug, bookSlug, docSlug, token, navigate]);

  React.useEffect(() => {
    setEntry(null);
    setPending(null);
    setError(null);
    setPassword('');
  }, [spaceSlug, bookSlug, docSlug, token]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!entry?.docId) return;
    activeDocumentStore.setDocId(entry.docId);
    rememberDocPathContext({
      docId: entry.docId,
      title: entry.title || '',
      spaceSlug,
      bookSlug,
      docSlug,
    } satisfies DocPathContext);
  }, [entry?.docId, entry?.title, spaceSlug, bookSlug, docSlug]);

  const access = useDocumentViewMode(entry?.docId, entry ?? {});

  const handleVerifyPassword = async () => {
    setSubmitting(true);
    try {
      await load(password);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !pending) {
    return <Shell><CenterText>正在加载文档…</CenterText></Shell>;
  }

  if (pending) {
    return (
      <Shell title={pending.title}>
        <div style={cardStyle}>
          <div style={{ fontSize: 14, color: '#646a73', marginBottom: 8 }}>此文档需要访问密码</div>
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
            disabled={submitting}
            onClick={() => void handleVerifyPassword()}
            style={{
              width: '100%', padding: '10px 12px', border: 'none', borderRadius: 6,
              background: '#3370ff', color: '#fff', fontSize: 14, cursor: 'pointer',
            }}
          >
            {submitting ? '验证中…' : '访问文档'}
          </button>
        </div>
      </Shell>
    );
  }

  if (error || !entry) {
    return (
      <Shell>
        <CenterText style={{ color: '#d83931' }}>{error ?? '无法打开文档'}</CenterText>
        {!authStore.isAuthenticated() && !token && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button
              type="button"
              onClick={() => {
                const returnUrl = `${window.location.pathname}${window.location.search}`;
                navigate(`/login?redirect=${encodeURIComponent(returnUrl)}`);
              }}
              style={{
                padding: '8px 16px', border: 'none', borderRadius: 6,
                background: '#3370ff', color: '#fff', fontSize: 14, cursor: 'pointer',
              }}
            >
              登录后查看
            </button>
          </div>
        )}
      </Shell>
    );
  }

  const editorAccess = {
    readOnly: access.readOnly,
    canEdit: access.canEdit,
    effectiveViewMode: access.effectiveViewMode,
    onTogglePreview: access.togglePreview,
  };

  const docType = entry.docType || 'freeform';
  const editor = docType === 'richtext'
    ? <DocEditorPage docId={entry.docId} prefetched={entry} {...editorAccess} />
    : docType === 'mindnote'
      ? <MindNoteEditorPage docId={entry.docId} prefetched={entry} {...editorAccess} />
      : docType === 'whiteboard'
        ? <WhiteboardEditorPage docId={entry.docId} prefetched={entry} {...editorAccess} />
        : <EditorPage docId={entry.docId} prefetched={entry} {...editorAccess} />;

  if (inShell) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {editor}
      </div>
    );
  }

  return (
    <TemplatePickerProvider>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        {editor}
      </div>
    </TemplatePickerProvider>
  );
};

function Shell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fa', padding: '48px 24px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
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
  maxWidth: 360,
  margin: '0 auto',
};
