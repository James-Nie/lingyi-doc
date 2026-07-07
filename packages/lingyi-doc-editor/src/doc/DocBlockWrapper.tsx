import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { DocBlock } from '@lingyi-doc/core';
import { isTextBlock, supportsBlockHandle } from '@lingyi-doc/core';
import { DocBlockHandle } from './DocBlockHandle';
import type { InsertBlockKind } from './DocBlockInsertMenu';

export interface BlockDragState {
  fromIndex: number;
  overIndex: number;
  position: 'before' | 'after';
}

/** 首行区域高度：操作手柄仅对齐首行 */
const FIRST_LINE_ZONE = 40;
/** 左侧手柄 gutter 宽度 */
const GUTTER_WIDTH = 48;
/** 移出热区后的容错延迟（便于移向手柄） */
const HIDE_GRACE_MS = 220;

interface DocBlockWrapperProps {
  block: DocBlock;
  index: number;
  isHandleActive: boolean;
  dragState: BlockDragState | null;
  onHandleActivate: (index: number) => void;
  onHandleDeactivate: () => void;
  onDragStart: (index: number, clientY: number) => void;
  onDelete: () => void;
  onCopy: () => void;
  onTextColor: (color: string) => void;
  onBackgroundColor: (color: string) => void;
  onInsertBelow?: (kind: InsertBlockKind, tableSize?: { rows: number; cols: number }) => void;
  onGapClick?: (index: number, clientX: number, clientY: number) => void;
  readOnly?: boolean;
  children: React.ReactNode;
}

/** 判断光标是否落在「首行 + 左侧 gutter」热区内 */
function isInHandleHotZone(el: HTMLElement, clientX: number, clientY: number): boolean {
  const rect = el.getBoundingClientRect();
  const inFirstLine = clientY >= rect.top && clientY <= rect.top + FIRST_LINE_ZONE;
  const inGutter = clientX >= rect.left - GUTTER_WIDTH && clientX <= rect.left + 8;
  const inBlockFirstLine = inFirstLine && clientX >= rect.left && clientX <= rect.right;
  return (inFirstLine && inGutter) || inBlockFirstLine;
}

