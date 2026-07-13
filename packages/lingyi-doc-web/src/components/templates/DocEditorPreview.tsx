import React, { useCallback, useRef, useState } from 'react';
import {
  RichDocument,
  isTextBlock,
  type DocBlock,
  type DocSelectionContext,
  type ToolbarState,
} from '@lingyi-doc/core';
import { RichDocEditor, type ToolbarAction } from '@lingyi-doc/editor';

function blockIndicesFromCtx(ctx: DocSelectionContext | null, fallback: number): number[] {
  if (!ctx) return [fallback];
  const indices: number[] = [];
  for (let i = ctx.startBlock; i <= ctx.endBlock; i++) indices.push(i);
  return indices.length ? indices : [fallback];
}

interface DocEditorPreviewProps {
  title: string;
  blocks: DocBlock[];
}

/** 与 DocEditorPage 使用相同的 RichDocEditor 组件 */
export const DocEditorPreview: React.FC<DocEditorPreviewProps> = ({ title: initialTitle, blocks: initialBlocks }) => {
  const docRef = useRef<RichDocument | null>(null);
  if (!docRef.current) {
    const doc = RichDocument.empty();
    doc.title = initialTitle;
    doc.setBlocks(initialBlocks.map(b => ({ ...b })), false);
    docRef.current = doc;
  }

  const [title, setTitle] = useState(initialTitle);
  const [blocks, setBlocks] = useState<DocBlock[]>(() => [...docRef.current!.blocks]);
  const [toolbarState, setToolbarState] = useState<ToolbarState>(() => docRef.current!.getToolbarState(0));
  const [outline, setOutline] = useState(() => docRef.current!.getOutline());
  const [showOutline, setShowOutline] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [historyRevision, setHistoryRevision] = useState(0);

  const syncFromDoc = useCallback((doc: RichDocument, index?: number) => {
    setBlocks([...doc.blocks]);
    setOutline(doc.getOutline());
    setToolbarState(doc.getToolbarState(index ?? activeIndex));
  }, [activeIndex]);

  const applyBlocks = useCallback((next: DocBlock[], recordHistory = false) => {
    const doc = docRef.current!;
    doc.setBlocks(next, recordHistory);
    syncFromDoc(doc, activeIndex);
    if (recordHistory) setHistoryRevision(v => v + 1);
  }, [activeIndex, syncFromDoc]);

  const handleToolbarStateChange = useCallback((partial: Partial<ToolbarState>, blockIndex: number) => {
    const doc = docRef.current!;
    setToolbarState(doc.getToolbarState(blockIndex, partial));
  }, []);

  const handleToolbarAction = useCallback((action: ToolbarAction, ctx: DocSelectionContext | null) => {
    const doc = docRef.current!;
    const idx = activeIndex;
    const indices = blockIndicesFromCtx(ctx, idx);

    switch (action.type) {
      case 'undo':
        doc.undo();
        syncFromDoc(doc, idx);
        setHistoryRevision(v => v + 1);
        break;
      case 'redo':
        doc.redo();
        syncFromDoc(doc, idx);
        setHistoryRevision(v => v + 1);
        break;
      case 'paragraphStyle':
        indices.forEach(i => doc.applyStyleToBlock(i, action.style));
        syncFromDoc(doc, indices[0] ?? idx);
        break;
      case 'align':
        indices.forEach(i => {
          const block = doc.blocks[i];
          if (isTextBlock(block) && block.type !== 'quote') doc.updateBlock(i, { ...block, align: action.align }, true);
        });
        syncFromDoc(doc, indices[0] ?? idx);
        break;
      case 'list':
        indices.forEach(i => doc.toggleList(i, action.listType, action.orderedStyle));
        syncFromDoc(doc, indices[0] ?? idx);
        break;
      case 'quote':
        indices.forEach(i => doc.toggleQuote(i));
        syncFromDoc(doc, indices[0] ?? idx);
        break;
      case 'code':
        doc.insertCode(indices[0] ?? idx);
        syncFromDoc(doc, (indices[0] ?? idx) + 1);
        setActiveIndex((indices[0] ?? idx) + 1);
        break;
      case 'divider':
        doc.insertDivider(indices[0] ?? idx);
        syncFromDoc(doc, indices[0] ?? idx);
        break;
      case 'image':
        doc.insertImage(indices[0] ?? idx, action.url);
        syncFromDoc(doc, indices[0] ?? idx);
        break;
      case 'new':
        doc.insertBlock((indices[0] ?? idx) + 1, {
          type: 'paragraph', id: `blk_${Date.now()}`, text: '', marks: [], align: 'left',
        }, true);
        syncFromDoc(doc, (indices[0] ?? idx) + 1);
        setActiveIndex((indices[0] ?? idx) + 1);
        break;
      default:
        break;
    }
  }, [activeIndex, syncFromDoc]);

  return (
    <div style={{ height: '100%', minHeight: 360, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <RichDocEditor
        documentId="template-preview"
        title={title}
        blocks={blocks}
        toolbarState={toolbarState}
        outline={outline}
        showOutline={showOutline}
        fullscreen={fullscreen}
        onTitleChange={setTitle}
        onBlocksChange={applyBlocks}
        onToolbarAction={handleToolbarAction}
        onToolbarStateChange={handleToolbarStateChange}
        onToggleOutline={() => setShowOutline(v => !v)}
        onToggleFullscreen={() => setFullscreen(v => !v)}
        onActiveBlockChange={setActiveIndex}
        historyRevision={historyRevision}
      />
    </div>
  );
};
