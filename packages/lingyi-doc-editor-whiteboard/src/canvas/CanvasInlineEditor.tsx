import React, { useEffect, useRef } from 'react';
import type { ShapeElement, StickyElement, TextElement, WhiteboardElement } from '@lingyi-doc/core-whiteboard';
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
  const stickyEl = isSticky ? (element as StickyElement) : null;

  // 便签/文字编辑框覆盖整个元素；图形使用文本可用区域
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
      : (stickyEl?.fontSize ?? 14) * viewport.zoom;

  const textAlign = isShape
    ? (shape!.textAlign ?? 'center')
    : isText
      ? (textEl!.textAlign ?? 'left')
      : (stickyEl?.textAlign ?? 'left');
  const textVerticalAlign = isShape
    ? (shape!.textVerticalAlign ?? 'center')
    : isText
      ? (textEl!.textVerticalAlign ?? 'center')
      : (stickyEl?.textVerticalAlign ?? 'top');
  const textColor = isShape
    ? (shape!.textColor ?? '#1f2329')
    : isText
      ? textEl!.color
      : (stickyEl?.textColor ?? '#1f2329');
  const fontWeight = isShape
    ? (shape!.fontWeight ?? 400)
    : isText
      ? (textEl!.fontWeight ?? 400)
      : (stickyEl?.fontWeight ?? 400);
  const fontStyle = isShape
    ? (shape!.fontStyle ?? 'normal')
    : isText
      ? (textEl!.fontStyle ?? 'normal')
      : (stickyEl?.fontStyle ?? 'normal');
  const textDecoration = isShape
    ? shapeTextDecorationCss(shape!)
    : isText
      ? textDecorationCss(textEl!)
      : stickyEl
        ? textDecorationCss(stickyEl)
        : undefined;
  const highlight = isShape
    ? shape!.textHighlight
    : isText
      ? textEl!.textHighlight
      : stickyEl?.textHighlight;

  const shapePad = 12;
  const stickyPad = 12;
  const textPad = 4;
  const contentPad = isSticky ? stickyPad : isShape ? shapePad : textPad;
  const fontSizeWorld = isShape
    ? (shape!.fontSize ?? 14)
    : isText
      ? textEl!.fontSize
      : (stickyEl?.fontSize ?? 14);
  const lineHeightWorld = fontSizeWorld * 1.35;
  const lineCount = Math.max(1, text.split('\n').length);
  const totalHWorld = lineCount * lineHeightWorld;
  // 便签/图形/文字：编辑框铺满外层；垂直对齐通过 textarea 内边距实现
  const paddingTopWorld = (isShape || isText || isSticky)
    ? computeShapeEditorPaddingTop(bounds.h, totalHWorld, textVerticalAlign, contentPad)
    : contentPad;
  const padX = contentPad * viewport.zoom;
  const padTop = paddingTopWorld * viewport.zoom;
  const padBottom = contentPad * viewport.zoom;

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
          height: '100%',
          border: isSticky ? '2px solid #3370ff' : 'none',
          borderRadius: isSticky ? 4 : 0,
          outline: 'none',
          resize: 'none',
          margin: 0,
          padding: `${padTop}px ${padX}px ${padBottom}px`,
          fontSize,
          fontWeight,
          fontStyle,
          textDecoration,
          textAlign,
          color: textColor,
          background: isSticky
            ? element.color
            : isShape || isText
              ? 'transparent'
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
