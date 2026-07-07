import React, { useEffect, useRef } from 'react';
import type { MindNode } from '@lingyi-doc/core';

interface MindmapNodeInlineEditorProps {
  node: MindNode;
  bounds: { x: number; y: number; w: number; h: number };
  onChange: (text: string) => void;
  onClose: () => void;
}

export const MindmapNodeInlineEditor: React.FC<MindmapNodeInlineEditorProps> = ({
  node,
  bounds,
  onChange,
  onClose,
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ignoreBlurRef = useRef(true);

  useEffect(() => {
    ignoreBlurRef.current = true;
    const focusTimer = window.setTimeout(() => {
      ref.current?.focus();
      ref.current?.select();
      window.setTimeout(() => {
        ignoreBlurRef.current = false;
      }, 120);
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [node.id]);

  const fontSize = (node.fontSize ?? 14) * (bounds.w / Math.max(node.text?.length ? 72 : 72, 72));

  return (
    <textarea
      ref={ref}
      value={node.text}
      onChange={e => onChange(e.target.value)}
      onBlur={() => {
        if (ignoreBlurRef.current) return;
        onClose();
      }}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
        e.stopPropagation();
      }}
      style={{
        position: 'absolute',
        left: bounds.x,
        top: bounds.y,
        width: bounds.w,
        height: bounds.h,
        margin: 0,
        padding: '4px 8px',
        border: '2px solid #3370ff',
        borderRadius: 8,
        outline: 'none',
        resize: 'none',
        background: 'rgba(255,255,255,0.96)',
        color: node.color ?? '#1f2329',
        fontSize: Math.min(Math.max(fontSize, 12), 18),
        fontWeight: node.bold ? 700 : 400,
        fontStyle: node.italic ? 'italic' : 'normal',
        textAlign: 'center',
        lineHeight: 1.4,
        boxSizing: 'border-box',
        zIndex: 10080,
        pointerEvents: 'auto',
      }}
    />
  );
};
