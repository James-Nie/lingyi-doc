import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ImageElement, WhiteboardViewport } from '@lingyi-doc/core';
import { WB_COLORS, WB_PANEL, WB_Z_INDEX } from '../styles';
import { resizeHandleDomStyle, resizeHandleEdgeOffset } from './selectionUi';

interface ImageCropOverlayProps {
  element: ImageElement;
  viewport: WhiteboardViewport;
  onApply: (patch: Partial<ImageElement>) => void;
  onCancel: () => void;
}

type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export const ImageCropOverlay: React.FC<ImageCropOverlayProps> = ({
  element,
  viewport,
  onApply,
  onCancel,
}) => {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState(() => element.cropSrc ?? null);
  const dragRef = useRef<{
    kind: CropHandle;
    startX: number;
    startY: number;
    origin: { x: number; y: number; width: number; height: number };
  } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || element.width;
      const h = img.naturalHeight || element.height;
      setNatural({ w, h });
      if (!element.cropSrc) {
        setCrop({ x: 0, y: 0, width: w, height: h });
      }
    };
    img.src = element.src;
  }, [element.src, element.width, element.height, element.cropSrc]);

  const screenRect = {
    left: viewport.x + element.x * viewport.zoom,
    top: viewport.y + element.y * viewport.zoom,
    width: element.width * viewport.zoom,
    height: element.height * viewport.zoom,
  };

  const cropToScreen = useCallback((rect: { x: number; y: number; width: number; height: number }) => {
    if (!natural) return null;
    const scaleX = screenRect.width / natural.w;
    const scaleY = screenRect.height / natural.h;
    return {
      left: screenRect.left + rect.x * scaleX,
      top: screenRect.top + rect.y * scaleY,
      width: rect.width * scaleX,
      height: rect.height * scaleY,
    };
  }, [natural, screenRect.height, screenRect.left, screenRect.top, screenRect.width]);

  const screenToCrop = useCallback((clientX: number, clientY: number) => {
    if (!natural) return null;
    const scaleX = natural.w / screenRect.width;
    const scaleY = natural.h / screenRect.height;
    return {
      x: (clientX - screenRect.left) * scaleX,
      y: (clientY - screenRect.top) * scaleY,
    };
  }, [natural, screenRect.left, screenRect.top, screenRect.width, screenRect.height]);

  const onPointerDown = (kind: CropHandle, e: React.PointerEvent) => {
    if (!crop) return;
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      kind,
      startX: e.clientX,
      startY: e.clientY,
      origin: { ...crop },
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !natural || !crop) return;
    e.stopPropagation();
    const pt = screenToCrop(e.clientX, e.clientY);
    const startPt = screenToCrop(drag.startX, drag.startY);
    if (!pt || !startPt) return;
    const dx = pt.x - startPt.x;
    const dy = pt.y - startPt.y;
    const minSize = 16;
    let next = { ...drag.origin };

    if (drag.kind === 'move') {
      next.x = clamp(drag.origin.x + dx, 0, natural.w - drag.origin.width);
      next.y = clamp(drag.origin.y + dy, 0, natural.h - drag.origin.height);
    } else {
      if (drag.kind.includes('w')) {
        const nx = clamp(drag.origin.x + dx, 0, drag.origin.x + drag.origin.width - minSize);
        next.width = drag.origin.width + (drag.origin.x - nx);
        next.x = nx;
      }
      if (drag.kind.includes('e')) {
        next.width = clamp(drag.origin.width + dx, minSize, natural.w - drag.origin.x);
      }
      if (drag.kind.includes('n')) {
        const ny = clamp(drag.origin.y + dy, 0, drag.origin.y + drag.origin.height - minSize);
        next.height = drag.origin.height + (drag.origin.y - ny);
        next.y = ny;
      }
      if (drag.kind.includes('s')) {
        next.height = clamp(drag.origin.height + dy, minSize, natural.h - drag.origin.y);
      }
    }

    setCrop({
      x: Math.round(next.x),
      y: Math.round(next.y),
      width: Math.round(next.width),
      height: Math.round(next.height),
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    dragRef.current = null;
  };

  const cropScreen = crop ? cropToScreen(crop) : null;

  const handleApply = () => {
    if (!crop || !natural) {
      onCancel();
      return;
    }
    const isFull = crop.x === 0 && crop.y === 0
      && crop.width === natural.w && crop.height === natural.h;
    onApply({
      cropSrc: isFull ? undefined : crop,
    });
  };

  if (!natural || !crop || !cropScreen) return null;

  const handleOffset = resizeHandleEdgeOffset();
  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    touchAction: 'none',
    ...resizeHandleDomStyle(WB_COLORS.accent),
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: WB_Z_INDEX.inlineEditor,
        pointerEvents: 'auto',
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      <div style={{
        position: 'absolute',
        left: screenRect.left,
        top: screenRect.top,
        width: screenRect.width,
        height: screenRect.height,
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
        pointerEvents: 'none',
      }} />
      <div
        style={{
          position: 'absolute',
          left: cropScreen.left,
          top: cropScreen.top,
          width: cropScreen.width,
          height: cropScreen.height,
          border: `2px solid ${WB_COLORS.accent}`,
          boxSizing: 'border-box',
          cursor: 'move',
          touchAction: 'none',
        }}
        onPointerDown={e => onPointerDown('move', e)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {(['nw', 'ne', 'sw', 'se'] as const).map(corner => {
          const pos: React.CSSProperties = {
            ...handleStyle,
            cursor: `${corner}-resize`,
          };
          if (corner.includes('n')) pos.top = handleOffset;
          if (corner.includes('s')) pos.bottom = handleOffset;
          if (corner.includes('w')) pos.left = handleOffset;
          if (corner.includes('e')) pos.right = handleOffset;
          return (
            <div
              key={corner}
              style={pos}
              onPointerDown={e => onPointerDown(corner, e)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          );
        })}
      </div>
      <div style={{
        position: 'absolute',
        left: screenRect.left + screenRect.width / 2,
        top: screenRect.top + screenRect.height + 12,
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 8,
        background: '#fff',
        border: WB_PANEL.border,
        borderRadius: 8,
        padding: '6px 8px',
        boxShadow: WB_PANEL.shadow,
      }}>
        <button type="button" onClick={handleApply} style={actionBtnStyle(true)}>完成</button>
        <button type="button" onClick={onCancel} style={actionBtnStyle(false)}>取消</button>
      </div>
    </div>
  );
};

function actionBtnStyle(primary: boolean): React.CSSProperties {
  return {
    border: primary ? 'none' : `1px solid ${WB_COLORS.border}`,
    borderRadius: 6,
    padding: '4px 12px',
    fontSize: 13,
    cursor: 'pointer',
    background: primary ? WB_COLORS.accent : '#fff',
    color: primary ? '#fff' : WB_COLORS.text,
  };
}
