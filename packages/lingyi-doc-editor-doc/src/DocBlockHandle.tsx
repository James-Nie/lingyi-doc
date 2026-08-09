import React, { useRef, useState } from 'react';
import type { DocBlock } from '@lingyi-doc/core-doc';
import { getBlockHandleLabel } from '@lingyi-doc/core-doc';
import { DOC_COLORS } from './styles';
import { DocBlockActionMenu } from './DocBlockActionMenu';
import type { InsertBlockKind } from './DocBlockInsertMenu';

const FIRST_LINE_HEIGHT = 28;

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      {[0, 1, 2].flatMap(row =>
        [0, 1].map(col => (
          <circle key={`${row}-${col}`} cx={3.5 + col * 7} cy={2.5 + row * 4.5} r="1.2" />
        )),
      )}
    </svg>
  );
}

export interface DocBlockHandleProps {
  block: DocBlock;
  index: number;
  visible: boolean;
  isDragging: boolean;
  onDragStart: (index: number, clientY: number) => void;
  onDelete: () => void;
  onCopy: () => void;
  onTextColor: (color: string) => void;
  onBackgroundColor: (color: string) => void;
  onInsertBelow?: (kind: InsertBlockKind, tableSize?: { rows: number; cols: number }) => void;
  onMenuOpenChange?: (open: boolean) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const DocBlockHandle: React.FC<DocBlockHandleProps> = ({
  block,
  index,
  visible,
  isDragging,
  onDragStart,
  onDelete,
  onCopy,
  onTextColor,
  onBackgroundColor,
  onInsertBelow,
  onMenuOpenChange,
  onMouseEnter,
  onMouseLeave,
}) => {
  const handleRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const dragStarted = useRef(false);
  const startY = useRef(0);

  const label = getBlockHandleLabel(block);
  const show = visible || menuOpen || isDragging;

  const setOpen = (open: boolean) => {
    setMenuOpen(open);
    onMenuOpenChange?.(open);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragStarted.current = false;
    startY.current = e.clientY;

    const onMove = (ev: MouseEvent) => {
      if (dragStarted.current) return;
      if (Math.abs(ev.clientY - startY.current) > 4) {
        dragStarted.current = true;
        setOpen(false);
        onDragStart(index, ev.clientY);
      }
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!dragStarted.current) {
        setMenuOpen(prev => {
          const next = !prev;
          onMenuOpenChange?.(next);
          return next;
        });
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <>
      <div
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={{
          position: 'absolute',
          left: -40,
          top: 0,
          width: 36,
          height: FIRST_LINE_HEIGHT,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          opacity: show ? 1 : 0,
          pointerEvents: show ? 'auto' : 'none',
          transition: 'opacity 0.18s ease',
          zIndex: 2,
        }}
      >
        <button
          ref={handleRef}
          type="button"
          title="可拖拽和点击"
          onMouseDown={handleMouseDown}
          onMouseEnter={() => setShowTip(true)}
          onMouseLeave={() => setShowTip(false)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            height: 24,
            padding: '0 4px',
            border: `1px solid ${DOC_COLORS.border}`,
            borderRadius: 4,
            background: isDragging ? '#E8F3FF' : '#fff',
            color: DOC_COLORS.muted,
            cursor: isDragging ? 'grabbing' : 'grab',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            fontSize: 11,
            fontWeight: 600,
            userSelect: 'none',
          }}
        >
          {label && (
            <span style={{ color: DOC_COLORS.text, minWidth: 14, textAlign: 'center' }}>{label}</span>
          )}
          <GripIcon />
        </button>
        {showTip && !menuOpen && !isDragging && (
          <div style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 6,
            padding: '4px 8px',
            background: '#4E5969',
            color: '#fff',
            fontSize: 12,
            borderRadius: 4,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}>
            可拖拽和点击
          </div>
        )}
      </div>

      <DocBlockActionMenu
        open={menuOpen}
        anchorRef={handleRef}
        onClose={() => setOpen(false)}
        onDelete={() => { onDelete(); setOpen(false); }}
        onCopy={() => { onCopy(); setOpen(false); }}
        onTextColor={onTextColor}
        onBackgroundColor={onBackgroundColor}
        onInsertBelow={onInsertBelow}
        showColorActions={block.type === 'paragraph' || block.type === 'heading' || block.type === 'quote'}
      />
    </>
  );
};
