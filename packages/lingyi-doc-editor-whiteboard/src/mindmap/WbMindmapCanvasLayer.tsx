import React from 'react';
import type { MindmapElement, WhiteboardElement, WhiteboardPoint, WhiteboardViewport } from '@lingyi-doc/core-whiteboard';
import { hitMindmapAtPoint } from '../canvas/mindmapHitTest';
import { WbMindmapView, type WbMindmapEditProps } from './WbMindmapView';
import type { MindmapBoundsUpdate } from './syncMindmapBounds';

interface WbMindmapCanvasLayerProps {
  elements: WhiteboardElement[];
  viewport: WhiteboardViewport;
  editingMindmapId: string | null;
  activeNodeId?: string | null;
  textEditNodeId?: string | null;
  selectMode: boolean;
  readOnly?: boolean;
  buildMindmapEditProps?: (el: MindmapElement) => WbMindmapEditProps | undefined;
  onBoundsChange?: (elementId: string, bounds: MindmapBoundsUpdate) => void;
  onMindmapFocus?: (id: string) => void;
  onMindmapDragStart?: (e: React.PointerEvent, elementId: string) => void;
  onMindmapRootDragStart?: (e: React.PointerEvent, elementId: string) => void;
  getCanvasPoint?: (clientX: number, clientY: number) => WhiteboardPoint;
  onMindmapNodeClick?: (elementId: string, nodeId: string) => void;
  onMindmapNodeImageClick?: (elementId: string, nodeId: string) => void;
  onMindmapBlankClick?: (elementId: string, pt: WhiteboardPoint) => void;
  onMindmapCollapseClick?: (elementId: string, nodeId: string) => void;
  onMindmapNodeDoubleClick?: (elementId: string, nodeId: string) => void;
  onMindmapContextMenu?: (payload: {
    elementId: string;
    nodeId: string;
    target: 'node' | 'nodeImage';
    clientX: number;
    clientY: number;
  }) => void;
  mindmapLayerNodesRef?: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
}

export const WbMindmapCanvasLayer: React.FC<WbMindmapCanvasLayerProps> = ({
  elements,
  viewport,
  editingMindmapId,
  activeNodeId = null,
  textEditNodeId = null,
  selectMode,
  readOnly = false,
  buildMindmapEditProps,
  onBoundsChange,
  onMindmapFocus,
  onMindmapDragStart,
  onMindmapRootDragStart,
  getCanvasPoint,
  onMindmapNodeClick,
  onMindmapNodeImageClick,
  onMindmapBlankClick,
  onMindmapCollapseClick,
  onMindmapNodeDoubleClick,
  onMindmapContextMenu,
  mindmapLayerNodesRef,
  onPointerMove,
  onPointerUp,
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
                if (!canInteract || e.button !== 0) return;
                e.stopPropagation();

                const pt = getCanvasPoint?.(e.clientX, e.clientY);
                if (!pt) {
                  if (!isActive) onMindmapDragStart?.(e, el.id);
                  return;
                }

                const hit = hitMindmapAtPoint(el, pt);
                if (hit.kind === 'collapseButton' && hit.nodeId) {
                  onMindmapCollapseClick?.(el.id, hit.nodeId);
                  return;
                }
                if (hit.kind === 'nodeImage' && hit.nodeId) {
                  onMindmapNodeImageClick?.(el.id, hit.nodeId);
                  return;
                }
                if (hit.kind === 'node' && hit.nodeId) {
                  const isRoot = hit.nodeId === el.root.id;
                  if (isActive && isRoot && !textEditNodeId) {
                    if (activeNodeId !== el.root.id) {
                      onMindmapNodeClick?.(el.id, hit.nodeId);
                    }
                    onMindmapRootDragStart?.(e, el.id);
                    return;
                  }
                  onMindmapNodeClick?.(el.id, hit.nodeId);
                  return;
                }

                if (isActive) {
                  onMindmapBlankClick?.(el.id, pt);
                  return;
                }
                onMindmapDragStart?.(e, el.id);
              }}
              onContextMenu={e => {
                if (!canInteract || !isActive) return;
                const pt = getCanvasPoint?.(e.clientX, e.clientY);
                if (!pt) return;
                const hit = hitMindmapAtPoint(el, pt);
                if ((hit.kind === 'node' || hit.kind === 'nodeImage') && hit.nodeId) {
                  e.preventDefault();
                  e.stopPropagation();
                  onMindmapContextMenu?.({
                    elementId: el.id,
                    nodeId: hit.nodeId,
                    target: hit.kind === 'nodeImage' ? 'nodeImage' : 'node',
                    clientX: e.clientX,
                    clientY: e.clientY,
                  });
                }
              }}
              onPointerMove={e => {
                e.stopPropagation();
                onPointerMove?.(e);
              }}
              onPointerUp={e => {
                e.stopPropagation();
                onPointerUp?.(e);
              }}
              onPointerCancel={e => {
                e.stopPropagation();
                onPointerUp?.(e);
              }}
              onDoubleClick={e => {
                if (!canInteract) return;
                e.stopPropagation();

                const pt = getCanvasPoint?.(e.clientX, e.clientY);
                if (pt) {
                  const hit = hitMindmapAtPoint(el, pt);
                  if (hit.kind === 'nodeImage') return;
                  if (hit.kind === 'node' && hit.nodeId) {
                    onMindmapNodeDoubleClick?.(el.id, hit.nodeId);
                    return;
                  }
                }
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
                touchAction: 'none',
                cursor: isActive && activeNodeId === el.root.id && !textEditNodeId ? 'move' : undefined,
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
