import React from 'react';
import type { MindmapElement, WhiteboardElement, WhiteboardViewport } from '@lingyi-doc/core';
import { WbMindmapView, type WbMindmapEditProps } from './WbMindmapView';
import type { MindmapBoundsUpdate } from './syncMindmapBounds';

interface WbMindmapCanvasLayerProps {
  elements: WhiteboardElement[];
  viewport: WhiteboardViewport;
  editingMindmapId: string | null;
  selectMode: boolean;
  readOnly?: boolean;
  buildMindmapEditProps?: (el: MindmapElement) => WbMindmapEditProps | undefined;
  onBoundsChange?: (elementId: string, bounds: MindmapBoundsUpdate) => void;
  onMindmapFocus?: (elementId: string) => void;
  onMindmapDragStart?: (e: React.PointerEvent, elementId: string) => void;
  mindmapLayerNodesRef?: React.MutableRefObject<Map<string, HTMLDivElement>>;
}

export const WbMindmapCanvasLayer: React.FC<WbMindmapCanvasLayerProps> = ({
  elements,
  viewport,
  editingMindmapId,
  selectMode,
  readOnly = false,
  buildMindmapEditProps,
  onBoundsChange,
  onMindmapFocus,
  onMindmapDragStart,
  mindmapLayerNodesRef,
}) => {
  const mindmaps = elements.filter((el): el is MindmapElement => el.type === 'mindmap');
  if (!mindmaps.length) return null;

  const canInteract = selectMode && !readOnly;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        {mindmaps.map(el => {
          const isActive = editingMindmapId === el.id;

          return (
            <div
              key={el.id}
              ref={node => {
                if (!mindmapLayerNodesRef) return;
                if (node) mindmapLayerNodesRef.current.set(el.id, node);
                else mindmapLayerNodesRef.current.delete(el.id);
              }}
              data-wb-mindmap-layer={el.id}
              onPointerDown={e => {
                if (!canInteract) return;
                if (isActive) return;
                e.stopPropagation();
                onMindmapDragStart?.(e, el.id);
              }}
              onDoubleClick={e => {
                if (!canInteract) return;
                e.stopPropagation();
                onMindmapFocus?.(el.id);
              }}
              style={{
                position: 'absolute',
                left: el.x,
                top: el.y,
                width: el.width,
                height: el.height,
                pointerEvents: canInteract ? 'auto' : 'none',
                zIndex: 10000 + el.zIndex + (isActive ? 1 : 0),
                overflow: 'visible',
              }}
            >
              <WbMindmapView
                element={el}
                editing={isActive}
                selectMode={selectMode}
                readOnly={readOnly}
                canvasEmbedded
                canvasZoom={viewport.zoom}
                edit={canInteract && isActive ? buildMindmapEditProps?.(el) : undefined}
                onBoundsChange={size => onBoundsChange?.(el.id, size)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
