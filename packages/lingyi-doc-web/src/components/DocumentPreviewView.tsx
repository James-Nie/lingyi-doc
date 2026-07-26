import React, { Suspense, useEffect, useMemo, useState } from 'react';
import {
  Workbook,
  RichDocument,
  MindNoteDocument,
  WhiteboardDocument,
  type RichDocumentJSON,
  type MindNoteJSON,
  type WhiteboardJSON,
  type ToolbarState,
  isBaseSheet,
} from '@lingyi-doc/core';

export interface DocumentPreviewViewProps {
  title: string;
  docType: string;
  data: unknown;
}

const noop = () => {};

const RichDocEditor = React.lazy(() =>
  import('@lingyi-doc/editor-doc').then(m => ({ default: m.RichDocEditor })),
);
const MindNoteEditor = React.lazy(() =>
  import('@lingyi-doc/editor-mindmap').then(m => ({ default: m.MindNoteEditor })),
);
const WhiteboardEditor = React.lazy(() =>
  import('@lingyi-doc/editor-whiteboard').then(m => ({ default: m.WhiteboardEditor })),
);
const SheetPreviewInner = React.lazy(() =>
  import('./DocumentSheetPreview').then(m => ({ default: m.DocumentSheetPreview })),
);

function PreviewLoading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 480, color: '#8f959e' }}>
      加载预览...
    </div>
  );
}

/** 分享页 / 公开访问：按文档类型懒加载真实预览 */
export const DocumentPreviewView: React.FC<DocumentPreviewViewProps> = ({ title, docType, data }) => {
  let body: React.ReactNode;
  if (docType === 'richtext') {
    body = <RichTextPreview title={title} data={data} />;
  } else if (docType === 'mindnote') {
    body = <MindNotePreview title={title} data={data} />;
  } else if (docType === 'whiteboard') {
    body = <WhiteboardPreview title={title} data={data} />;
  } else {
    body = <SheetPreviewInner title={title} docType={docType} data={data} />;
  }
  return <Suspense fallback={<PreviewLoading />}>{body}</Suspense>;
};

function RichTextPreview({ title, data }: { title: string; data: unknown }) {
  const document = useMemo(() => {
    const json = data as RichDocumentJSON;
    return RichDocument.fromJSON({
      ...json,
      title: title || json.title || '未命名文档',
    });
  }, [data, title]);

  const [blocks, setBlocks] = useState(document.blocks);
  const [toolbarState] = useState<ToolbarState>(() => document.getToolbarState(0));

  useEffect(() => {
    setBlocks(document.blocks);
  }, [document]);

  return (
    <div style={{ height: '100%', minHeight: 480, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <RichDocEditor
        documentId=""
        title={title}
        blocks={blocks}
        toolbarState={toolbarState}
        outline={document.getOutline()}
        showOutline={false}
        fullscreen={false}
        readOnly
        onBlocksChange={setBlocks}
        onToolbarAction={noop}
        onToolbarStateChange={noop}
        onToggleOutline={noop}
        onToggleFullscreen={noop}
        onActiveBlockChange={noop}
      />
    </div>
  );
}

function MindNotePreview({ title, data }: { title: string; data: unknown }) {
  const document = useMemo(() => {
    const json = data as MindNoteJSON;
    return MindNoteDocument.fromJSON({ ...json, title: title || json.title || '未命名思维笔记' });
  }, [data, title]);

  const [root, setRoot] = useState(document.root);
  const [settings, setSettings] = useState(document.settings);

  useEffect(() => {
    setRoot(document.root);
    setSettings(document.settings);
  }, [document]);

  return (
    <div style={{ height: '100%', minHeight: 480, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <MindNoteEditor
        title={title}
        root={root}
        settings={settings}
        canUndo={false}
        canRedo={false}
        readOnly
        onTitleChange={noop}
        onRootChange={setRoot}
        onSettingsChange={partial => setSettings(prev => ({ ...prev, ...partial }))}
        onNodeTextChange={noop}
        onInsertSibling={() => null}
        onInsertChild={() => null}
        onInsertParent={() => null}
        onDeleteNode={noop}
        onDuplicateNode={() => null}
        onToggleCollapse={noop}
        onExpandChildren={noop}
        onUndo={noop}
        onRedo={noop}
      />
    </div>
  );
}

function WhiteboardPreview({ title, data }: { title: string; data: unknown }) {
  const document = useMemo(() => {
    const json = data as WhiteboardJSON;
    return WhiteboardDocument.fromJSON({ ...json, title: title || json.title || '未命名画板' });
  }, [data, title]);

  const [elements, setElements] = useState(document.elements);
  const [viewport, setViewport] = useState(document.viewport);

  useEffect(() => {
    setElements(document.elements);
    setViewport(document.viewport);
  }, [document]);

  return (
    <div style={{ height: '100%', minHeight: 480, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <WhiteboardEditor
        title={title}
        elements={elements}
        viewport={viewport}
        canUndo={false}
        canRedo={false}
        readOnly
        embedded
        onElementsChange={setElements}
        onViewportChange={patch => setViewport(prev => ({ ...prev, ...patch }))}
        onElementUpdate={(id, patch) => {
          setElements(prev => prev.map(el => (el.id === id ? { ...el, ...patch } as typeof el : el)));
        }}
        onUndo={noop}
        onRedo={noop}
      />
    </div>
  );
}