export const DocBlockWrapper: React.FC<DocBlockWrapperProps> = ({
  block,
  index,
  isHandleActive,
  dragState,
  onHandleActivate,
  onHandleDeactivate,
  onDragStart,
  onDelete,
  onCopy,
  onTextColor,
  onBackgroundColor,
  onInsertBelow,
  onGapClick,
  readOnly = false,
  children,
}) => {
  if (readOnly) {
    return (
      <div data-doc-block-readonly="" data-block-row={index} data-block-index={index}>
        {children}
      </div>
    );
  }

  const wrapperRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const inHotZoneRef = useRef(false);
  const [inHotZone, setInHotZone] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [textInteracting, setTextInteracting] = useState(false);

  const setHotZone = useCallback((value: boolean) => {
    inHotZoneRef.current = value;
    setInHotZone(value);
  }, []);

  const showHandle = supportsBlockHandle(block);
  const isDragging = dragState?.fromIndex === index;
  const isDropTarget = dragState != null && dragState.overIndex === index && dragState.fromIndex !== index;

  const blockBg = isTextBlock(block)
    ? block.blockBackground
    : block.type === 'code'
      ? block.blockBackground
      : undefined;

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const deactivate = useCallback(() => {
    setHotZone(false);
    if (isHandleActive) onHandleDeactivate();
  }, [isHandleActive, onHandleDeactivate, setHotZone]);

  const scheduleHide = useCallback(() => {
    if (menuOpen || isDragging || textInteracting) return;
    cancelHide();
    hideTimerRef.current = window.setTimeout(() => {
      if (!inHotZoneRef.current) deactivate();
      hideTimerRef.current = null;
    }, HIDE_GRACE_MS);
  }, [menuOpen, isDragging, textInteracting, cancelHide, deactivate]);

  const activate = useCallback(() => {
    cancelHide();
    setHotZone(true);
    onHandleActivate(index);
  }, [cancelHide, index, onHandleActivate, setHotZone]);

  const updateHotZone = useCallback((clientX: number, clientY: number) => {
    const el = wrapperRef.current;
    if (!el || !showHandle || textInteracting || menuOpen || isDragging) return;

    if (isInHandleHotZone(el, clientX, clientY)) {
      if (!isHandleActive) onHandleActivate(index);
      setHotZone(true);
      cancelHide();
    } else if (isHandleActive) {
      setHotZone(false);
      scheduleHide();
    }
  }, [showHandle, textInteracting, menuOpen, isDragging, isHandleActive, index, onHandleActivate, setHotZone, cancelHide, scheduleHide]);

  useEffect(() => () => cancelHide(), [cancelHide]);

  // 文本选中/拖拽时隐藏手柄，避免遮挡选区
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || !showHandle) return;

    const onEditableDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-doc-editable]')) return;
      setTextInteracting(true);
      scheduleHide();
    };

    const onDocMouseUp = () => {
      setTextInteracting(false);
      const sel = window.getSelection();
      const hasSelection = sel && !sel.isCollapsed && sel.toString().length > 0;
      if (hasSelection) {
        deactivate();
      }
    };

    el.addEventListener('mousedown', onEditableDown);
    document.addEventListener('mouseup', onDocMouseUp);
    return () => {
      el.removeEventListener('mousedown', onEditableDown);
      document.removeEventListener('mouseup', onDocMouseUp);
    };
  }, [showHandle, scheduleHide, deactivate]);

  // 其他段落成为活跃块时，重置本块状态
  useEffect(() => {
    if (!isHandleActive) {
      setHotZone(false);
      if (menuOpen) setMenuOpen(false);
      cancelHide();
    }
  }, [isHandleActive, menuOpen, setHotZone, cancelHide]);

  const handleVisible = showHandle
    && isHandleActive
    && !textInteracting
    && (menuOpen || isDragging || inHotZone);

  return (
    <div
      ref={wrapperRef}
      data-block-row={index}
      data-block-index={index}
      data-block-id={block.id}
      style={{ position: 'relative', cursor: 'text' }}
      onMouseMove={e => updateHotZone(e.clientX, e.clientY)}
      onMouseLeave={() => {
        setHotZone(false);
        scheduleHide();
      }}
      onMouseDown={e => {
        if (e.button !== 0 || e.shiftKey) return;
        const target = e.target as HTMLElement;
        if (target.closest(
          '[data-doc-editable], [data-doc-code-ui], [data-doc-mermaid-ui], [data-doc-table-ui], [data-doc-image-ui], [data-doc-base-ui], [data-doc-block-handle], [data-doc-block-action-menu]',
        )) return;
        e.preventDefault();
        onGapClick?.(index, e.clientX, e.clientY);
      }}
    >
      {isDropTarget && dragState.position === 'before' && (
        <div style={{
          position: 'absolute', top: -2, left: 0, right: 0, height: 2,
          background: '#165DFF', borderRadius: 1, zIndex: 3,
        }} />
      )}

      {showHandle && (
        <>
          {/* 左侧 gutter 热区：始终可响应，与首行形成连续交互面 */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: -GUTTER_WIDTH,
              top: 0,
              width: GUTTER_WIDTH,
              height: FIRST_LINE_ZONE,
              pointerEvents: 'auto',
            }}
            onMouseMove={e => updateHotZone(e.clientX, e.clientY)}
            onMouseEnter={e => updateHotZone(e.clientX, e.clientY)}
            onMouseLeave={scheduleHide}
          />
          <DocBlockHandle
            block={block}
            index={index}
            visible={handleVisible}
            isDragging={isDragging}
            onDragStart={onDragStart}
            onDelete={onDelete}
            onCopy={onCopy}
            onTextColor={onTextColor}
            onBackgroundColor={onBackgroundColor}
            onInsertBelow={onInsertBelow}
            onMouseEnter={activate}
            onMouseLeave={scheduleHide}
            onMenuOpenChange={open => {
              setMenuOpen(open);
              if (open) activate();
              else scheduleHide();
            }}
          />
        </>
      )}

      <div style={{
        borderRadius: 4,
        background: blockBg || (handleVisible && !blockBg ? 'rgba(22, 93, 255, 0.04)' : undefined),
        transition: 'background 0.15s ease',
        opacity: isDragging ? 0.45 : 1,
      }}>
        {children}
      </div>

      {isDropTarget && dragState.position === 'after' && (
        <div style={{
          position: 'absolute', bottom: -2, left: 0, right: 0, height: 2,
          background: '#165DFF', borderRadius: 1, zIndex: 3,
        }} />
      )}
    </div>
  );
};
