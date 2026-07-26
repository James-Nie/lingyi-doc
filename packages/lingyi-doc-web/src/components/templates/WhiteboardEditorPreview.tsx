import React, { useCallback, useRef, useState } from 'react';
import {
  WhiteboardDocument,
  cloneWhiteboardElements,
  createEmptyWhiteboard,
  type WhiteboardElement,
  type WhiteboardJSON,
  type WhiteboardViewport,
} from '@lingyi-doc/core';
import { WhiteboardEditor } from '@lingyi-doc/editor-pro';

interface WhiteboardEditorPreviewProps {
  title: string;
  whiteboardJson: WhiteboardJSON;
}

/** 模板中心画板预览 */
export const WhiteboardEditorPreview: React.FC<WhiteboardEditorPreviewProps> = ({
  title: initialTitle,
  whiteboardJson,
}) => {
  const docRef = useRef<WhiteboardDocument | null>(null);
  if (!docRef.current) {
    docRef.current = WhiteboardDocument.fromJSON({
      ...whiteboardJson,
      title: initialTitle || whiteboardJson.title || '未命名画板',
    });
  }

  const [elements, setElements] = useState<WhiteboardElement[]>(() =>
    cloneWhiteboardElements(docRef.current!.elements),
  );
  const [viewport, setViewport] = useState<WhiteboardViewport>(() => ({ ...docRef.current!.viewport }));

  const syncFromDoc = useCallback(() => {
    const doc = docRef.current!;
    setElements(cloneWhiteboardElements(doc.elements));
    setViewport({ ...doc.viewport });
  }, []);

  const doc = docRef.current!;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <WhiteboardEditor
        title={initialTitle}
        elements={elements}
        viewport={viewport}
        canUndo={false}
        canRedo={false}
        readOnly
        embedded
        onElementsChange={() => syncFromDoc()}
        onViewportChange={patch => setViewport(prev => ({ ...prev, ...patch }))}
        onElementUpdate={() => syncFromDoc()}
        onUndo={() => {}}
        onRedo={() => {}}
      />
    </div>
  );
};

export function emptyWhiteboardPreview(title: string) {
  return createEmptyWhiteboard('', title);
}
