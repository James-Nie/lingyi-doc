import React, { useEffect } from 'react';
import type { DocTemplate } from '../../templates/docTemplates';
import { TemplatePreviewBody } from './TemplatePreviewBody';

interface TemplatePreviewModalProps {
  template: DocTemplate;
  templates: DocTemplate[];
  onBack: () => void;
  onUse: (template: DocTemplate) => void;
  onNavigate: (template: DocTemplate) => void;
  creating?: boolean;
}

const isSheetType = (docType: DocTemplate['docType']) =>
  docType === 'freeform' || docType === 'base' || docType === 'questionnaire';

export const TemplatePreviewModal: React.FC<TemplatePreviewModalProps> = ({
  template,
  templates,
  onBack,
  onUse,
  onNavigate,
  creating,
}) => {
  const idx = templates.findIndex(t => t.id === template.id);
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < templates.length - 1;
  const sheet = isSheetType(template.docType);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate(templates[idx - 1]);
      if (e.key === 'ArrowRight' && hasNext) onNavigate(templates[idx + 1]);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onBack, onNavigate, templates, idx, hasPrev, hasNext]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onMouseDown={e => { if (e.target === e.currentTarget && !creating) onBack(); }}
    >
      <div
        style={{
          width: sheet ? 'min(1100px, 96vw)' : 'min(900px, 92vw)',
          maxWidth: '100%',
          height: 'min(720px, 88vh)',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 12px 48px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* 顶栏 */}
        <div style={{
          flexShrink: 0,
          padding: '14px 20px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <button
            type="button"
            onClick={onBack}
            disabled={creating}
            style={{
              width: 32, height: 32, border: 'none', background: 'transparent',
              cursor: creating ? 'not-allowed' : 'pointer', borderRadius: 6,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f5f6f7'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#646a73" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 16, fontWeight: 600, color: '#1f2329',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {template.title}
              </span>
              <span style={{
                fontSize: 11, color: '#9333ea', background: '#f3e8fd',
                padding: '2px 6px', borderRadius: 4, flexShrink: 0,
              }}>模板</span>
            </div>
            <div style={{ fontSize: 12, color: '#8f959e', marginTop: 2 }}>{template.subtitle}</div>
          </div>
          <button type="button" title="复制链接" style={iconBtnStyle} onClick={() => { /* stub */ }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#646a73" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </button>
          <button type="button" title="分享" style={iconBtnStyle} onClick={() => { /* stub */ }}>
            {/* <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#646a73" strokeWidth="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
            </svg> */}
          </button>
        </div>

        {/* 预览区：表格类型需占满剩余高度供 SheetContainer 测量尺寸 */}
        <div style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: sheet ? 'hidden' : 'auto',
          background: sheet ? '#fff' : '#f5f6f7',
        }}>
          <div style={{
            flex: sheet ? 1 : undefined,
            minHeight: sheet ? 0 : '100%',
            display: sheet ? 'flex' : 'block',
            flexDirection: sheet ? 'column' : undefined,
            ...(sheet ? {} : {
              maxWidth: 800,
              margin: '0 auto',
              background: '#fff',
            }),
          }}>
            <TemplatePreviewBody template={template} />
          </div>
        </div>

        {/* 底栏 */}
        <div style={{
          flexShrink: 0,
          padding: '14px 24px',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#fff',
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={!hasPrev}
              onClick={() => hasPrev && onNavigate(templates[idx - 1])}
              style={navBtnStyle(!hasPrev)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              上一个
            </button>
            <button
              type="button"
              disabled={!hasNext}
              onClick={() => hasNext && onNavigate(templates[idx + 1])}
              style={navBtnStyle(!hasNext)}
            >
              下一个
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
          <button
            type="button"
            disabled={creating}
            onClick={() => onUse(template)}
            style={{
              padding: '10px 28px', borderRadius: 8, border: 'none',
              background: creating ? '#94bfff' : '#3370ff', color: '#fff',
              fontSize: 14, fontWeight: 500, cursor: creating ? 'not-allowed' : 'pointer',
            }}
          >
            {creating ? '创建中…' : '使用该模板'}
          </button>
        </div>
      </div>
    </div>
  );
};

const iconBtnStyle: React.CSSProperties = {
  width: 32, height: 32, border: 'none', background: 'transparent',
  cursor: 'pointer', borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

function navBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '8px 14px', borderRadius: 8,
    border: '1px solid #dee0e3', background: '#fff',
    fontSize: 13, color: disabled ? '#bbb' : '#646a73',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
