import { useCallback } from 'react';
import type { DocBlock, ImageBlock, TextMark } from '@lingyi-doc/core-doc';
import {
  isTextBlock,
  splitMarks,
  stripLeadingNewlines,
  parseOrderedListMarkdownLine,
  parseBulletListMarkdownLine,
  textToListItems,
  createEmptyParagraph,
  genBlockId,
} from '@lingyi-doc/core-doc';
import type { ToolbarAction } from '../RichDocEditor';

interface BlockOpsDeps {
  readOnly: boolean;
  blocksRef: React.MutableRefObject<DocBlock[]>;
  typingHistoryRef: React.MutableRefObject<boolean>;
  typingTimerRef: React.MutableRefObject<number | null>;
  pasteDomSyncBlockIdRef: React.MutableRefObject<string | null>;
  onBlocksChange: (blocks: DocBlock[], recordHistory?: boolean) => void;
  keepImageSelected: (idx: number) => void;
  keepCodeSelected: (idx: number) => void;
  keepTableSelected: (idx: number) => void;
  keepBaseSelected: (idx: number) => void;
  keepWhiteboardSelected: (idx: number) => void;
  setDocSelection: (sel: any) => void;
}

export function useEditorBlockOperations(deps: BlockOpsDeps) {
  const {
    readOnly,
    blocksRef,
    typingHistoryRef,
    typingTimerRef,
    pasteDomSyncBlockIdRef,
    onBlocksChange,
    keepImageSelected,
    keepCodeSelected,
    keepTableSelected,
    keepBaseSelected,
    keepWhiteboardSelected,
    setDocSelection,
  } = deps;

  const handleBlockChange = useCallback((index: number, block: DocBlock, recordHistory = false) => {
    if (readOnly) return;
    if (pasteDomSyncBlockIdRef.current === block.id) return;
    if (block.type === 'paragraph') {
      const orderedMd = parseOrderedListMarkdownLine(block.text);
      if (orderedMd) {
        block = {
          type: 'list',
          id: block.id,
          listType: 'ordered',
          items: textToListItems(orderedMd.content, block.marks, 'ordered'),
        };
        recordHistory = true;
      } else {
        const bulletMd = parseBulletListMarkdownLine(block.text);
        if (bulletMd) {
          block = {
            type: 'list',
            id: block.id,
            listType: 'bullet',
            items: textToListItems(bulletMd.content, block.marks, 'bullet'),
          };
          recordHistory = true;
        }
      }
    }

    let shouldRecord = recordHistory;
    if (!shouldRecord) {
      const isTyping = isTextBlock(block) || block.type === 'list' || block.type === 'code' || block.type === 'mermaid';
      if (isTyping) {
        if (!typingHistoryRef.current) {
          shouldRecord = true;
          typingHistoryRef.current = true;
        }
        if (typingTimerRef.current != null) window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = window.setTimeout(() => {
          typingHistoryRef.current = false;
          typingTimerRef.current = null;
        }, 800);
      }
    } else {
      typingHistoryRef.current = false;
      if (typingTimerRef.current != null) {
        window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    }

    const next = [...blocksRef.current];
    next[index] = block;
    if (block.type === 'image') keepImageSelected(index);
    if (block.type === 'code' || block.type === 'mermaid') keepCodeSelected(index);
    if (block.type === 'table') keepTableSelected(index);
    if (block.type === 'base') keepBaseSelected(index);
    if (block.type === 'whiteboard') keepWhiteboardSelected(index);
    onBlocksChange(next, shouldRecord);
  }, [onBlocksChange, keepImageSelected, keepCodeSelected, keepTableSelected, keepBaseSelected, keepWhiteboardSelected, readOnly]);

  const handleImagePatch = useCallback((index: number, patch: Partial<ImageBlock>, recordHistory = true) => {
    const current = blocksRef.current[index];
    if (!current || current.type !== 'image') return;
    const next = [...blocksRef.current];
    next[index] = { ...current, ...patch };
    onBlocksChange(next, recordHistory);
    keepImageSelected(index);
  }, [onBlocksChange, keepImageSelected]);

  const handleEnter = useCallback((index: number, cursorOffset: number, fullText: string, domMarks: TextMark[]) => {
    const block = blocksRef.current[index];
    if (!isTextBlock(block)) return;
    setDocSelection(null);

    const before = fullText.slice(0, cursorOffset);
    const afterRaw = fullText.slice(cursorOffset);
    const [marksBefore, marksAfterRaw] = splitMarks(domMarks, cursorOffset);
    const { text: after, marks: marksAfter } = stripLeadingNewlines(afterRaw, marksAfterRaw);

    const updatedCurrent = { ...block, text: before, marks: trimMarks(marksBefore, before.length) };
    let newBlock: DocBlock;
    const inheritIndent = {
      firstLineIndent: block.firstLineIndent,
      indentLevel: block.indentLevel,
    };
    if (block.type === 'heading') {
      newBlock = {
        ...createEmptyParagraph(), text: after, marks: trimMarks(marksAfter, after.length),
        align: block.align, ...inheritIndent,
      };
    } else if (block.type === 'quote') {
      newBlock = after
        ? { type: 'quote' as const, id: genBlockId(), text: after, marks: trimMarks(marksAfter, after.length), ...inheritIndent }
        : createEmptyParagraph();
    } else {
      newBlock = {
        ...createEmptyParagraph(), text: after, marks: trimMarks(marksAfter, after.length),
        align: block.align, ...inheritIndent,
      };
    }

    const next = [...blocksRef.current];
    next[index] = updatedCurrent;
    next.splice(index + 1, 0, newBlock);
    blocksRef.current = next;
    // Note: scheduleCaret and onActiveBlockChange need to be passed or handled externally
  }, [setDocSelection]);

  return { handleBlockChange, handleImagePatch, handleEnter };
}

function trimMarks(marks: TextMark[], len: number): TextMark[] {
  return marks.filter(m => m.start < len && m.end > 0).map(m => ({
    ...m, start: Math.max(0, m.start), end: Math.min(len, m.end),
  }));
}
