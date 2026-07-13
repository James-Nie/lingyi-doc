import React, { useEffect, useMemo, useState } from 'react';
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
import {
  RichDocEditor,
  MindNoteEditor,
  WhiteboardEditor,
  SheetContainer,
  SheetTabs,
  useSheetStore,
  BASE_THEME,
} from '@lingyi-doc/editor';

export interface DocumentPreviewViewProps {
  title: string;
  docType: string;
  data: unknown;
}

const noop = () => {};

/** 分享页 / 公开访问：按文档类型渲染真实预览 */
export const DocumentPreviewView: React.FC<DocumentPreviewViewProps> = ({ title, docType, data }) => {
  if (docType === 'richtext') {
    return <RichTextPreview title={title} data={data} />;
  }
  if (docType === 'mindnote') {
    return <MindNotePreview title={title} data={data} />;
  }
  if (docType === 'whiteboard') {
    return <WhiteboardPreview title={title} data={data} />;
  }
  return <SheetPreview title={title} docType={docType} data={data} />;
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

function SheetPreview({ title, docType, data }: { title: string; docType: string; data: unknown }) {
  const normalizedType = docType === 'base' ? 'base' : 'freeform';
  const [workbook] = useState(() => {
    const wb = Workbook.fromJSON(data as Record<string, unknown>);
    wb.normalizeAfterLoad(normalizedType);
    return wb;
  });
  const [activeSheetId, setActiveSheetId] = useState(workbook.activeSheetId);

  useEffect(() => {
    useSheetStore.getState().setEditingCell(null);
    useSheetStore.getState().setFormulaBarText('');
    useSheetStore.getState().setSelection(null, null);
  }, []);

  const activeTable = workbook.activeSheet;
  const isBase = activeTable ? isBaseSheet(activeTable.sheet) : false;
  const sheetInfos = useMemo(
    () => workbook.sheets.map(s => ({ id: s.id, name: s.name, type: s.type })),
    [workbook, activeSheetId],
  );

  if (!activeTable) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#8f959e' }}>空白文档</div>;
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 480,
      overflow: 'hidden',
      background: isBase ? BASE_THEME.pageBg : '#fff',
    }}>
      {!isBase && title && (
        <div style={{ padding: '12px 16px', fontSize: 16, fontWeight: 600, color: '#1f2329', background: '#fff', borderBottom: '1px solid #dee0e3' }}>
          {title}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: isBase ? 8 : 0 }}>
        <SheetContainer
          key={activeSheetId}
          table={activeTable}
          previewMode
          selectedChartId={null}
          onSelectChart={noop}
          onOpenFieldConfig={noop}
          onToggleFieldVisibility={noop}
          onDeleteField={noop}
        />
      </div>
      {sheetInfos.length > 1 && (
        <SheetTabs
          sheets={sheetInfos}
          activeId={activeSheetId}
          onSwitch={id => {
            workbook.switchSheet(id);
            setActiveSheetId(id);
            useSheetStore.getState().setEditingCell(null);
            useSheetStore.getState().setFormulaBarText('');
          }}
          onAdd={noop}
          onRename={noop}
          onDelete={noop}
        />
      )}
    </div>
  );
}
