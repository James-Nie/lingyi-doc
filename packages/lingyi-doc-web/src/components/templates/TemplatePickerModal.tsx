import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_TYPE_OPTIONS,
  type DocTemplate,
  type TemplateCategoryId,
  type TemplateDocType,
} from '../../templates/docTemplates';
import {
  clearTemplateCatalogCache,
  fetchPublishedTemplates,
  hydrateTemplate,
  type TemplateCatalogSource,
} from '../../templates/templateCatalog';
import { TemplateApi } from '../../api/template';
import { TemplatePreviewModal } from './TemplatePreviewModal';
import { SheetEditorCardPreview } from './SheetEditorPreview';

interface TemplatePickerModalProps {
  open: boolean;
  onClose: () => void;
  onUse: (template: DocTemplate) => void;
  creating?: boolean;
  initialTypeFilter?: 'all' | TemplateDocType;
}

export const TemplatePickerModal: React.FC<TemplatePickerModalProps> = ({
  open,
  onClose,
  onUse,
  creating,
  initialTypeFilter = 'all',
}) => {
  const [category, setCategory] = useState<TemplateCategoryId>('recommended');
  const [typeFilter, setTypeFilter] = useState<'all' | TemplateDocType>(initialTypeFilter);
  const [query, setQuery] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState<DocTemplate | null>(null);
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [catalogSource, setCatalogSource] = useState<TemplateCatalogSource>('api');
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const typeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setCategory('recommended');
    setTypeFilter(initialTypeFilter);
    setQuery('');
    setPreviewTemplate(null);
    setTypeMenuOpen(false);
    clearTemplateCatalogCache();
  }, [open, initialTypeFilter]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const debounceMs = query.trim() ? 300 : 0;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const result = await fetchPublishedTemplates({ category, typeFilter, query });
          if (cancelled) return;
          setTemplates(result.templates);
          setCatalogSource(result.source);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, category, typeFilter, query]);

  const handleUseTemplate = useCallback(async (template: DocTemplate) => {
    setHydrating(true);
    try {
      const ready = await hydrateTemplate(template);
      TemplateApi.recordUse(template.id);
      onUse(ready);
    } finally {
      setHydrating(false);
    }
  }, [onUse]);

  const handlePreviewTemplate = useCallback(async (template: DocTemplate) => {
    setHydrating(true);
    try {
      const ready = await hydrateTemplate(template);
      setPreviewTemplate(ready);
    } finally {
      setHydrating(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !previewTemplate) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, previewTemplate]);

  useEffect(() => {
    if (!typeMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (typeMenuRef.current && !typeMenuRef.current.contains(e.target as Node)) {
        setTypeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [typeMenuOpen]);

  const filtered = templates;
  const categoryLabel = TEMPLATE_CATEGORIES.find(c => c.id === category)?.label ?? '推荐';
  const typeLabel = TEMPLATE_TYPE_OPTIONS.find(t => t.id === typeFilter)?.label ?? '所有类型';

  if (!open) return null;

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}
        onMouseDown={e => { if (e.target === e.currentTarget && !previewTemplate) onClose(); }}
      >
        <div style={{
          width: 'min(1100px, 96vw)', height: 'min(720px, 90vh)',
          maxWidth: '100%',
          background: '#fff', borderRadius: 12,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)', overflow: 'hidden',
          opacity: previewTemplate ? 0.55 : 1,
          pointerEvents: previewTemplate ? 'none' : 'auto',
          transition: 'opacity 0.2s',
        }}>
        {/* 顶栏 */}
        <div style={{
          flexShrink: 0, padding: '14px 20px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, fontSize: 13, color: '#646a73' }}>
            <span>新建到</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#f9ab00"><path d="M4 8h6l2 2h8v10H4V8z" /></svg>
            <span style={{ color: '#1f2329', fontWeight: 500 }}>我的文档库</span>
          </div>

          <div style={{ flex: 1, maxWidth: 360, margin: '0 auto', position: 'relative' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2"
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" />
            </svg>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索模板"
              style={{
                width: '100%', padding: '8px 12px 8px 34px',
                border: '1px solid #dee0e3', borderRadius: 20,
                fontSize: 13, outline: 'none', background: '#f5f6f7',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div ref={typeMenuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setTypeMenuOpen(v => !v)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 6,
                  border: '1px solid #dee0e3', background: typeMenuOpen ? '#e8f0fe' : '#fff',
                  fontSize: 13, color: '#3370ff', cursor: 'pointer',
                }}
              >
                {typeLabel}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 6h16M7 12h10M10 18h4" />
                </svg>
              </button>
              {typeMenuOpen && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 4,
                  background: '#fff', border: '1px solid #dee0e3', borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 140, zIndex: 10,
                  padding: '4px 0',
                }}>
                  {TEMPLATE_TYPE_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => { setTypeFilter(opt.id); setTypeMenuOpen(false); }}
                      style={{
                        width: '100%', padding: '8px 16px', border: 'none', background: 'transparent',
                        textAlign: 'left', fontSize: 13, cursor: 'pointer',
                        color: typeFilter === opt.id ? '#3370ff' : '#1f2329',
                        fontWeight: typeFilter === opt.id ? 500 : 400,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f5f6f7'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 32, height: 32, border: 'none', background: 'transparent',
                cursor: 'pointer', borderRadius: 6,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f5f6f7'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#646a73" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 主体 */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
          {/* 左侧分类 */}
          <div style={{
            width: 160, flexShrink: 0, borderRight: '1px solid #e5e7eb',
            overflow: 'auto', padding: '8px 0',
          }}>
            {TEMPLATE_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 16px', border: 'none', textAlign: 'left',
                  background: category === cat.id ? '#e8f0fe' : 'transparent',
                  color: category === cat.id ? '#3370ff' : '#1f2329',
                  fontSize: 13, cursor: 'pointer', fontWeight: category === cat.id ? 500 : 400,
                }}
                onMouseEnter={e => { if (category !== cat.id) e.currentTarget.style.background = '#f5f6f7'; }}
                onMouseLeave={e => { if (category !== cat.id) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ flex: 1 }}>{cat.label}</span>
                {cat.badge && (
                  <span style={{
                    fontSize: 10, color: '#fff', background: '#3370ff',
                    padding: '1px 5px', borderRadius: 4, fontWeight: 600,
                  }}>{cat.badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* 模板网格 */}
          <div style={{ flex: 1, overflow: 'auto', overflowX: 'hidden', padding: '20px 24px', background: '#fafafa', minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1f2329', marginBottom: 16 }}>
              {category === 'recommended' ? '为你推荐' : categoryLabel}
            </div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#8f959e', fontSize: 14 }}>
                加载模板中…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#8f959e', fontSize: 14 }}>
                {catalogSource === 'fallback' ? '未找到匹配的模板' : '暂无已发布模板，请先在管理后台创建并发布'}
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 16,
              }}>
                {filtered.map(t => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onPreview={() => void handlePreviewTemplate(t)}
                    onUse={() => void handleUseTemplate(t)}
                    creating={creating || hydrating}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      {previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          templates={filtered}
          onBack={() => setPreviewTemplate(null)}
          onUse={(t) => void handleUseTemplate(t)}
          onNavigate={(t) => void handlePreviewTemplate(t)}
          creating={creating || hydrating}
        />
      )}
    </>
  );
};

function TemplateCard({
  template,
  onPreview,
  onUse,
  creating,
}: {
  template: DocTemplate;
  onPreview: () => void;
  onUse: () => void;
  creating?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  if (template.isBlank) {
    return (
      <button
        type="button"
        disabled={creating}
        onClick={() => onUse()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          minHeight: 188,
          width: '100%',
          margin: 0,
          padding: '24px 16px',
          border: 'none',
          borderRadius: 14,
          background: '#f5f6f7',
          boxShadow: hovered
            ? '0 6px 20px rgba(15, 23, 42, 0.1)'
            : '0 4px 14px rgba(15, 23, 42, 0.06)',
          cursor: creating ? 'wait' : 'pointer',
          transition: 'box-shadow 0.15s, background 0.15s',
          fontFamily: 'inherit',
        }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 5v14M5 12h14"
            stroke="#4A89FF"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
        <span style={{
          fontSize: 14,
          color: '#8a8f98',
          lineHeight: 1.4,
          textAlign: 'center',
        }}>
          {template.title}
        </span>
      </button>
    );
  }

  return (
    <div
      style={{
        background: '#fff', borderRadius: 10, overflow: 'hidden',
        border: '1px solid #e8e9eb',
        boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.1)' : '0 1px 4px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.15s',
        cursor: 'pointer',
        minWidth: 0,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        height: 140,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        <MiniPreview template={template} />
        {hovered && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onPreview(); }}
              style={actionBtnStyle('#fff', '#3370ff')}
            >
              预览
            </button>
            <button
              type="button"
              disabled={creating}
              onClick={e => { e.stopPropagation(); onUse(); }}
              style={actionBtnStyle('#3370ff', '#fff')}
            >
              使用
            </button>
          </div>
        )}
      </div>
      <div style={{ padding: '10px 12px 12px' }} onClick={() => onPreview()}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#1f2329', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {template.title}
        </div>
        {template.usageLabel && (
          <div style={{ fontSize: 11, color: '#8f959e', marginTop: 4 }}>{template.usageLabel}</div>
        )}
      </div>
    </div>
  );
}

function MiniPreview({ template }: { template: DocTemplate }) {
  if ((template.docType === 'freeform' || template.docType === 'base') && template.buildWorkbook) {
    return (
      <div style={{
        position: 'absolute', inset: 0,
        background: '#fff', borderRadius: 4,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden',
        border: '1px solid #e8e9eb',
      }}>
        <SheetEditorCardPreview workbook={template.buildWorkbook()} />
      </div>
    );
  }

  const lines = template.richDocument?.content
    ?.filter((b): b is Extract<typeof b, { type: 'heading' | 'paragraph' }> =>
      b.type === 'heading' || b.type === 'paragraph')
    .slice(0, 4)
    .map(b => b.text)
    .filter(Boolean) ?? [];

  return (
    <div style={{
      width: '80%', height: '75%', background: '#fff', borderRadius: 4,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)', padding: 8, overflow: 'hidden',
    }}>
      <div style={{ fontSize: 8, fontWeight: 600, color: '#1f2329', marginBottom: 4, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {template.title}
      </div>
      {lines.length > 0 ? lines.map((line, i) => (
        <div key={i} style={{
          fontSize: 6, color: '#646a73', lineHeight: 1.6,
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          fontWeight: template.richDocument?.content[i]?.type === 'heading' ? 600 : 400,
        }}>{line}</div>
      )) : (
        [0, 1, 2].map(i => (
          <div key={i} style={{ height: 4, background: '#e5e7eb', borderRadius: 2, marginBottom: 3, width: `${70 + i * 10}%` }} />
        ))
      )}
    </div>
  );
}

function actionBtnStyle(bg: string, color: string): React.CSSProperties {
  return {
    padding: '6px 16px', borderRadius: 6, border: bg === '#fff' ? '1px solid #3370ff' : 'none',
    background: bg, color, fontSize: 13, fontWeight: 500, cursor: 'pointer',
  };
}
