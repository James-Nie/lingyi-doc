import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DOC_COLORS } from './styles';

export const DOC_TITLE_PLACEHOLDER = '请输入标题';
export const DOC_BODY_PLACEHOLDER = '直接输入正文，也可选择一个模板：';

export function isDocTitleEmpty(title: string): boolean {
  const t = title.trim();
  return !t || t === '未命名文档';
}

interface DocTitleEditorProps {
  title: string;
  onChange: (title: string) => void;
  readOnly?: boolean;
}

export const DocTitleEditor: React.FC<DocTitleEditorProps> = ({ title, onChange, readOnly = false }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const showPlaceholder = isDocTitleEmpty(title) && !focused;

  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    el.textContent = isDocTitleEmpty(title) ? '' : title;
  }, [title]);

  const handleInput = useCallback(() => {
    if (readOnly) return;
    const text = ref.current?.textContent ?? '';
    onChange(text);
  }, [onChange, readOnly]);

  const focusTitle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

  return (
    <div
      data-doc-title=""
      style={{ position: 'relative', marginBottom: 4 }}
      onMouseDown={e => {
        if (readOnly) return;
        if (e.target === ref.current) return;
        if (ref.current?.contains(e.target as Node)) return;
        e.preventDefault();
        focusTitle();
      }}
    >
      <div
        ref={ref}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        data-doc-title=""
        onInput={handleInput}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onMouseDown={e => e.stopPropagation()}
        style={{
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1.5,
          color: DOC_COLORS.text,
          outline: 'none',
          minHeight: 39,
          width: '100%',
          wordBreak: 'break-word',
          userSelect: 'text',
          WebkitUserSelect: 'text',
          cursor: 'text',
        }}
      />
      {showPlaceholder && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            fontSize: 26,
            fontWeight: 700,
            lineHeight: 1.5,
            color: '#C9CDD4',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {DOC_TITLE_PLACEHOLDER}
        </span>
      )}
    </div>
  );
};
