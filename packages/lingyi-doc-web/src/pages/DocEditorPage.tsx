import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { message } from 'antd';
import {
  DocumentManager,
  RichDocument,
  RichDocExport,
  SaveManager,
  isTextBlock,
  mergeBlocksToListBlock,
  type DocBlock,
  type DocumentApiResponse,
  type ToolbarState,
  type DocSelectionContext,
  type RichDocExportFormat,
} from '@lingyi-doc/core';
import { RichDocEditor, type ToolbarAction, type RichDocEditorSaveRef } from '@lingyi-doc/editor';
import { DocumentBar } from '../components/DocumentBar';
import { appPath } from '../utils/appPaths';
import type { EditorAccessProps } from '../types/editorAccess';
import type { DownloadFormat } from '../utils/downloadAs';

function blockIndicesFromCtx(ctx: DocSelectionContext | null, fallback: number): number[] {
  if (!ctx) return [fallback];
  const indices: number[] = [];
  for (let i = ctx.startBlock; i <= ctx.endBlock; i++) indices.push(i);
  return indices.length ? indices : [fallback];
}

export const DocEditorPage: React.FC<{ docId?: string; prefetched?: DocumentApiResponse; embedded?: boolean } & EditorAccessProps> = ({
  docId: docIdProp,
  prefetched,
  embedded,
  readOnly = false,
  canEdit = true,
  effectiveViewMode = 'edit',
  onTogglePreview,
}) => {
  const { docId: routeDocId } = useParams<{ docId: string }>();
  const docId = docIdProp ?? routeDocId;
  const navigate = useNavigate();
  const docRef = useRef<RichDocument | null>(null);
  const saveManagerRef = useRef<SaveManager | null>(null);
  const titleRef = useRef('未命名文档');

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('未命名文档');
  const [blocks, setBlocks] = useState<DocBlock[]>([]);
  const [toolbarState, setToolbarState] = useState<ToolbarState>(RichDocument.empty().getToolbarState(0));
  const [outline, setOutline] = useState(RichDocument.empty().getOutline());
  const [showOutline, setShowOutline] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving' | 'error'>('saved');
  const [lastModified, setLastModified] = useState(Date.now());
  const [historyRevision, setHistoryRevision] = useState(0);
  const editorSaveRef = useRef<RichDocEditorSaveRef | null>(null);

  useEffect(() => { titleRef.current = title; }, [title]);

  const syncFromDoc = useCallback((doc: RichDocument, index?: number) => {
    setBlocks([...doc.blocks]);
    setOutline(doc.getOutline());
    setToolbarState(doc.getToolbarState(index ?? activeIndexRef.current));
  }, []);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    if (!docId) {
      navigate(appPath.home, { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await DocumentManager.loadRichText(docId, prefetched);
      if (cancelled) return;
      if (!result) {
        navigate(appPath.home, { replace: true });
        return;
      }
      docRef.current = result.document;
      setTitle(result.title);
      titleRef.current = result.title;
      setLastModified(Date.now());
      syncFromDoc(result.document, 0);
      setActiveIndex(0);
      activeIndexRef.current = 0;
      setDirty(false);
      setSaveStatus('saved');

      if (!readOnly) {
        saveManagerRef.current?.dispose();
        const manager = new SaveManager({
          docId,
          docType: 'richtext',
          debounceMs: 1500,
          getTitle: () => titleRef.current,
          getSnapshot: () => docRef.current!.toJSON() as unknown as Record<string, unknown>,
          onBeforeFlush: () => {
            editorSaveRef.current?.flushBeforeSave();
          },
          saveFull: async (t) => {
            docRef.current!.title = t;
            return DocumentManager.saveRichText(docId, t, docRef.current!);
          },
          savePatch: (input) => DocumentManager.patch(docId, input),
          onStatusChange: (status) => {
            setSaveStatus(status);
            if (status === 'saved') setDirty(false);
          },
          onSaved: () => setLastModified(Date.now()),
        });
        manager.initialize(result.version, result.document.toJSON() as unknown as Record<string, unknown>, result.title);
        saveManagerRef.current = manager;
      } else {
        saveManagerRef.current?.dispose();
        saveManagerRef.current = null;
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      saveManagerRef.current?.dispose();
    };
  }, [docId, navigate, syncFromDoc, prefetched, readOnly]);

  useEffect(() => {
    const onLeave = () => { void saveManagerRef.current?.flush(true); };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []);

  const markDirty = useCallback(() => {
    if (readOnly) return;
    setDirty(true);
    saveManagerRef.current?.markDirty();
  }, [readOnly]);

  const handleTitleChange = useCallback((t: string) => {
    if (readOnly) return;
    setTitle(t);
    titleRef.current = t;
    if (docRef.current) docRef.current.title = t;
    saveManagerRef.current?.markTitleDirty();
  }, [readOnly]);

  const handleDownloadAs = useCallback((format: DownloadFormat) => {
    const doc = docRef.current;
    if (!doc) return;
    try {
      RichDocExport.export(doc.blocks, titleRef.current, format as RichDocExportFormat);
      if (format === 'pdf') {
        message.info('请在打印对话框中选择「存储为 PDF」');
      } else {
        message.success('已开始下载');
      }
    } catch (err) {
      message.error(`下载失败: ${(err as Error).message}`);
    }
  }, []);

  const applyBlocks = useCallback((next: DocBlock[], recordHistory = false) => {
    const doc = docRef.current;
    if (!doc) return;
    doc.setBlocks(next, recordHistory);
    syncFromDoc(doc, activeIndex);
    markDirty();
  }, [activeIndex, syncFromDoc, markDirty]);

  const handleToolbarStateChange = useCallback((partial: Partial<ToolbarState>, blockIndex: number) => {
    const doc = docRef.current;
    if (!doc) return;
    setToolbarState(doc.getToolbarState(blockIndex, partial));
  }, []);

  const handleToolbarAction = useCallback((action: ToolbarAction, ctx: DocSelectionContext | null) => {
    const doc = docRef.current;
    if (!doc) return;
    const idx = activeIndex;
    const indices = blockIndicesFromCtx(ctx, idx);

    switch (action.type) {
      case 'undo':
        doc.undo();
        syncFromDoc(doc, idx);
        setHistoryRevision(v => v + 1);
        markDirty();
        break;
      case 'redo':
        doc.redo();
        syncFromDoc(doc, idx);
        setHistoryRevision(v => v + 1);
        markDirty();
        break;
      case 'paragraphStyle':
        indices.forEach(i => doc.applyStyleToBlock(i, action.style));
        syncFromDoc(doc, indices[0] ?? idx);
        markDirty();
        break;
      case 'align':
        indices.forEach(i => {
          const block = doc.blocks[i];
          if (isTextBlock(block) && block.type !== 'quote') {
            doc.updateBlock(i, { ...block, align: action.align }, true);
          }
        });
        syncFromDoc(doc, indices[0] ?? idx);
        markDirty();
        break;
      case 'list': {
        if (indices.length > 1) {
          const start = indices[0];
          const end = indices[indices.length - 1];
          const selected = indices.map(i => doc.blocks[i]);
          const listBlock = mergeBlocksToListBlock(selected, action.listType, doc.blocks[start]?.id);
          const next = [...doc.blocks];
          next.splice(start, end - start + 1, listBlock);
          doc.setBlocks(next, true);
        } else {
          doc.toggleList(indices[0] ?? idx, action.listType);
        }
        syncFromDoc(doc, indices[0] ?? idx);
        markDirty();
        break;
      }
      case 'quote':
        indices.forEach(i => doc.toggleQuote(i));
        syncFromDoc(doc, indices[0] ?? idx);
        markDirty();
        break;
      case 'code':
        doc.insertCode(indices[0] ?? idx);
        syncFromDoc(doc, (indices[0] ?? idx) + 1);
        setActiveIndex((indices[0] ?? idx) + 1);
        markDirty();
        break;
      case 'divider':
        doc.insertDivider(indices[0] ?? idx);
        syncFromDoc(doc, indices[0] ?? idx);
        markDirty();
        break;
      case 'image':
        doc.insertImage(indices[0] ?? idx, action.url);
        syncFromDoc(doc, indices[0] ?? idx);
        markDirty();
        break;
      case 'new':
        doc.insertBlock((indices[0] ?? idx) + 1, {
          type: 'paragraph', id: `blk_${Date.now()}`, text: '', marks: [], align: 'left',
        }, true);
        syncFromDoc(doc, (indices[0] ?? idx) + 1);
        setActiveIndex((indices[0] ?? idx) + 1);
        markDirty();
        break;
    }
  }, [activeIndex, syncFromDoc, markDirty]);

  if (loading || !docRef.current) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#666' }}>
        正在加载文档...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {!fullscreen && !embedded && (
        <DocumentBar
          docId={docId || null}
          title={title}
          showTitle={false}
          saveStatus={saveStatus === 'saved' ? 'saved' : saveStatus === 'saving' ? 'saving' : 'unsaved'}
          onTitleChange={handleTitleChange}
          lastModified={lastModified}
          docType="richtext"
          onDownloadAs={handleDownloadAs}
          canEdit={canEdit}
          effectiveViewMode={effectiveViewMode}
          onTogglePreview={onTogglePreview}
        />
      )}
      <RichDocEditor
        documentId={docId || ''}
        title={title}
        blocks={blocks}
        toolbarState={toolbarState}
        outline={outline}
        showOutline={showOutline}
        fullscreen={fullscreen}
        readOnly={readOnly}
        onTitleChange={handleTitleChange}
        onBlocksChange={applyBlocks}
        onToolbarAction={handleToolbarAction}
        onToolbarStateChange={handleToolbarStateChange}
        onToggleOutline={() => setShowOutline(v => !v)}
        onToggleFullscreen={() => setFullscreen(v => !v)}
        onActiveBlockChange={index => {
          setActiveIndex(index);
          activeIndexRef.current = index;
        }}
        historyRevision={historyRevision}
        editorSaveRef={editorSaveRef}
      />
    </div>
  );
};
