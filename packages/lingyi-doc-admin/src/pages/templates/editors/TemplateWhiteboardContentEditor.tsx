import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { cloneWhiteboardElements } from '@lingyi-doc/core';
import { WhiteboardEditor } from '@lingyi-doc/editor';
import { whiteboardFromContent } from '../templateContentUtils';

type WhiteboardDoc = ReturnType<typeof whiteboardFromContent>;
type WhiteboardElement = ReturnType<typeof cloneWhiteboardElements>[number];
type WhiteboardViewport = WhiteboardDoc['viewport'];
type WhiteboardElementPatch = Partial<WhiteboardElement>;

export interface TemplateContentEditorHandle {
  getContentJson: () => unknown;
}

interface Props {
  documentTitle: string;
  contentJson: unknown | null;
  previewMode?: boolean;
}

export const TemplateWhiteboardContentEditor = forwardRef<TemplateContentEditorHandle, Props>(
  function TemplateWhiteboardContentEditor({ documentTitle, contentJson, previewMode = false }, ref) {
    const docRef = useRef<ReturnType<typeof whiteboardFromContent> | null>(null);
    if (!docRef.current) {
      docRef.current = whiteboardFromContent(contentJson, documentTitle);
    }

    const [title, setTitle] = useState(documentTitle);
    const [elements, setElements] = useState<WhiteboardElement[]>(() =>
      cloneWhiteboardElements(docRef.current!.elements),
    );
    const [viewport, setViewport] = useState<WhiteboardViewport>(() => ({ ...docRef.current!.viewport }));

    useImperativeHandle(ref, () => ({
      getContentJson: (): unknown => {
        const doc = docRef.current!;
        doc.title = title;
        return doc.toJSON();
      },
    }), [title]);

    const syncFromDoc = useCallback(() => {
      const doc = docRef.current!;
      setElements(cloneWhiteboardElements(doc.elements));
      setViewport({ ...doc.viewport });
    }, []);

    const doc = docRef.current!;

    return (
      <div style={{
        height: 'calc(100vh - 220px)',
        minHeight: 480,
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#f5f6f7',
      }}
      >
        <WhiteboardEditor
          title={title}
          elements={elements}
          viewport={viewport}
          readOnly={previewMode}
          embedded
          canUndo={previewMode ? false : doc.canUndo()}
          canRedo={previewMode ? false : doc.canRedo()}
          onTitleChange={previewMode ? undefined : setTitle}
          onElementsChange={(next: WhiteboardElement[], recordHistory = true) => {
            if (previewMode) return;
            doc.setElements(next, recordHistory);
            syncFromDoc();
          }}
          onViewportChange={(patch: Partial<WhiteboardViewport>, recordHistory = false) => {
            if (previewMode) {
              setViewport((prev: WhiteboardViewport) => ({ ...prev, ...patch }));
              return;
            }
            doc.setViewport(patch, recordHistory);
            syncFromDoc();
          }}
          onElementUpdate={(id: string, patch: WhiteboardElementPatch, recordHistory = false) => {
            if (previewMode) return;
            doc.updateElement(id, patch, recordHistory);
            syncFromDoc();
          }}
          onUndo={() => {
            if (previewMode) return;
            if (doc.undo()) syncFromDoc();
          }}
          onRedo={() => {
            if (previewMode) return;
            if (doc.redo()) syncFromDoc();
          }}
        />
      </div>
    );
  },
);
