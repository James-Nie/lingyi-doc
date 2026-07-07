import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CodeBlock } from '@lingyi-doc/core';
import { extractPlainText } from '@lingyi-doc/core';
import { DOC_COLORS } from './styles';
import { useDocHistoryRevision } from './DocHistoryContext';

const MIN_HEIGHT = 80;
const MAX_HEIGHT = 800;
const LINE_HEIGHT = 22;
const GUTTER_WIDTH = 40;
const HEADER_HEIGHT = 36;

const LANGUAGE_LABELS: Record<string, string> = {
  js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript',
  py: 'Python', python: 'Python', java: 'Java', go: 'Go', rust: 'Rust',
  html: 'HTML', css: 'CSS', json: 'JSON', sql: 'SQL', bash: 'Bash', sh: 'Shell',
  md: 'Markdown', markdown: 'Markdown', plaintext: 'Plain Text',
};

function languageLabel(lang?: string): string {
  if (!lang) return 'Plain Text';
  return LANGUAGE_LABELS[lang.toLowerCase()] ?? lang;
}

interface DocCodeBlockProps {
  block: CodeBlock;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onFocus: () => void;
  onChange: (block: CodeBlock, recordHistory?: boolean) => void;
  onRegisterRef: (id: string, el: HTMLElement | null) => void;
}

export const DocCodeBlock: React.FC<DocCodeBlockProps> = ({
  block,
  index,
  selected,
  onSelect,
  onFocus,
  onChange,
  onRegisterRef,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const skipInput = useRef(false);
  const historyRevision = useDocHistoryRevision();
  const lastHistoryRevisionRef = useRef(historyRevision);
  const collapsed = block.collapsed ?? false;
  const wordWrap = block.wordWrap ?? false;
  const lineCount = Math.max(1, block.text.split('\n').length);
  const autoHeight = Math.max(120, lineCount * LINE_HEIGHT + 16);
  const displayHeight = block.height ?? autoHeight;

  useEffect(() => {
    onRegisterRef(block.id, contentRef.current);
    return () => onRegisterRef(block.id, null);
  }, [block.id, onRegisterRef]);

  useEffect(() => {
    if (!contentRef.current) return;
    const forceSync = historyRevision !== lastHistoryRevisionRef.current;
    if (forceSync) lastHistoryRevisionRef.current = historyRevision;
    if (document.activeElement === contentRef.current && !forceSync) return;
    if (contentRef.current.innerText !== block.text) {
      contentRef.current.innerText = block.text;
    }
  }, [block.text, historyRevision]);

  const applyPatch = useCallback((patch: Partial<CodeBlock>, recordHistory = true) => {
    onChange({ ...block, ...patch }, recordHistory);
  }, [block, onChange]);

  const handleInput = useCallback(() => {
    if (skipInput.current || !contentRef.current) return;
    applyPatch({ text: extractPlainText(contentRef.current) }, false);
  }, [applyPatch]);

  const toggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    applyPatch({ collapsed: !collapsed }, true);
  };

  const toggleWordWrap = (e: React.MouseEvent) => {
    e.stopPropagation();
    applyPatch({ wordWrap: !wordWrap }, true);
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(block.text);
    } catch { /* ignore */ }
  };

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startHeight = displayHeight;

    const onMove = (ev: MouseEvent) => {
      const h = Math.round(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startHeight + ev.clientY - startY)));
      applyPatch({ height: h, collapsed: false }, false);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [applyPatch, displayHeight]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
      handleInput();
    }
  };

  const lines = block.text.split('\n');

  return (
    <div
      data-block-id={block.id}
      data-block-index={index}
      data-doc-code-ui
      onClick={e => { e.stopPropagation(); onSelect(); }}
      style={{
        margin: 0,
        padding: '12px 0',
        borderRadius: 6,
        border: selected ? `2px solid ${DOC_COLORS.primary}` : `1px solid ${DOC_COLORS.border}`,
        background: block.blockBackground ?? '#F7F8FA',
        overflow: 'hidden',
        transition: 'border-color 0.15s',
      }}
    >
      {/* 顶栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: HEADER_HEIGHT,
          padding: '0 12px',
          borderBottom: collapsed ? 'none' : `1px solid ${DOC_COLORS.border}`,
          background: '#F2F3F5',
          userSelect: 'none',
        }}
      >
        <button
          type="button"
          onClick={toggleCollapse}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 13, color: DOC_COLORS.muted, padding: '4px 0',
          }}
        >
          <span style={{
            display: 'inline-block',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
            fontSize: 10,
          }}>▼</span>
          <span>代码块</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 12, color: DOC_COLORS.muted, padding: '2px 8px',
            background: '#fff', borderRadius: 4, border: `1px solid ${DOC_COLORS.border}`,
          }}>
            {languageLabel(block.language)}
          </span>
          <button
            type="button"
            onClick={toggleWordWrap}
            title="自动换行"
            style={{
              border: 'none', background: wordWrap ? '#E8F3FF' : 'transparent',
              color: wordWrap ? DOC_COLORS.primary : DOC_COLORS.muted,
              cursor: 'pointer', fontSize: 12, padding: '4px 8px', borderRadius: 4,
            }}
          >
            自动换行
          </button>
          <button
            type="button"
            onClick={handleCopy}
            title="复制"
            style={{
              border: 'none', background: 'transparent', color: DOC_COLORS.muted,
              cursor: 'pointer', fontSize: 12, padding: '4px 8px', borderRadius: 4,
            }}
          >
            复制
          </button>
        </div>
      </div>

      {/* 代码区 */}
      {!collapsed && (
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', height: displayHeight, overflow: 'hidden' }}>
            {/* 行号 */}
            <div
              aria-hidden
              style={{
                width: GUTTER_WIDTH,
                flexShrink: 0,
                padding: '8px 0',
                background: '#EBEDF0',
                borderRight: `1px solid ${DOC_COLORS.border}`,
                overflow: 'hidden',
                userSelect: 'none',
              }}
            >
              {lines.map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: LINE_HEIGHT,
                    lineHeight: `${LINE_HEIGHT}px`,
                    textAlign: 'right',
                    paddingRight: 8,
                    fontSize: 12,
                    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                    color: DOC_COLORS.muted,
                  }}
                >
                  {i + 1}
                </div>
              ))}
            </div>

            {/* 可编辑代码 */}
            <div
              ref={contentRef}
              contentEditable
              suppressContentEditableWarning
              data-doc-editable=""
              onFocus={onFocus}
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              onMouseDown={e => e.stopPropagation()}
              style={{
                flex: 1,
                padding: '8px 12px',
                overflow: 'auto',
                outline: 'none',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: 13,
                lineHeight: `${LINE_HEIGHT}px`,
                color: DOC_COLORS.text,
                whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
                wordBreak: wordWrap ? 'break-word' : 'normal',
                userSelect: 'text',
              }}
            />
          </div>

          {/* 底部拖拽手柄 */}
          <div
            role="presentation"
            onMouseDown={startResize}
            style={{
              height: 8,
              cursor: 'ns-resize',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderTop: `1px solid ${DOC_COLORS.border}`,
              background: '#F2F3F5',
            }}
          >
            <div style={{ width: 32, height: 3, borderRadius: 2, background: '#C9CDD4' }} />
          </div>
        </div>
      )}
    </div>
  );
};
