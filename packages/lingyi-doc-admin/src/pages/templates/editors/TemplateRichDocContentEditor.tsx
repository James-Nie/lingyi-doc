import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { isTextBlock } from '@lingyi-doc/core';
import { RichDocEditor } from '@lingyi-doc/editor-doc';
import { richDocFromContent } from '../templateContentUtils';
import type { TemplateContentEditorHandle } from './TemplateContentEditorHandle';

export type { TemplateContentEditorHandle };

type RichDocModel = ReturnType<typeof richDocFromContent>;
type DocBlock = RichDocModel['blocks'][number];
type ToolbarState = ReturnType<RichDocModel['getToolbarState']>;

type TemplateToolbarAction =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'paragraphStyle'; style: 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6' }
  | { type: 'fontSize'; size: number }
  | { type: 'inline'; cmd: 'bold' | 'italic' | 'underline' | 'strikethrough' }
  | { type: 'color'; color: string }
  | { type: 'background'; color: string }
  | { type: 'align'; align: 'left' | 'center' | 'right' }
  | { type: 'list'; listType: 'bullet' | 'ordered'; orderedStyle?: 'multiLevel' | 'chinese' | 'hierarchical' }
  | { type: 'quote' }
  | { type: 'code' }
  | { type: 'divider' }
  | { type: 'link' }
  | { type: 'image'; url: string; width?: number }
  | { type: 'new' }
  | { type: 'indent'; direction: 'increase' | 'decrease' };

interface Props {
  documentTitle: string;
  contentJson: unknown | null;
  previewMode?: boolean;
}

function blockIndicesFromCtx(ctx: { startBlock: number; endBlock: number } | null, fallback: number): number[] {
  if (!ctx) return [fallback];
  const indices: number[] = [];
  for (let i = ctx.startBlock; i <= ctx.endBlock; i++) indices.push(i);
  return indices.length ? indices : [fallback];
}

export const TemplateRichDocContentEditor = forwardRef<TemplateContentEditorHandle, Props>(
  function TemplateRichDocContentEditor({ documentTitle, contentJson, previewMode = false }, ref) {
    const docRef = useRef<ReturnType<typeof richDocFromContent> | null>(null);
    if (!docRef.current) {
      docRef.current = richDocFromContent(contentJson, documentTitle);
    }

    const [title, setTitle] = useState(documentTitle);
    const [blocks, setBlocks] = useState<DocBlock[]>(() => [...docRef.current!.blocks]);
    const [toolbarState, setToolbarState] = useState<ToolbarState>(() => docRef.current!.getToolbarState(0));
    const [outline, setOutline] = useState(() => docRef.current!.getOutline());
    const [showOutline, setShowOutline] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const [historyRevision, setHistoryRevision] = useState(0);

    useImperativeHandle(ref, () => ({
      getContentJson: (): unknown => {
        const doc = docRef.current!;
        doc.title = title;
        return doc.toJSON();
      },
    }), [title]);

    const syncFromDoc = useCallback((doc: ReturnType<typeof richDocFromContent>, index?: number) => {
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

    const handleToolbarAction = useCallback((action: TemplateToolbarAction, ctx: { startBlock: number; endBlock: number } | null) => {
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
            if (isTextBlock(block) && block.type !== 'quote') {
              doc.updateBlock(i, { ...block, align: action.align }, true);
            }
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
      <div style={{
        height: 'calc(100vh - 220px)',
        minHeight: 480,
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#fff',
      }}
      >
        <RichDocEditor
          readOnly={previewMode}
          documentId={previewMode ? 'template-content-preview' : 'template-content-edit'}
          title={title}
          blocks={blocks}
          toolbarState={toolbarState}
          outline={outline}
          showOutline={showOutline}
          fullscreen={fullscreen}
          onTitleChange={previewMode ? () => {} : setTitle}
          onBlocksChange={previewMode ? () => {} : applyBlocks}
          onToolbarAction={previewMode ? () => {} : handleToolbarAction}
          onToolbarStateChange={previewMode ? () => {} : (partial: Partial<ToolbarState>, blockIndex: number) => {
            setToolbarState(docRef.current!.getToolbarState(blockIndex, partial));
          }}
          onToggleOutline={previewMode ? () => {} : () => setShowOutline(v => !v)}
          onToggleFullscreen={previewMode ? () => {} : () => setFullscreen(v => !v)}
          onActiveBlockChange={previewMode ? () => {} : setActiveIndex}
          historyRevision={historyRevision}
        />
      </div>
    );
  },
);
