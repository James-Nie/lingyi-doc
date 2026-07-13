import React, { useCallback, useLayoutEffect, useRef } from 'react';
import { commitMindmapNodeText, MIND_NODE_PLACEHOLDER } from '@lingyi-doc/core';
import type { MindNode } from '@lingyi-doc/core';
import type { MindmapTextEditStyle } from '@lingyi-doc/mind-map';

function isImeComposing(e: React.KeyboardEvent): boolean {
  if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return true;
  const ke = e.nativeEvent;
  return ke.isComposing === true || ke.keyCode === 229;
}

interface MindmapNodeInlineEditorProps {
  node: MindNode;
  bounds: { x: number; y: number; w: number; h: number };
  textStyle: MindmapTextEditStyle;
  lockId?: string;
  onDraftChange?: (text: string) => void;
  onChange: (text: string) => void;
  onClose: () => void;
}

export const MindmapNodeInlineEditor: React.FC<MindmapNodeInlineEditorProps> = ({
  node,
  bounds,
  textStyle,
  lockId,
  onDraftChange,
  onChange,
  onClose,
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ignoreBlurRef = useRef(true);
  const composingRef = useRef(false);
  const closedRef = useRef(false);

  const readDraft = useCallback(() => ref.current?.value ?? '', []);

  const commitAndClose = useCallback(() => {
    if (closedRef.current || composingRef.current) return;
    closedRef.current = true;
    onChange(commitMindmapNodeText(readDraft()));
    onClose();
  }, [onChange, onClose, readDraft]);

  useLayoutEffect(() => {
    closedRef.current = false;
    composingRef.current = false;
    ignoreBlurRef.current = true;
    const el = ref.current;
    if (!el) return;
    el.value = node.text ?? '';
    const focusEditor = () => {
      el.focus({ preventScroll: true });
      el.select();
      window.setTimeout(() => {
        ignoreBlurRef.current = false;
      }, 120);
    };
    const raf = window.requestAnimationFrame(() => {
      focusEditor();
      window.requestAnimationFrame(focusEditor);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [node.id]);

  const {
    textAlign,
    textVerticalAlign,
    lineHeight,
    padding,
    outline: _outline,
    border: _border,
    background: _background,
    boxSizing: _boxSizing,
    ...restTextStyle
  } = textStyle;

  const justifyContent = textVerticalAlign === 'top'
    ? 'flex-start'
    : textVerticalAlign === 'bottom'
      ? 'flex-end'
      : 'center';

  return (
    <div
      data-wb-mindmap-text-edit=""
      data-wb-inline-editor
      data-wb-lock-id={lockId ?? node.id}
      style={{
        position: 'absolute',
        left: bounds.x,
        top: bounds.y,
        width: bounds.w,
        height: bounds.h,
        zIndex: 10080,
        pointerEvents: 'auto',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent,
        background: textStyle.background,
        border: textStyle.border,
        borderRadius: textStyle.borderRadius,
      }}
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <textarea
        ref={ref}
        placeholder={MIND_NODE_PLACEHOLDER}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={() => {
          composingRef.current = false;
          if (!closedRef.current) onDraftChange?.(readDraft());
        }}
        onChange={() => {
          if (composingRef.current || closedRef.current) return;
          onDraftChange?.(readDraft());
        }}
        onBlur={() => {
          if (ignoreBlurRef.current) return;
          commitAndClose();
        }}
        onKeyDown={e => {
          if (isImeComposing(e)) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            closedRef.current = true;
            onClose();
            return;
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commitAndClose();
          }
          e.stopPropagation();
        }}
        style={{
          width: '100%',
          flex: '0 1 auto',
          maxHeight: '100%',
          margin: 0,
          overflow: 'hidden',
          resize: 'none',
          outline: 'none',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          cursor: 'text',
          textAlign,
          lineHeight: `${lineHeight}px`,
          padding,
          caretColor: textStyle.color,
          border: 'none',
          background: 'transparent',
          boxSizing: 'border-box',
          ...restTextStyle,
        }}
      />
    </div>
  );
};
