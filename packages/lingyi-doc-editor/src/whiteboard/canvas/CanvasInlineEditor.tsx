import React, { useEffect, useRef } from 'react';
import type { ShapeElement, TextElement, WhiteboardElement } from '@lingyi-doc/core';
import { getShapeTextBounds } from './shapePaths';
import { computeShapeEditorPaddingTop, shapeTextDecorationCss, textDecorationCss } from './shapeTextStyle';

interface CanvasInlineEditorProps {
  element: WhiteboardElement;
  viewport: { x: number; y: number; zoom: number };
  onChange: (text: string) => void;
  onClose: () => void;
  /** 双击进入时全选；键盘输入进入时光标置于末尾 */
  focusMode?: 'select-all' | 'end';
  /** 键盘输入进入时的即时文本（避免父级 state 尚未同步） */
  textOverride?: string | null;
}

/** 文本/便签/图形 Canvas 模式下的 DOM 编辑浮层 */
export const CanvasInlineEditor: React.FC<CanvasInlineEditorProps> = ({
  element,
  viewport,
  onChange,
  onClose,
  focusMode = 'select-all',
  textOverride = null,
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ignoreBlurRef = useRef(true);

  useEffect(() => {
    ignoreBlurRef.current = true;
    const focusInput = () => {
      const input = ref.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      const len = input.value.length;
      if (focusMode === 'end') {
        input.setSelectionRange(len, len);
      } else {
        input.select();
      }
      window.setTimeout(() => {
        ignoreBlurRef.current = false;
      }, 120);
    };
    const raf = window.requestAnimationFrame(() => {
      focusInput();
      window.requestAnimationFrame(focusInput);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [element.id, focusMode, textOverride]);

  const isSticky = element.type === 'sticky';
  const isShape = element.type === 'shape';
  const isText = element.type === 'text';
  const shape = isShape ? (element as ShapeElement) : null;
  const textEl = isText ? (element as TextElement) : null;

  const bounds = isShape && shape
    ? getShapeTextBounds(shape.shapeKind, element.x, element.y, element.width, element.height)
    : { x: element.x, y: element.y, w: element.width, h: element.height };

  const left = viewport.x + bounds.x * viewport.zoom;
  const top = viewport.y + bounds.y * viewport.zoom;
  const width = bounds.w * viewport.zoom;
  const height = bounds.h * viewport.zoom;

  const text = textOverride
    ?? (element.type === 'text' || element.type === 'sticky' || element.type === 'shape'
      ? (element.text ?? '')
      : '');

  const fontSize = isShape
    ? (shape!.fontSize ?? 14) * viewport.zoom
    : isText
      ? textEl!.fontSize * viewport.zoom
      : 14 * viewport.zoom;

  const textAlign = isShape
    ? (shape!.textAlign ?? 'center')
    : isText
      ? (textEl!.textAlign ?? 'left')
      : 'left';
  const textVerticalAlign = isShape
    ? (shape!.textVerticalAlign ?? 'center')
    : isText
      ? (textEl!.textVerticalAlign ?? 'top')
      : 'top';
  const textColor = isShape
    ? (shape!.textColor ?? '#1f2329')
    : isText
      ? textEl!.color
      : '#1f2329';
  const fontWeight = isShape
    ? (shape!.fontWeight ?? 400)
    : isText
      ? (textEl!.fontWeight ?? 400)
      : 400;
  const fontStyle = isShape
    ? (shape!.fontStyle ?? 'normal')
    : isText
      ? (textEl!.fontStyle ?? 'normal')
      : 'normal';
  const textDecoration = isShape
    ? shapeTextDecorationCss(shape!)
    : isText
      ? textDecorationCss(textEl!)
      : undefined;
  const highlight = isShape ? shape!.textHighlight : isText ? textEl!.textHighlight : undefined;

  const shapePad = 12;
  const stickyPad = 12;
  const textPad = 4;
  const pad = isSticky ? stickyPad : isShape ? shapePad : textPad;
  const fontSizeWorld = isShape
    ? (shape!.fontSize ?? 14)
    : isText
      ? textEl!.fontSize
      : 14;
  const lineHeightWorld = fontSizeWorld * 1.35;
  const lineCount = Math.max(1, text.split('\n').length);
  const totalHWorld = lineCount * lineHeightWorld;
  const shapePaddingTop = isShape
    ? computeShapeEditorPaddingTop(bounds.h, totalHWorld, textVerticalAlign, shapePad)
    : 0;

  return (
    <div
      data-wb-inline-editor
      data-wb-lock-id={element.id}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        zIndex: 10080,
        display: 'block',
        pointerEvents: 'auto',
        boxSizing: 'border-box',
        padding: isShape
          ? `${shapePaddingTop * viewport.zoom}px ${shapePad * viewport.zoom}px ${shapePad * viewport.zoom}px`
          : isSticky
            ? `${stickyPad}px`
            : `${textPad}px`,
      }}
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <textarea
        ref={ref}
        value={text}
        placeholder={isSticky ? '便签' : isShape ? '输入文本' : undefined}
        onChange={e => onChange(e.target.value)}
        onBlur={() => {
          if (ignoreBlurRef.current) return;
          onClose();
        }}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose();
          e.stopPropagation();
        }}
        style={{
          width: '100%',
          border: isShape || isText ? 'none' : '2px solid #3370ff',
          borderRadius: isShape || isText ? 0 : 4,
          outline: 'none',
          resize: 'none',
          padding: isShape ? 0 : pad,
          fontSize,
          fontWeight,
          fontStyle,
          textDecoration,
          textAlign,
          color: textColor,
          background: isShape || isText
            ? 'transparent'
            : isSticky
              ? element.color
              : 'rgba(255,255,255,0.98)',
          caretColor: textColor,
          lineHeight: 1.35,
          overflow: 'hidden',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          boxSizing: 'border-box',
          boxShadow: highlight && (isShape || isText)
            ? `inset 0 0 0 9999px ${highlight}44`
            : undefined,
        }}
      />
    </div>
  );
};
