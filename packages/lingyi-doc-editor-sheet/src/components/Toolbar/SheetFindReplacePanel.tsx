import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SheetFindReplacePanelProps {
  open: boolean;
  findQuery: string;
  replaceQuery: string;
  matchIndex: number;
  matchCount: number;
  caseSensitive: boolean;
  matchEntireCell: boolean;
  readOnly?: boolean;
  anchorRef?: React.RefObject<HTMLElement | null>;
  onFindQueryChange: (value: string) => void;
  onReplaceQueryChange: (value: string) => void;
  onCaseSensitiveChange: (value: boolean) => void;
  onMatchEntireCellChange: (value: boolean) => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onFind: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
}

const PRIMARY = '#3370ff';
const BORDER = '#dee0e3';
const TEXT = '#1f2329';
const MUTED = '#646a73';

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  width: 420,
  background: '#fff',
  borderRadius: 8,
  boxShadow: '0 8px 24px rgba(31, 35, 41, 0.12)',
  border: `1px solid ${BORDER}`,
  zIndex: 10020,
  overflow: 'hidden',
  fontFamily: 'inherit',
  color: TEXT,
};

const labelStyle: React.CSSProperties = {
  width: 64,
  flexShrink: 0,
  fontSize: 13,
  color: MUTED,
  textAlign: 'right',
  lineHeight: '32px',
};

const inputBase: React.CSSProperties = {
  flex: 1,
  height: 32,
  borderRadius: 4,
  border: `1px solid ${BORDER}`,
  padding: '0 10px',
  fontSize: 13,
  color: TEXT,
  outline: 'none',
  boxSizing: 'border-box',
  background: '#fff',
};

const ghostBtn: React.CSSProperties = {
  height: 32,
  padding: '0 14px',
  borderRadius: 4,
  border: `1px solid ${BORDER}`,
  background: '#fff',
  color: TEXT,
  fontSize: 13,
  cursor: 'pointer',
};

const primaryBtn: React.CSSProperties = {
  ...ghostBtn,
  background: PRIMARY,
  borderColor: PRIMARY,
  color: '#fff',
};

const navBtn: React.CSSProperties = {
  width: 22,
  height: 22,
  border: 'none',
  background: 'transparent',
  color: MUTED,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  borderRadius: 3,
};

function ChevronLeft() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export const SheetFindReplacePanel: React.FC<SheetFindReplacePanelProps> = ({
  open,
  findQuery,
  replaceQuery,
  matchIndex,
  matchCount,
  caseSensitive,
  matchEntireCell,
  readOnly = false,
  anchorRef,
  onFindQueryChange,
  onReplaceQueryChange,
  onCaseSensitiveChange,
  onMatchEntireCellChange,
  onClose,
  onPrev,
  onNext,
  onFind,
  onReplace,
  onReplaceAll,
}) => {
  const findInputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 56, left: 24 });
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const anchor = anchorRef?.current;
      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        const width = 420;
        const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
        setPos({ top: rect.bottom + 8, left });
        return;
      }
      setPos({ top: 56, left: Math.max(8, window.innerWidth - 420 - 24) });
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
  }, [open]);

  useEffect(() => {
    if (!open) {
      setAdvancedOpen(false);
      return;
    }
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

  return createPortal(
    <div
      data-sheet-find-replace-panel=""
      data-sheet-keep-selection
      style={{ ...panelStyle, top: pos.top, left: pos.left }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px 8px',
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: TEXT }}>查找替换</div>
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          style={{
            width: 28,
            height: 28,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: MUTED,
            fontSize: 18,
            lineHeight: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 4,
          }}
        >
          ×
        </button>
      </div>

      <div style={{ padding: '8px 16px 4px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={labelStyle}>查找内容</div>
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            <input
              ref={findInputRef}
              value={findQuery}
              onChange={e => onFindQueryChange(e.currentTarget.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) onPrev();
                  else onFind();
                }
              }}
              placeholder="输入查找内容"
              style={{
                ...inputBase,
                width: '100%',
                paddingRight: 88,
              }}
              onFocus={e => { e.currentTarget.style.borderColor = PRIMARY; }}
              onBlur={e => { e.currentTarget.style.borderColor = BORDER; }}
            />
            <div style={{
              position: 'absolute',
              right: 4,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 0,
            }}>
              <button
                type="button"
                style={{ ...navBtn, opacity: canNavigate ? 1 : 0.4, cursor: canNavigate ? 'pointer' : 'default' }}
                disabled={!canNavigate}
                onClick={onPrev}
                aria-label="上一个"
              >
                <ChevronLeft />
              </button>
              <span style={{
                fontSize: 12,
                color: MUTED,
                minWidth: 36,
                textAlign: 'center',
                userSelect: 'none',
              }}>
                {counterText}
              </span>
              <button
                type="button"
                style={{ ...navBtn, opacity: canNavigate ? 1 : 0.4, cursor: canNavigate ? 'pointer' : 'default' }}
                disabled={!canNavigate}
                onClick={onNext}
                aria-label="下一个"
              >
                <ChevronRight />
              </button>
            </div>
          </div>
        </div>

        {!readOnly && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={labelStyle}>替换为</div>
            <input
              value={replaceQuery}
              onChange={e => onReplaceQueryChange(e.currentTarget.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onReplace();
                }
              }}
              placeholder="输入替换后的内容"
              style={inputBase}
              onFocus={e => { e.currentTarget.style.borderColor = PRIMARY; }}
              onBlur={e => { e.currentTarget.style.borderColor = BORDER; }}
            />
          </div>
        )}

        {advancedOpen && (
          <div style={{
            marginLeft: 74,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '8px 10px',
            background: '#f5f6f7',
            borderRadius: 4,
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: TEXT, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={e => onCaseSensitiveChange(e.target.checked)}
              />
              区分大小写
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: TEXT, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={matchEntireCell}
                onChange={e => onMatchEntireCellChange(e.target.checked)}
              />
              单元格匹配
            </label>
          </div>
        )}
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px 16px',
        gap: 8,
      }}>
        <button
          type="button"
          onClick={() => setAdvancedOpen(v => !v)}
          style={{
            border: 'none',
            background: 'transparent',
            color: PRIMARY,
            fontSize: 13,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          高级查找
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          {!readOnly && (
            <>
              <button type="button" style={ghostBtn} disabled={!canNavigate} onClick={onReplace}>
                替换
              </button>
              <button type="button" style={ghostBtn} disabled={!findQuery} onClick={onReplaceAll}>
                全部替换
              </button>
            </>
          )}
          <button type="button" style={primaryBtn} onClick={onFind}>
            查找
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
