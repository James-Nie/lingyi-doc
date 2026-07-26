import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DOC_COLORS } from './styles';

export type FindReplaceTab = 'find' | 'replace';

export interface DocFindReplacePanelProps {
  open: boolean;
  tab: FindReplaceTab;
  findQuery: string;
  replaceQuery: string;
  matchIndex: number;
  matchCount: number;
  readOnly?: boolean;
  anchorRef?: React.RefObject<HTMLElement | null>;
  onTabChange: (tab: FindReplaceTab) => void;
  onFindQueryChange: (value: string) => void;
  onReplaceQueryChange: (value: string) => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  width: 360,
  background: '#fff',
  borderRadius: 8,
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
  border: `1px solid ${DOC_COLORS.border}`,
  zIndex: 10020,
  overflow: 'hidden',
  fontFamily: 'inherit',
};

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
  border: 'none',
  background: 'transparent',
  padding: '12px 4px 10px',
  marginRight: 20,
  fontSize: 14,
  fontWeight: active ? 600 : 400,
  color: active ? DOC_COLORS.text : DOC_COLORS.muted,
  cursor: 'pointer',
  position: 'relative',
  lineHeight: 1.2,
});

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 36,
  borderRadius: 4,
  border: `1px solid ${DOC_COLORS.border}`,
  padding: '0 12px',
  fontSize: 14,
  color: DOC_COLORS.text,
  outline: 'none',
  boxSizing: 'border-box',
};

const ghostBtnStyle: React.CSSProperties = {
  height: 32,
  padding: '0 12px',
  borderRadius: 4,
  border: `1px solid ${DOC_COLORS.border}`,
  background: '#fff',
  color: DOC_COLORS.text,
  fontSize: 13,
  cursor: 'pointer',
};

const primaryBtnStyle: React.CSSProperties = {
  ...ghostBtnStyle,
  background: DOC_COLORS.primary,
  borderColor: DOC_COLORS.primary,
  color: '#fff',
};

export const DocFindReplacePanel: React.FC<DocFindReplacePanelProps> = ({
  open,
  tab,
  findQuery,
  replaceQuery,
  matchIndex,
  matchCount,
  readOnly = false,
  anchorRef,
  onTabChange,
  onFindQueryChange,
  onReplaceQueryChange,
  onClose,
  onPrev,
  onNext,
  onReplace,
  onReplaceAll,
}) => {
  const findInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ top: 56, left: 24 });

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const anchor = anchorRef?.current;
      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        const width = 360;
        const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
        setPos({ top: rect.bottom + 8, left });
        return;
      }
      setPos({ top: 56, left: Math.max(8, window.innerWidth - 360 - 24) });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => findInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, tab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const counterText = matchCount > 0 ? `${matchIndex + 1}/${matchCount}` : '0/0';
  const canNavigate = matchCount > 0;

  const handleFindKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    }
  };

  return createPortal(
    <div
      ref={panelRef}
      data-doc-find-replace-panel=""
      data-sheet-keep-selection
      style={{ ...panelStyle, top: pos.top, left: pos.left }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        borderBottom: `1px solid ${DOC_COLORS.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button type="button" style={tabBtnStyle(tab === 'find')} onClick={() => onTabChange('find')}>
            查找
            {tab === 'find' && (
              <span style={{
                position: 'absolute', left: 0, right: 0, bottom: 0, height: 2,
                background: DOC_COLORS.text, borderRadius: 1,
              }} />
            )}
          </button>
          {!readOnly && (
            <button type="button" style={tabBtnStyle(tab === 'replace')} onClick={() => onTabChange('replace')}>
              替换
              {tab === 'replace' && (
                <span style={{
                  position: 'absolute', left: 0, right: 0, bottom: 0, height: 2,
                  background: DOC_COLORS.text, borderRadius: 1,
                }} />
              )}
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          style={{
            width: 28, height: 28, border: 'none', background: 'transparent',
            cursor: 'pointer', color: DOC_COLORS.muted, fontSize: 18, lineHeight: 1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ×
        </button>
      </div>

      <div style={{ padding: 16 }}>
        {tab === 'find' ? (
          <div style={{ position: 'relative' }}>
            <input
              ref={findInputRef}
              value={findQuery}
              onChange={e => onFindQueryChange(e.target.value)}
              onKeyDown={handleFindKeyDown}
              placeholder="请输入查找内容"
              style={{
                ...inputStyle,
                paddingRight: 56,
                borderColor: '#94BFFF',
                boxShadow: '0 0 0 1px rgba(22,93,255,0.08)',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#94BFFF'; }}
              onBlur={e => { e.currentTarget.style.borderColor = DOC_COLORS.border; }}
            />
            {findQuery ? (
              <span style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 12,
                color: DOC_COLORS.muted,
                pointerEvents: 'none',
              }}>
                {counterText}
              </span>
            ) : null}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, color: DOC_COLORS.muted, marginBottom: 6 }}>查找项</div>
              <div style={{ position: 'relative' }}>
                <input
                  ref={findInputRef}
                  value={findQuery}
                  onChange={e => onFindQueryChange(e.target.value)}
                  onKeyDown={handleFindKeyDown}
                  placeholder="请输入查找内容"
                  style={{
                    ...inputStyle,
                    paddingRight: 56,
                    borderColor: '#94BFFF',
                  }}
                />
                <span style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 12,
                  color: DOC_COLORS.muted,
                  pointerEvents: 'none',
                }}>
                  {counterText}
                </span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: DOC_COLORS.muted, marginBottom: 6 }}>替换为</div>
              <input
                value={replaceQuery}
                onChange={e => onReplaceQueryChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onReplace();
                  }
                }}
                placeholder="请输入替换内容"
                style={inputStyle}
              />
            </div>
          </div>
        )}
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 8,
        padding: '12px 16px',
        borderTop: `1px solid ${DOC_COLORS.border}`,
      }}>
        <button type="button" style={ghostBtnStyle} disabled={!canNavigate} onClick={onPrev}>上一个</button>
        <button type="button" style={ghostBtnStyle} disabled={!canNavigate} onClick={onNext}>下一个</button>
        {tab === 'replace' && !readOnly && (
          <>
            <button type="button" style={ghostBtnStyle} disabled={!canNavigate} onClick={onReplace}>替换</button>
            <button type="button" style={primaryBtnStyle} disabled={!findQuery} onClick={onReplaceAll}>全部替换</button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};
