import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WhiteboardBlock } from '@lingyi-doc/core';
import { WhiteboardDocument } from '@lingyi-doc/core';
import { WhiteboardEditor } from '../whiteboard/WhiteboardEditor';
import { WhiteboardEmbedPreview } from '../whiteboard/WhiteboardEmbedPreview';
import { WB_COLORS } from '../whiteboard/styles';
import { DOC_COLORS } from './styles';
import { useDocHistoryRevision } from './DocHistoryContext';

const PREVIEW_HEIGHT = 400;

interface DocWhiteboardBlockProps {
  block: WhiteboardBlock;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onFocus: () => void;
  onChange: (block: WhiteboardBlock, recordHistory?: boolean) => void;
  onRegisterRef: (id: string, el: HTMLElement | null) => void;
  readOnly?: boolean;
}

export const DocWhiteboardBlock: React.FC<DocWhiteboardBlockProps> = ({
  block,
  selected,
  onSelect,
  onFocus,
  onChange,
  onRegisterRef,
  readOnly = false,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef(block);
  blockRef.current = block;

  const docRef = useRef<WhiteboardDocument | null>(null);
  const lastSyncedDataRef = useRef('');
  if (!docRef.current) {
    docRef.current = new WhiteboardDocument(block.whiteboardData);
    lastSyncedDataRef.current = JSON.stringify(block.whiteboardData);
  }

  const historyRevision = useDocHistoryRevision();
  const lastHistoryRevisionRef = useRef(historyRevision);
  const [hovered, setHovered] = useState(false);
  const [revision, setRevision] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const showBorder = selected || hovered;

  useEffect(() => {
    onRegisterRef(block.id, rootRef.current);
    return () => onRegisterRef(block.id, null);
  }, [block.id, onRegisterRef]);

  useEffect(() => {
    if (fullscreen) return;
    const next = JSON.stringify(block.whiteboardData);
    if (next === lastSyncedDataRef.current) return;
    lastSyncedDataRef.current = next;
    docRef.current = new WhiteboardDocument(block.whiteboardData);
    setRevision(v => v + 1);
  }, [block.whiteboardData, fullscreen]);

  useEffect(() => {
    if (historyRevision === lastHistoryRevisionRef.current) return;
    lastHistoryRevisionRef.current = historyRevision;
    if (fullscreen) return;
    const next = JSON.stringify(block.whiteboardData);
    lastSyncedDataRef.current = next;
    docRef.current = new WhiteboardDocument(block.whiteboardData);
    setRevision(v => v + 1);
  }, [block.whiteboardData, historyRevision, fullscreen]);

  const persist = useCallback((recordHistory = false) => {
    if (readOnly || !docRef.current) return;
    const whiteboardData = docRef.current.toJSON();
    lastSyncedDataRef.current = JSON.stringify(whiteboardData);
    onChange({
      ...blockRef.current,
      whiteboardData,
    }, recordHistory);
  }, [onChange, readOnly]);

  const exitFullscreen = useCallback(() => {
    persist(false);
    setFullscreen(false);
    onFocus();
  }, [persist, onFocus]);

  const openFullscreen = useCallback(() => {
    if (readOnly) return;
    onSelect();
    onFocus();
    setFullscreen(true);
  }, [readOnly, onSelect, onFocus]);

  useEffect(() => {
    if (!fullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen, exitFullscreen]);

  const doc = docRef.current;
  void revision;

  const editor = (
    <WhiteboardEditor
      readOnly={readOnly}
      title={block.title ?? '画板'}
      elements={doc.elements}
      viewport={doc.viewport}
      canUndo={doc.canUndo()}
      canRedo={doc.canRedo()}
      onElementsChange={(elements, recordHistory) => {
        doc.setElements(elements, recordHistory);
        setRevision(v => v + 1);
        persist(recordHistory);
      }}
      onViewportChange={(vp, recordHistory) => {
        doc.setViewport(vp, recordHistory);
        setRevision(v => v + 1);
        persist(recordHistory);
      }}
      onElementUpdate={(id, patch, recordHistory) => {
        doc.updateElement(id, patch, recordHistory);
        setRevision(v => v + 1);
        persist(recordHistory);
      }}
      onUndo={() => {
        doc.undo();
        setRevision(v => v + 1);
        persist(true);
      }}
      onRedo={() => {
        doc.redo();
        setRevision(v => v + 1);
        persist(true);
      }}
    />
  );

  return (
    <>
      <div
        ref={rootRef}
        data-doc-whiteboard=""
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onMouseDown={e => {
          onSelect();
          onFocus();
          e.stopPropagation();
        }}
        onDoubleClick={e => {
          e.stopPropagation();
          openFullscreen();
        }}
        title={readOnly ? undefined : '双击进入画板编辑'}
        style={{
          margin: '12px 0',
          position: 'relative',
          borderRadius: 8,
          border: `1px solid ${showBorder ? '#3370ff' : DOC_COLORS.border}`,
          overflow: 'hidden',
          background: '#fff',
          boxShadow: showBorder ? '0 0 0 2px rgba(51,112,255,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
          cursor: readOnly ? 'default' : 'pointer',
        }}
      >
        <WhiteboardEmbedPreview elements={doc.elements} height={PREVIEW_HEIGHT} />
        {!doc.elements.length && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: DOC_COLORS.muted,
              fontSize: 14,
              pointerEvents: 'none',
            }}
          >
            {readOnly ? '空画板' : '双击进入画板编辑'}
          </div>
        )}
      </div>

      {fullscreen && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10050,
            display: 'flex',
            flexDirection: 'column',
            background: WB_COLORS.pageBg,
          }}
        >
          <button
            type="button"
            onClick={exitFullscreen}
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              zIndex: 10060,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 36,
              padding: '0 14px',
              border: `1px solid ${DOC_COLORS.border}`,
              borderRadius: 8,
              background: '#fff',
              color: DOC_COLORS.text,
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            退出
          </button>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {editor}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};
