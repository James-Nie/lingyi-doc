import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { DocumentManager } from '@lingyi-doc/core';
import type { DocumentListItem } from '@lingyi-doc/core';
import { getDocTypeMeta } from '../../utils/docTypeMeta';

interface ImportCloudDocModalProps {
  open: boolean;
  existingDocIds: string[];
  onClose: () => void;
  onImport: (doc: DocumentListItem) => Promise<void>;
}

export const ImportCloudDocModal: React.FC<ImportCloudDocModalProps> = ({
  open,
  existingDocIds,
  onClose,
  onImport,
}) => {
  const [docs, setDocs] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setLoading(true);
    DocumentManager.list('updated')
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    const existing = new Set(existingDocIds);
    const query = search.trim().toLowerCase();
    return docs.filter(doc => {
      if (existing.has(doc.id)) return false;
      if (!query) return true;
      return (doc.title || '').toLowerCase().includes(query);
    });
  }, [docs, existingDocIds, search]);

  if (!open) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 12000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="迁入已有云文档"
        onMouseDown={e => e.stopPropagation()}
        style={{
          width: 560, maxWidth: '100%', maxHeight: '80vh', background: '#fff',
          borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', fontSize: 16, fontWeight: 600 }}>
          迁入已有云文档
        </div>
        <div style={{ padding: '12px 20px' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索文档名称"
            style={{
              width: '100%', height: 36, borderRadius: 8, border: '1px solid #dee0e3',
              padding: '0 12px', fontSize: 14, outline: 'none',
            }}
          />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 12px 12px' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#8f959e' }}>加载中…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#8f959e' }}>暂无可迁入的文档</div>
          ) : filtered.map(doc => {
            const meta = getDocTypeMeta(doc.docType);
            return (
              <button
                key={doc.id}
                type="button"
                disabled={submittingId === doc.id}
                onClick={() => {
                  setSubmittingId(doc.id);
                  void onImport(doc).finally(() => setSubmittingId(null));
                }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', marginBottom: 4, border: 'none', borderRadius: 8,
                  background: 'transparent', cursor: submittingId ? 'wait' : 'pointer', textAlign: 'left',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f5f6f7'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{
                  width: 24, height: 24, borderRadius: 4, background: meta.bg,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, color: meta.color, fontWeight: 600,
                }}>
                  {meta.icon}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {doc.title || '未命名文档'}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              height: 32, padding: '0 16px', borderRadius: 6, border: '1px solid #dee0e3',
              background: '#fff', cursor: 'pointer', fontSize: 13,
            }}
          >
            取消
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
