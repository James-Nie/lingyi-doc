import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DOC_COLORS } from '../styles';

const BUBBLE_SIZE = { width: 36, height: 32 };
const GAP = 8;

interface SelectionAnchor {
  rect: DOMRect;
}

function getTextSelectionAnchor(editorEl: HTMLElement | null): SelectionAnchor | null {
  if (!editorEl) return null;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  if (!editorEl.contains(range.commonAncestorContainer)) return null;

  const rects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0);
  if (!rects.length) return null;

  const quote = sel.toString().replace(/\u200B/g, '').trim();
  if (!quote) return null;

  return { rect: rects[rects.length - 1] };
}

function bubblePosition(anchorRect: DOMRect): { top: number; left: number } {
  const margin = 8;
  const vw = window.innerWidth;
  let left = anchorRect.right - BUBBLE_SIZE.width;
  let top = anchorRect.top - BUBBLE_SIZE.height - GAP;

  if (top < margin) {
    top = anchorRect.bottom + GAP;
  }
  left = Math.max(margin, Math.min(left, vw - BUBBLE_SIZE.width - margin));
  return { top, left };
}

function CommentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

interface DocTextSelectionCommentProps {
  editorRef: React.RefObject<HTMLElement | null>;
  scrollRef: React.RefObject<HTMLElement | null>;
  enabled: boolean;
  blockSelectionActive?: boolean;
  onAddComment: () => void;
}

export const DocTextSelectionComment: React.FC<DocTextSelectionCommentProps> = ({
  editorRef,
  scrollRef,
  enabled,
  blockSelectionActive = false,
  onAddComment,
}) => {
  const [anchor, setAnchor] = useState<SelectionAnchor | null>(null);
  const [bubblePos, setBubblePos] = useState({ top: 0, left: 0 });
  const [showTooltip, setShowTooltip] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const refreshAnchor = useCallback(() => {
    if (!enabled || blockSelectionActive) {
      setAnchor(null);
      return;
    }
    setAnchor(getTextSelectionAnchor(editorRef.current));
  }, [enabled, blockSelectionActive, editorRef]);

  useEffect(() => {
    if (!enabled) {
      setAnchor(null);
      return;
    }
    const onSelectionChange = () => refreshAnchor();
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [enabled, refreshAnchor]);

  useEffect(() => {
    if (!enabled) return;
    const scrollEl = scrollRef.current;
    const onScroll = () => refreshAnchor();
    scrollEl?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      scrollEl?.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [enabled, scrollRef, refreshAnchor]);

  useLayoutEffect(() => {
    if (!anchor) return;
    setBubblePos(bubblePosition(anchor.rect));
  }, [anchor]);

  const handleAddComment = useCallback(() => {
    onAddComment();
    setAnchor(null);
  }, [onAddComment]);

  const showBubble = enabled && !!anchor && !blockSelectionActive;
  if (!showBubble) return null;

  return createPortal(
    <div
      ref={bubbleRef}
      data-doc-text-selection-comment
      data-sheet-keep-selection
      onMouseDown={e => {
        const t = e.target as HTMLElement;
        if (t.closest('button')) e.preventDefault();
      }}
      style={{
        position: 'fixed',
        top: bubblePos.top,
        left: bubblePos.left,
        zIndex: 10003,
        display: 'flex',
        alignItems: 'center',
        padding: '2px 4px',
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
        border: `1px solid ${DOC_COLORS.border}`,
      }}
    >
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={handleAddComment}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          style={{
            width: 28,
            height: 28,
            border: 'none',
            borderRadius: 6,
            background: showTooltip ? '#F2F3F5' : 'transparent',
            color: DOC_COLORS.text,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          <CommentIcon />
        </button>
        {showTooltip && (
          <div style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 6,
            padding: '4px 10px',
            background: '#4E5969',
            color: '#fff',
            fontSize: 12,
            borderRadius: 4,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}>
            评论
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
