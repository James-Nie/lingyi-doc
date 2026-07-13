import React, { useEffect, useRef } from 'react';
import type { ConnectorElement, WhiteboardElement } from '@lingyi-doc/core';
import {
  CONNECTOR_LABEL_FONT_SIZE,
  CONNECTOR_LABEL_PAD_X,
  CONNECTOR_LABEL_PAD_Y,
  getConnectorLabelAnchor,
} from '@lingyi-doc/core';
import { getBoardConnectorLabelLayout } from '../boardConnector';

interface ConnectorLabelEditorProps {
  connector: ConnectorElement;
  elements: WhiteboardElement[];
  viewport: { x: number; y: number; zoom: number };
  onChange: (text: string) => void;
  onClose: () => void;
  focusMode?: 'select-all' | 'end';
  textOverride?: string | null;
}

/** 连接线标签 DOM 编辑浮层 */
export const ConnectorLabelEditor: React.FC<ConnectorLabelEditorProps> = ({
  connector,
  elements,
  viewport,
  onChange,
  onClose,
  focusMode = 'select-all',
  textOverride = null,
}) => {
  const ref = useRef<HTMLInputElement>(null);
  const ignoreBlurRef = useRef(true);
  const bounds = (() => {
    const layout = getBoardConnectorLabelLayout(connector, elements);
    if (!layout) return null;
    const h = CONNECTOR_LABEL_FONT_SIZE * 1.2;
    const textW = measureConnectorLabelWidth(connector.text?.trim() || '连接线');
    const anchor = getConnectorLabelAnchor(layout.frame, layout.position, h);
    return {
      x: anchor.x - textW / 2 - CONNECTOR_LABEL_PAD_X,
      y: anchor.y - h / 2 - CONNECTOR_LABEL_PAD_Y,
      w: textW + CONNECTOR_LABEL_PAD_X * 2,
      h: h + CONNECTOR_LABEL_PAD_Y * 2,
    };
  })();

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
  }, [connector.id, focusMode, textOverride]);

  if (!bounds) return null;

  const fontSize = CONNECTOR_LABEL_FONT_SIZE * viewport.zoom;
  const left = viewport.x + bounds.x * viewport.zoom;
  const top = viewport.y + bounds.y * viewport.zoom;
  const width = Math.max(bounds.w * viewport.zoom, 48);
  const height = bounds.h * viewport.zoom;
  const text = textOverride ?? connector.text ?? '';

  return (
    <div
      data-wb-inline-editor
      data-wb-lock-id={connector.id}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        zIndex: 10080,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
        boxSizing: 'border-box',
      }}
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <input
        ref={ref}
        value={text}
        placeholder="连接线"
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
          border: 'none',
          outline: 'none',
          margin: 0,
          padding: `${CONNECTOR_LABEL_PAD_Y * viewport.zoom}px ${CONNECTOR_LABEL_PAD_X * viewport.zoom}px`,
          fontSize,
          fontWeight: 400,
          textAlign: 'center',
          color: '#1f2329',
          background: '#ffffff',
          caretColor: '#1f2329',
          lineHeight: 1.2,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
};

export function measureConnectorLabelWidth(text: string): number {
  if (typeof document === 'undefined') return text.length * CONNECTOR_LABEL_FONT_SIZE * 0.6;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return text.length * CONNECTOR_LABEL_FONT_SIZE * 0.6;
  ctx.font = `${CONNECTOR_LABEL_FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  return ctx.measureText(text).width;
}
