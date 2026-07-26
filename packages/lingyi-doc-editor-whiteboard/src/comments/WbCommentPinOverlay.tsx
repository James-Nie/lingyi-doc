import React, { useCallback, useRef, useState } from 'react';
import type { WhiteboardElement, WhiteboardViewport } from '@lingyi-doc/core-whiteboard';
import type { DocCommentThread } from '@lingyi-doc/core-doc';
import { WB_Z_INDEX } from '../styles';
import { WbCommentPinIcon, WB_COMMENT_PIN_SCREEN_SIZE } from './WbCommentPinIcon';
import { resolveLiveWhiteboardCommentPin } from './whiteboardComments';

interface WbCommentPinOverlayProps {
  threads: DocCommentThread[];
  elements: WhiteboardElement[];
  viewport: WhiteboardViewport;
  selectedCommentId?: string | null;
  readOnly?: boolean;
  onSelect: (threadId: string) => void;
  onPinMove?: (threadId: string, pinX: number, pinY: number) => void;
}

export const WbCommentPinOverlay: React.FC<WbCommentPinOverlayProps> = ({
  threads,
  elements,
  viewport,
  selectedCommentId = null,
  readOnly = false,
  onSelect,
  onPinMove,
}) => {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draftPins, setDraftPins] = useState<Map<string, { x: number; y: number }>>(new Map());
  const dragRef = useRef<{
    threadId: string;
    startPin: { x: number; y: number };
    startClient: { x: number; y: number };
    moved: boolean;
    currentPin: { x: number; y: number };
  } | null>(null);

  const activeThreads = threads.filter(thread => !thread.resolved);

  const resolvePin = useCallback((thread: DocCommentThread) => {
    const draft = draftPins.get(thread.id);
    if (draft) return draft;
    return resolveLiveWhiteboardCommentPin(thread.anchor, elements);
  }, [draftPins, elements]);

  const handlePointerDown = useCallback((threadId: string, e: React.PointerEvent) => {
    if (readOnly || !onPinMove) {
      e.stopPropagation();
      onSelect(threadId);
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    const thread = activeThreads.find(t => t.id === threadId);
    if (!thread) return;
    const pin = resolveLiveWhiteboardCommentPin(thread.anchor, elements);
    dragRef.current = {
      threadId,
      startPin: pin,
      startClient: { x: e.clientX, y: e.clientY },
      moved: false,
      currentPin: pin,
    };
    setDraggingId(threadId);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [activeThreads, elements, onPinMove, onSelect, readOnly]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    e.stopPropagation();
    const dx = (e.clientX - drag.startClient.x) / viewport.zoom;
    const dy = (e.clientY - drag.startClient.y) / viewport.zoom;
    if (Math.hypot(dx, dy) > 2) drag.moved = true;
    const nextPin = {
      x: drag.startPin.x + dx,
      y: drag.startPin.y + dy,
    };
    drag.currentPin = nextPin;
    setDraftPins(prev => {
      const next = new Map(prev);
      next.set(drag.threadId, nextPin);
      return next;
    });
  }, [viewport.zoom]);

  const finishDrag = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    e.stopPropagation();
    dragRef.current = null;
    setDraggingId(null);
    setDraftPins(prev => {
      const next = new Map(prev);
      next.delete(drag.threadId);
      return next;
    });
    if (drag.moved && onPinMove) {
      onPinMove(drag.threadId, drag.currentPin.x, drag.currentPin.y);
    } else if (!drag.moved) {
      onSelect(drag.threadId);
    }
  }, [onPinMove, onSelect]);

  if (!activeThreads.length) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: WB_Z_INDEX.commentPin,
      }}
    >
      {activeThreads.map(thread => {
        const pin = resolvePin(thread);
        const left = viewport.x + pin.x * viewport.zoom;
        const top = viewport.y + pin.y * viewport.zoom;
        const selected = selectedCommentId === thread.id;
        const dragging = draggingId === thread.id;
        return (
          <div
            key={thread.id}
            data-wb-comment-pin={thread.id}
            style={{
              position: 'absolute',
              left,
              top,
              width: WB_COMMENT_PIN_SCREEN_SIZE,
              height: WB_COMMENT_PIN_SCREEN_SIZE,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'auto',
              cursor: readOnly || !onPinMove ? 'pointer' : dragging ? 'grabbing' : 'grab',
              zIndex: selected ? 4 : 3,
              touchAction: 'none',
            }}
            onPointerDown={e => handlePointerDown(thread.id, e)}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          >
            <WbCommentPinIcon selected={selected} />
          </div>
        );
      })}
    </div>
  );
};
