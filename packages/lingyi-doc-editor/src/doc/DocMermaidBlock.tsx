import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { MermaidBlock } from '@lingyi-doc/core';
import { DOC_COLORS } from './styles';
import { useDocHistoryRevision } from './DocHistoryContext';
import { useMermaidRender } from './useMermaidRender';

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 800;
const LINE_HEIGHT = 20;
const HEADER_HEIGHT = 36;

type ViewMode = 'preview' | 'source';

interface DocMermaidBlockProps {
  block: MermaidBlock;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onFocus: () => void;
  onChange: (block: MermaidBlock, recordHistory?: boolean) => void;
  onRegisterRef: (id: string, el: HTMLElement | null) => void;
}

export const DocMermaidBlock: React.FC<DocMermaidBlockProps> = ({
  block,
  index,
  selected,
  onSelect,
  onFocus,
  onChange,
  onRegisterRef,
}) => {
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const historyRevision = useDocHistoryRevision();
  const lastHistoryRevisionRef = useRef(historyRevision);
  const collapsed = block.collapsed ?? false;
  const displayHeight = block.height ?? 240;
  const { svg, error, rendering } = useMermaidRender(block.text, block.id);

  useEffect(() => {
    onRegisterRef(block.id, sourceRef.current);
    return () => onRegisterRef(block.id, null);
  }, [block.id, onRegisterRef]);

  useEffect(() => {
    if (!sourceRef.current) return;
    const forceSync = historyRevision !== lastHistoryRevisionRef.current;
    if (forceSync) lastHistoryRevisionRef.current = historyRevision;
    if (document.activeElement === sourceRef.current && !forceSync) return;
    if (sourceRef.current.value !== block.text) {
      sourceRef.current.value = block.text;
    }
  }, [block.text, historyRevision]);

  const applyPatch = useCallback((patch: Partial<MermaidBlock>, recordHistory = true) => {
    onChange({ ...block, ...patch }, recordHistory);
  }, [block, onChange]);

  const handleSourceChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    applyPatch({ text: e.target.value }, false);
  }, [applyPatch]);

  const toggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    applyPatch({ collapsed: !collapsed }, true);
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
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = sourceRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      ta.value = val.slice(0, start) + '  ' + val.slice(end);
      ta.selectionStart = ta.selectionEnd = start + 2;
      applyPatch({ text: ta.value }, false);
    }
  };

  return (
    <div
      data-block-id={block.id}
      data-block-index={index}
      data-doc-mermaid-ui
      onClick={e => { e.stopPropagation(); onSelect(); }}
      style={{
        margin: 0,
        padding: '12px 0',
        borderRadius: 6,
        border: selected ? `2px solid ${DOC_COLORS.primary}` : `1px solid ${DOC_COLORS.border}`,
        background: '#fff',
        overflow: 'hidden',
        transition: 'border-color 0.15s',
      }}
    >
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
          <span>Mermaid 图表</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <TabBtn active={viewMode === 'preview'} onClick={() => setViewMode('preview')}>预览</TabBtn>
          <TabBtn active={viewMode === 'source'} onClick={() => setViewMode('source')}>源码</TabBtn>
          <button
            type="button"
            onClick={handleCopy}
            title="复制源码"
            style={{
              border: 'none', background: 'transparent', color: DOC_COLORS.muted,
              cursor: 'pointer', fontSize: 12, padding: '4px 8px', borderRadius: 4, marginLeft: 4,
            }}
          >
            复制
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={{ position: 'relative' }}>
          <div style={{ height: displayHeight, overflow: 'hidden' }}>
            {viewMode === 'preview' ? (
              <div
                style={{
                  height: '100%',
                  overflow: 'auto',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  background: '#FAFBFC',
                }}
              >
                {rendering && !svg && !error && (
                  <span style={{ color: DOC_COLORS.muted, fontSize: 13 }}>渲染中…</span>
                )}
                {error && (
                  <pre style={{
                    margin: 0, padding: 12, width: '100%', boxSizing: 'border-box',
                    fontSize: 12, lineHeight: 1.5, color: '#cf1322',
                    background: '#FFF1F0', borderRadius: 4, whiteSpace: 'pre-wrap',
                    fontFamily: 'Consolas, Monaco, monospace',
                  }}>
                    {error}
                  </pre>
                )}
                {svg && (
                  <div
                    className="doc-mermaid-preview"
                    dangerouslySetInnerHTML={{ __html: svg }}
                    style={{ maxWidth: '100%' }}
                  />
                )}
              </div>
            ) : (
              <textarea
                ref={sourceRef}
                defaultValue={block.text}
                onFocus={onFocus}
                onChange={handleSourceChange}
                onKeyDown={handleKeyDown}
                onMouseDown={e => e.stopPropagation()}
                spellCheck={false}
                style={{
                  width: '100%',
                  height: '100%',
                  boxSizing: 'border-box',
                  padding: '12px 14px',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  fontSize: 13,
                  lineHeight: `${LINE_HEIGHT}px`,
                  color: DOC_COLORS.text,
                  background: '#F7F8FA',
                }}
              />
            )}
          </div>

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

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(); }}
      style={{
        border: 'none',
        background: active ? '#E8F3FF' : 'transparent',
        color: active ? DOC_COLORS.primary : DOC_COLORS.muted,
        cursor: 'pointer',
        fontSize: 12,
        padding: '4px 10px',
        borderRadius: 4,
      }}
    >
      {children}
    </button>
  );
}
