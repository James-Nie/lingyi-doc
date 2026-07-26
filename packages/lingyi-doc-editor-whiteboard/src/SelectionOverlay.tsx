import React from 'react';
import type { ConnectorElement, WhiteboardElement, WhiteboardPoint } from '@lingyi-doc/core-whiteboard';
import { WB_COLORS } from './styles';
import { elementBounds, type ResizeHandle } from './viewportUtils';
import { resizeHandleDomStyle, resizeHandleEdgeOffset, selectionCornerHalf } from './canvas/selectionUi';

const handleOffset = resizeHandleEdgeOffset();
const HANDLES: { id: ResizeHandle; style: React.CSSProperties }[] = [
  { id: 'nw', style: { left: handleOffset, top: handleOffset, cursor: 'nwse-resize' } },
  { id: 'n', style: { left: '50%', top: handleOffset, marginLeft: handleOffset, cursor: 'ns-resize' } },
  { id: 'ne', style: { right: handleOffset, top: handleOffset, cursor: 'nesw-resize' } },
  { id: 'e', style: { right: handleOffset, top: '50%', marginTop: handleOffset, cursor: 'ew-resize' } },
  { id: 'se', style: { right: handleOffset, bottom: handleOffset, cursor: 'nwse-resize' } },
  { id: 's', style: { left: '50%', bottom: handleOffset, marginLeft: handleOffset, cursor: 'ns-resize' } },
  { id: 'sw', style: { left: handleOffset, bottom: handleOffset, cursor: 'nesw-resize' } },
  { id: 'w', style: { left: handleOffset, top: '50%', marginTop: handleOffset, cursor: 'ew-resize' } },
];

interface SelectionOverlayProps {
  elements: WhiteboardElement[];
  selectedIds: string[];
  marquee: { x: number; y: number; w: number; h: number } | null;
  connectorEndpoints?: { start: WhiteboardPoint; end: WhiteboardPoint } | null;
  readOnly?: boolean;
  onResizeStart: (handle: ResizeHandle, e: React.PointerEvent) => void;
  onConnectorEndpointStart?: (end: 'start' | 'end', e: React.PointerEvent) => void;
}

function selectionBox(elements: WhiteboardElement[], ids: string[]) {
  const selected = elements.filter(e => ids.includes(e.id));
  if (!selected.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of selected) {
    const b = elementBounds(el);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  elements,
  selectedIds,
  marquee,
  connectorEndpoints,
  readOnly,
  onResizeStart,
  onConnectorEndpointStart,
}) => {
  const box = selectionBox(elements, selectedIds);
  const single = selectedIds.length === 1 ? elements.find(e => e.id === selectedIds[0]) : null;
  const canResize = !readOnly && single && box
    && single.type !== 'connector' && single.type !== 'pen' && single.type !== 'mindmap';
  const showConnectorHandles = !readOnly && single?.type === 'connector' && connectorEndpoints;
  const hideSelectionBox = selectedIds.length === 1 && single?.type === 'mindmap';

  return (
    <>
      {marquee && marquee.w > 2 && marquee.h > 2 && (
        <div
          style={{
            position: 'absolute',
            left: marquee.x,
            top: marquee.y,
            width: marquee.w,
            height: marquee.h,
            border: `1px solid ${WB_COLORS.accent}`,
            background: 'rgba(51, 112, 255, 0.08)',
            pointerEvents: 'none',
            zIndex: 9998,
          }}
        />
      )}

      {box && selectedIds.length > 0 && !hideSelectionBox && (
        <div
          style={{
            position: 'absolute',
            left: box.x - 2,
            top: box.y - 2,
            width: box.w + 4,
            height: box.h + 4,
            border: `1px dashed ${WB_COLORS.selectBorder}`,
            pointerEvents: 'none',
            zIndex: 9997,
          }}
        />
      )}

      {canResize && box && (
        <div
          style={{
            position: 'absolute',
            left: box.x,
            top: box.y,
            width: box.w,
            height: box.h,
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          {HANDLES.map(h => (
            <div
              key={h.id}
              onPointerDown={e => {
                e.stopPropagation();
                onResizeStart(h.id, e);
              }}
              style={{
                position: 'absolute',
                pointerEvents: 'auto',
                ...resizeHandleDomStyle(WB_COLORS.accent),
                ...h.style,
              }}
            />
          ))}
        </div>
      )}
      {showConnectorHandles && connectorEndpoints && (
        <>
          {(['start', 'end'] as const).map(end => {
            const pt = end === 'start' ? connectorEndpoints.start : connectorEndpoints.end;
            return (
              <div
                key={end}
                onPointerDown={e => {
                  e.stopPropagation();
                  onConnectorEndpointStart?.(end, e);
                }}
                style={{
                  position: 'absolute',
                  left: pt.x - selectionCornerHalf(),
                  top: pt.y - selectionCornerHalf(),
                  ...resizeHandleDomStyle(WB_COLORS.accent),
                  borderRadius: '50%',
                  zIndex: 10000,
                  pointerEvents: 'auto',
                  cursor: 'crosshair',
                }}
              />
            );
          })}
        </>
      )}
    </>
  );
};
