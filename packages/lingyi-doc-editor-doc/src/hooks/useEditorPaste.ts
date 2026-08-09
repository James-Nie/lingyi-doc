import { useCallback, useEffect } from 'react';
import { flushSync } from 'react-dom';
import type { DocBlock, DocSelection, DocAnchor, TextMark, PendingCaretSpec, NativeTextSelectionDetail, TextSelectionSlice, DocCopyPayload } from '@lingyi-doc/core-doc';
import {
  isTextBlock,
  cloneDocBlock,
  parseMarkdownToBlocks,
  spliceMarkdownBlocks,
  parseMarkdownTable,
  markdownTableDataToTableBlock,
  insertTableBlockAt,
  blocksToCellContent,
  spliceMarkdownIntoCellContent,
  applyMarkdownTableToTableBlock,
  deleteDocSelectionBlocks,
  replaceDocSelectionWithText,
  resolveEditableDocSelection,
  isCrossBlockEditableSelection,
  resolveEditablePasteContext,
  getNativeTextSelectionDetail,
  selectionSlicesToAnchors,
  normalizePasteText,
  insertTextWithMarks,
  extractContentFromEditable,
  setCaretOffset,
  getCaretOffset,
  getClipboardTextFromDataTransfer,
  resolveDocCopyPayload,
  writeDocCopyToClipboard,
  parseClipboardDocBlocks,
  parseHtmlClipboardToBlocks,
  saveSelection,
  restoreSelection,
  selectElementContents,
  findBlockIndexFromNode,
  findEditableRoot,
  getSelectionBlockRange,
  parseTableCellCoords,
  getListCaretContext,
  extractListItemsFromDom,
  extractPlainText,
  pendingCaretFromBoundary,
  marksToHtml,
  buildPendingCaret,
  isCollapsedDocSelection,
  getSelectionBlockIndices,
} from '@lingyi-doc/core-doc';
import { handleEditablePasteEvent, handlePasteKeyboardEvent, findDocPasteEditable, type MarkdownPasteContext } from '../markdownPaste';
import { getImageFileFromClipboard, getImageFileFromClipboardAsync, prepareImageFileForInsert, type InsertImagePayload } from '@lingyi-doc/editor-shared';

interface PasteDeps {
  readOnly: boolean;
  blocksRef: React.MutableRefObject<DocBlock[]>;
  blockRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  editorRef: React.MutableRefObject<HTMLDivElement | null>;
  activeIndexRef: React.MutableRefObject<number>;
  docSelectionRef: React.MutableRefObject<DocSelection | null>;
  savedTextSelectionRef: React.MutableRefObject<NativeTextSelectionDetail | null>;
  skipSelectionClearRef: React.MutableRefObject<boolean>;
  pasteCaretGuardUntilRef: React.MutableRefObject<number>;
  pasteDomSyncBlockIdRef: React.MutableRefObject<string | null>;
  pendingPasteTextRef: React.MutableRefObject<string>;
  pendingPasteContextRef: React.MutableRefObject<MarkdownPasteContext | null>;
  lastDocCopyPayloadRef: React.MutableRefObject<DocCopyPayload | null>;
  lastDocPasteHandledAtRef: React.MutableRefObject<number>;
  capturePasteContextRefFn: React.MutableRefObject<(text: string) => void>;
  pastePlainTextRefFn: React.MutableRefObject<(text: string, editable: HTMLElement) => void>;
  pasteDocBlocksRefFn: React.MutableRefObject<(blocks: DocBlock[], editable: HTMLElement) => void>;
  setDocSelection: (sel: DocSelection | null) => void;
  setActiveIndex: (idx: number) => void;
  onActiveBlockChange: (idx: number) => void;
  onBlocksChange: (blocks: DocBlock[], recordHistory?: boolean) => void;
  scheduleCaret: (spec: PendingCaretSpec, blocksOverride?: DocBlock[]) => import('@lingyi-doc/core-doc').PendingCaret | null;
  queuePendingCaretFallback: (pending: import('@lingyi-doc/core-doc').PendingCaret) => void;
  armPasteCaretGuard: () => void;
  restoreCaretInEditable: (el: HTMLElement, offset: number) => void;
  resolveActiveDocSelection: () => DocSelection | null;
  clearActiveDocSelection: () => void;
  hasActiveDocSelection: () => boolean;
  keepTableSelected: (idx: number) => void;
  focusAfterTableInsert: (next: DocBlock[], tableIdx: number) => void;
  handleInsertImage: (payload: InsertImagePayload) => void;
  pendingMarkdown: string;
  setPendingMarkdown: (md: string | ((prev: string) => string)) => void;
  setMarkdownDialogOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  selectedImageIndexRef: React.MutableRefObject<number | null>;
  selectedTableIndexRef: React.MutableRefObject<number | null>;
  selectedBaseIndexRef: React.MutableRefObject<number | null>;
  handleDeleteBlock: (index: number) => void;
  handleDeleteDocSelection: () => void;
  setSelectedImageIndex: (idx: number | null) => void;
  setSelectedTableIndex: (idx: number | null) => void;
  setSelectedBaseIndex: (idx: number | null) => void;
  setSelectedWhiteboardIndex: (idx: number | null) => void;
  setSelectedCodeIndex: (idx: number | null) => void;
}

export function useEditorPaste(deps: PasteDeps) {
  const {
    readOnly,
    blocksRef,
    blockRefs,
    editorRef,
    activeIndexRef,
    docSelectionRef,
    savedTextSelectionRef,
    skipSelectionClearRef,
    pasteCaretGuardUntilRef,
    pasteDomSyncBlockIdRef,
    pendingPasteTextRef,
    pendingPasteContextRef,
    lastDocCopyPayloadRef,
    lastDocPasteHandledAtRef,
    capturePasteContextRefFn,
    pastePlainTextRefFn,
    pasteDocBlocksRefFn,
    setDocSelection,
    setActiveIndex,
    onActiveBlockChange,
    onBlocksChange,
    scheduleCaret,
    queuePendingCaretFallback,
    armPasteCaretGuard,
    restoreCaretInEditable,
    resolveActiveDocSelection,
    clearActiveDocSelection,
    hasActiveDocSelection,
    keepTableSelected,
    focusAfterTableInsert,
    handleInsertImage,
    pendingMarkdown,
    setPendingMarkdown,
    setMarkdownDialogOpen,
    selectedImageIndexRef,
    selectedTableIndexRef,
    selectedBaseIndexRef,
    handleDeleteBlock,
    handleDeleteDocSelection,
    setSelectedImageIndex,
    setSelectedTableIndex,
    setSelectedBaseIndex,
    setSelectedWhiteboardIndex,
    setSelectedCodeIndex,
  } = deps;

  const markDocPasteHandled = useCallback((): boolean => {
    const now = Date.now();
    if (now - lastDocPasteHandledAtRef.current < 200) return false;
    lastDocPasteHandledAtRef.current = now;
    return true;
  }, [lastDocPasteHandledAtRef]);

  const commitTextBlockPaste = useCallback((
    next: DocBlock[],
    blockIndex: number,
    caretPos: number,
    targetEditable?: HTMLElement | null,
    recordHistory = true,
  ) => {
    const block = next[blockIndex];
    if (!block || !isTextBlock(block)) return;

    armPasteCaretGuard();
    scheduleCaret({ blockIndex, position: caretPos }, next);
    blocksRef.current = next;

    flushSync(() => {
      setActiveIndex(blockIndex);
      onActiveBlockChange(blockIndex);
      onBlocksChange(next, recordHistory);
    });

    savedTextSelectionRef.current = null;

    const el = blockRefs.current.get(block.id) ?? targetEditable ?? null;
    if (el?.isConnected) {
      restoreCaretInEditable(el, caretPos);
      requestAnimationFrame(() => restoreCaretInEditable(el, caretPos));
      setTimeout(() => restoreCaretInEditable(el, caretPos), 0);
    }
  }, [onBlocksChange, onActiveBlockChange, scheduleCaret, armPasteCaretGuard, restoreCaretInEditable, blocksRef, blockRefs, savedTextSelectionRef]);

  const replaceActiveSelectionWithText = useCallback((text: string) => {
    const sel = resolveActiveDocSelection();
    if (!sel) return false;
    const result = replaceDocSelectionWithText(blocksRef.current, sel, text);
    if (!result) return false;
    clearActiveDocSelection();
    const target = result.blocks[result.caretBlockIndex];
    if (target && isTextBlock(target)) {
      commitTextBlockPaste(result.blocks, result.caretBlockIndex, result.caretOffset, null, true);
      return true;
    }
    if (target?.type === 'list' && result.caretListItemIndex != null) {
      armPasteCaretGuard();
      scheduleCaret({
        blockIndex: result.caretBlockIndex,
        position: result.caretOffset,
        listItemIndex: result.caretListItemIndex,
      }, result.blocks);
      blocksRef.current = result.blocks;
      flushSync(() => {
        setActiveIndex(result.caretBlockIndex);
        onActiveBlockChange(result.caretBlockIndex);
        onBlocksChange(result.blocks, true);
      });
      savedTextSelectionRef.current = null;
      return true;
    }
    armPasteCaretGuard();
    scheduleCaret({ blockIndex: result.caretBlockIndex, position: result.caretOffset }, result.blocks);
    blocksRef.current = result.blocks;
    flushSync(() => {
      setActiveIndex(result.caretBlockIndex);
      onActiveBlockChange(result.caretBlockIndex);
      onBlocksChange(result.blocks, true);
    });
    return true;
  }, [onBlocksChange, onActiveBlockChange, scheduleCaret, commitTextBlockPaste, armPasteCaretGuard, resolveActiveDocSelection, clearActiveDocSelection, blocksRef, savedTextSelectionRef]);

  const insertPlainTextAtCursor = useCallback((
    text: string,
    ctx?: MarkdownPasteContext | null,
    targetEditable?: HTMLElement | null,
  ) => {
    const normalized = normalizePasteText(text);
    if (!normalized) return;

    if (replaceActiveSelectionWithText(normalized)) return;

    const liveDetail = getNativeTextSelectionDetail(blocksRef.current, blockRefs.current);
    if (liveDetail && !liveDetail.collapsed && liveDetail.slices.length) {
      const anchors = selectionSlicesToAnchors(liveDetail.slices);
      if (anchors) {
        const result = replaceDocSelectionWithText(
          blocksRef.current,
          { anchor: anchors.anchor, focus: anchors.focus },
          normalized,
        );
        if (result) {
          savedTextSelectionRef.current = null;
          const idx = result.caretBlockIndex;
          const targetBlock = result.blocks[idx];
          if (targetBlock && isTextBlock(targetBlock)) {
            commitTextBlockPaste(result.blocks, idx, result.caretOffset, targetEditable);
            return;
          }
          const spec = result.caretListItemIndex != null
            ? { blockIndex: idx, position: result.caretOffset, listItemIndex: result.caretListItemIndex }
            : { blockIndex: idx, position: result.caretOffset };
          armPasteCaretGuard();
          blocksRef.current = result.blocks;
          const pending = scheduleCaret(spec, result.blocks);
          flushSync(() => {
            setActiveIndex(idx);
            onActiveBlockChange(idx);
            onBlocksChange(result.blocks, false);
          });
          if (pending) queuePendingCaretFallback(pending);
          return;
        }
      }
    }

    if (!ctx) return;

    const idx = ctx.blockIndex;
    const block = blocksRef.current[idx];
    if (!block) return;

    const lo = Math.max(0, Math.min(ctx.offset, ctx.currentText.length));
    const { text: newText, marks: newMarks } = insertTextWithMarks(
      ctx.currentText, ctx.currentMarks, lo, normalized,
    );
    const caretPos = lo + normalized.length;

    if (ctx.tableCell && block.type === 'table') {
      const { row, col } = ctx.tableCell;
      const cells = block.cells.map((r, ri) =>
        r.map((c, ci) => (ri === row && ci === col ? { ...c, text: newText, marks: newMarks } : c)),
      );
      const next = [...blocksRef.current];
      next[idx] = { ...block, cells };
      blocksRef.current = next;
      scheduleCaret({ blockIndex: idx, position: caretPos, tableCell: { row, col } }, next);
      setActiveIndex(idx);
      onActiveBlockChange(idx);
      onBlocksChange(next, true);
      savedTextSelectionRef.current = null;
      skipSelectionClearRef.current = true;
      return;
    }

    if (isTextBlock(block)) {
      const next = [...blocksRef.current];
      next[idx] = { ...block, text: newText, marks: newMarks };
      commitTextBlockPaste(next, idx, caretPos, targetEditable);
      return;
    }

    if (block.type === 'list' && ctx.listItemIndex != null) {
      const items = block.items.map((it, i) =>
        i === ctx.listItemIndex ? { ...it, text: newText, marks: newMarks } : it,
      );
      const next = [...blocksRef.current];
      next[idx] = { ...block, items };
      blocksRef.current = next;
      scheduleCaret({ blockIndex: idx, position: caretPos, listItemIndex: ctx.listItemIndex }, next);
      setActiveIndex(idx);
      onActiveBlockChange(idx);
      onBlocksChange(next, true);
      savedTextSelectionRef.current = null;
      skipSelectionClearRef.current = true;
    }
  }, [onBlocksChange, onActiveBlockChange, replaceActiveSelectionWithText, scheduleCaret, commitTextBlockPaste, armPasteCaretGuard, queuePendingCaretFallback, blocksRef, blockRefs, savedTextSelectionRef, skipSelectionClearRef]);

  const applyMarkdownPaste = useCallback(() => {
    const raw = pendingMarkdown || pendingPasteTextRef.current;
    const ctx = pendingPasteContextRef.current;
    if (!raw) return;

    let blockIndex = ctx?.blockIndex ?? activeIndexRef.current;
    let pasteCtx = ctx;
    let baseBlocks = blocksRef.current;

    const activeSel = resolveActiveDocSelection();
    if (activeSel) {
      const deleted = deleteDocSelectionBlocks(baseBlocks, activeSel);
      if (deleted) {
        clearActiveDocSelection();
        baseBlocks = deleted.blocks;
        blockIndex = deleted.caretBlockIndex;
        const block = baseBlocks[blockIndex];
        pasteCtx = block && isTextBlock(block)
          ? { blockIndex, offset: deleted.caretOffset, currentText: block.text, currentMarks: block.marks }
          : ctx;
      }
    }

    const block = baseBlocks[blockIndex];
    const tableData = parseMarkdownTable(raw);

    let next: DocBlock[];

    if (tableData) {
      if (ctx?.tableCell && block?.type === 'table') {
        const { row, col } = ctx.tableCell;
        next = [...blocksRef.current];
        next[blockIndex] = applyMarkdownTableToTableBlock(block, row, col, tableData);
      } else {
        const tableBlock = markdownTableDataToTableBlock(tableData);
        next = insertTableBlockAt(
          baseBlocks, blockIndex,
          pasteCtx?.offset ?? 0,
          pasteCtx?.currentText ?? '',
          pasteCtx?.currentMarks ?? [],
          tableBlock,
        );
      }
    } else {
      const parsed = parseMarkdownToBlocks(raw);
      if (!parsed.length) return;

      if (ctx?.tableCell && block?.type === 'table') {
        const { row, col } = ctx.tableCell;
        const insert = blocksToCellContent(parsed);
        const merged = spliceMarkdownIntoCellContent(ctx.offset, ctx.currentText, ctx.currentMarks, insert);
        const cells = block.cells.map((r, ri) =>
          r.map((c, ci) => (ri === row && ci === col ? { ...c, text: merged.text, marks: merged.marks } : c)),
        );
        next = [...blocksRef.current];
        next[blockIndex] = { ...block, cells };
      } else if (block?.type === 'code' || block?.type === 'mermaid') {
        next = [...blocksRef.current];
        next.splice(blockIndex + 1, 0, ...parsed);
      } else if (ctx && block?.type === 'list' && !ctx.currentText.trim()) {
        next = [...blocksRef.current];
        next.splice(blockIndex, 1, ...parsed);
      } else if (pasteCtx && block && isTextBlock(block)) {
        next = spliceMarkdownBlocks(baseBlocks, pasteCtx.blockIndex, pasteCtx.offset, pasteCtx.currentText, pasteCtx.currentMarks, parsed);
      } else {
        next = spliceMarkdownBlocks(baseBlocks, blockIndex, pasteCtx?.offset ?? 0, pasteCtx?.currentText ?? '', pasteCtx?.currentMarks ?? [], parsed);
      }
    }

    const focusIdx = (() => {
      if (tableData) {
        if (ctx?.tableCell && block?.type === 'table') return blockIndex;
        const idx = next.findIndex((b, i) => b.type === 'table' && i >= blockIndex);
        return idx >= 0 ? idx : blockIndex;
      }
      if (ctx?.tableCell && block?.type === 'table') return blockIndex;
      if (block?.type === 'code' || block?.type === 'mermaid') return blockIndex + 1;
      if (ctx && block && isTextBlock(block) && ctx.currentText.slice(0, ctx.offset)) {
        return blockIndex + 1;
      }
      return blockIndex;
    })();

    const insertedTable = next[focusIdx]?.type === 'table';
    if (ctx?.tableCell && block?.type === 'table') {
      keepTableSelected(blockIndex);
    } else if (insertedTable) {
      focusAfterTableInsert(next, focusIdx);
    } else {
      setActiveIndex(focusIdx);
      onActiveBlockChange(focusIdx);
      const focusBlock = next[focusIdx];
      if (focusBlock && isTextBlock(focusBlock)) {
        scheduleCaret({ blockIndex: focusIdx, position: focusBlock.text.length }, next);
      } else if (focusBlock?.type === 'list') {
        scheduleCaret({ blockIndex: focusIdx, position: 'end', listItemIndex: Math.max(0, focusBlock.items.length - 1) }, next);
      } else {
        scheduleCaret({ blockIndex: focusIdx, position: 'start' }, next);
      }
    }

    onBlocksChange(next, true);

    pendingPasteTextRef.current = '';
    pendingPasteContextRef.current = null;
    setPendingMarkdown('');
    setMarkdownDialogOpen(false);

    if (!insertedTable && !(ctx?.tableCell && block?.type === 'table')) {
      const focusBlock = next[focusIdx];
      if (focusBlock?.type === 'code' || focusBlock?.type === 'mermaid') {
        setTimeout(() => blockRefs.current.get(focusBlock.id)?.focus(), 0);
        return;
      }
    }

    if (ctx?.tableCell && block?.type === 'table') {
      setTimeout(() => {
        const { row, col } = ctx.tableCell!;
        const updated = next[blockIndex];
        if (updated?.type !== 'table') return;
        const cell = updated.cells[row]?.[col];
        const tableRoot = blockRefs.current.get(updated.id);
        const cellEl = tableRoot?.querySelector(`[data-table-cell="${row}-${col}"]`) as HTMLElement | null;
        if (cell && cellEl) {
          cellEl.innerHTML = marksToHtml(cell.text, cell.marks) || '';
          cellEl.focus();
          setCaretOffset(cellEl, cell.text.length);
        }
      }, 0);
    }
  }, [pendingMarkdown, onBlocksChange, onActiveBlockChange, keepTableSelected, focusAfterTableInsert, scheduleCaret]);

  const dismissMarkdownPaste = useCallback(() => {
    const raw = pendingMarkdown || pendingPasteTextRef.current;
    const ctx = pendingPasteContextRef.current;
    pendingPasteTextRef.current = '';
    pendingPasteContextRef.current = null;
    setPendingMarkdown('');
    setMarkdownDialogOpen(false);
    if (raw) {
      insertPlainTextAtCursor(raw, ctx ?? undefined);
    }
  }, [pendingMarkdown, insertPlainTextAtCursor]);

  const pasteDocBlocksAtEditable = useCallback((
    parsed: DocBlock[],
    editable: HTMLElement,
    options?: { skipDedup?: boolean },
  ) => {
    // Simplified version - markDocPasteHandled check moved to main file for ref access
    if (!parsed.length) return;

    let baseBlocks = [...blocksRef.current];
    let pasteIdx = activeIndexRef.current;
    let pasteOffset = 0;
    let pasteText = '';
    let pasteMarks: TextMark[] = [];
    let pasteListItemIndex: number | undefined;

    const activeSel = resolveActiveDocSelection();
    if (activeSel) {
      const deleted = deleteDocSelectionBlocks(baseBlocks, activeSel);
      if (deleted) {
        clearActiveDocSelection();
        baseBlocks = deleted.blocks;
        pasteIdx = deleted.caretBlockIndex;
        pasteOffset = deleted.caretOffset;
        pasteListItemIndex = deleted.caretListItemIndex;
        const mergedBlock = baseBlocks[pasteIdx];
        if (mergedBlock && isTextBlock(mergedBlock)) {
          pasteText = mergedBlock.text;
          pasteMarks = mergedBlock.marks;
        } else if (mergedBlock?.type === 'list' && pasteListItemIndex != null) {
          const item = mergedBlock.items[pasteListItemIndex];
          pasteText = item?.text ?? '';
          pasteMarks = item?.marks ?? [];
        }
      }
    } else {
      const ctx = resolveEditablePasteContext(editable, baseBlocks);
      if (!ctx) return;
      pasteIdx = ctx.blockIndex;
      pasteOffset = ctx.offset;
      pasteText = ctx.currentText;
      pasteMarks = ctx.currentMarks;
      pasteListItemIndex = ctx.listItemIndex;
    }

    let next: DocBlock[];
    const pasteBlock = baseBlocks[pasteIdx];

    if (pasteBlock?.type === 'list' && pasteListItemIndex != null && !pasteText.trim()) {
      next = [...baseBlocks];
      next.splice(pasteIdx, 1, ...parsed);
    } else if (pasteBlock && isTextBlock(pasteBlock)) {
      next = spliceMarkdownBlocks(baseBlocks, pasteIdx, pasteOffset, pasteText, pasteMarks, parsed);
    } else {
      next = spliceMarkdownBlocks(baseBlocks, pasteIdx, pasteOffset, pasteText, pasteMarks, parsed);
    }

    const focusIdx = (() => {
      const idx = next.findIndex((b, i) => i >= pasteIdx && (b.type === 'list' || isTextBlock(b)));
      if (idx >= 0) return idx;
      return Math.min(pasteIdx, next.length - 1);
    })();

    const focusBlock = next[focusIdx];
    armPasteCaretGuard();
    blocksRef.current = next;

    flushSync(() => {
      setActiveIndex(focusIdx);
      onActiveBlockChange(focusIdx);
      onBlocksChange(next, true);
    });

    if (focusBlock?.type === 'list') {
      scheduleCaret({ blockIndex: focusIdx, position: 'start', listItemIndex: 0 }, next);
    } else if (focusBlock && isTextBlock(focusBlock)) {
      const pastedBlock = parsed[0];
      const caretPos = parsed.length === 1 && pastedBlock && isTextBlock(pastedBlock) && pastedBlock.type === focusBlock.type && pastedBlock.type !== 'paragraph'
        ? pastedBlock.text.length
        : focusBlock.text.length;
      scheduleCaret({ blockIndex: focusIdx, position: caretPos }, next);
      const el = blockRefs.current.get(focusBlock.id) ?? editable;
      requestAnimationFrame(() => restoreCaretInEditable(el, caretPos));
    }
  }, [onBlocksChange, onActiveBlockChange, scheduleCaret, armPasteCaretGuard, restoreCaretInEditable, resolveActiveDocSelection, clearActiveDocSelection, blocksRef, blockRefs, activeIndexRef]);

  const getFallbackPasteEditable = useCallback((): HTMLElement | null => {
    const sel = resolveActiveDocSelection();
    if (sel) {
      const indices = getSelectionBlockIndices(sel, blocksRef.current);
      const idx = indices?.[0] ?? activeIndexRef.current;
      const block = blocksRef.current[idx];
      if (block) {
        const root = blockRefs.current.get(block.id);
        if (!root) return null;
        if (root.dataset.docEditable !== undefined) return root;
        if (root.dataset.listRoot !== undefined) return root;
        return root.querySelector('[data-doc-editable]') as HTMLElement | null;
      }
    }
    return null;
  }, [resolveActiveDocSelection]);

  const resolvePasteBlocks = useCallback((
    dt: DataTransfer | null | undefined,
    text?: string,
  ): DocBlock[] | null => {
    const fromClipboard = parseClipboardDocBlocks(dt);
    if (fromClipboard?.length) return fromClipboard;

    const cached = lastDocCopyPayloadRef.current;
    if (!cached?.blocks.length) return null;

    const incoming = text ? normalizePasteText(text).trim() : '';
    const cachedPlain = normalizePasteText(cached.plainText).trim();
    if (!incoming || incoming === cachedPlain) {
      return cached.blocks.map(block => cloneDocBlock(block));
    }
    return null;
  }, []);

  const pastePlainTextAtEditable = useCallback((text: string, editable: HTMLElement) => {
    const normalized = normalizePasteText(text);
    if (!normalized) return;

    const cachedBlocks = resolvePasteBlocks(null, normalized);
    if (cachedBlocks?.length) {
      pasteDocBlocksAtEditable(cachedBlocks, editable, { skipDedup: true });
      return;
    }

    if (replaceActiveSelectionWithText(normalized)) return;

    if (isCrossBlockEditableSelection(blocksRef.current, blockRefs.current, docSelectionRef.current, savedTextSelectionRef.current)) {
      insertPlainTextAtCursor(normalized, null, editable);
      return;
    }

    const ctx = resolveEditablePasteContext(editable, blocksRef.current);
    if (!ctx) return;

    const block = blocksRef.current[ctx.blockIndex];
    if (!block) return;

    if (isTextBlock(block) && editable.dataset.docEditable !== undefined && editable.dataset.listRoot === undefined) {
      armPasteCaretGuard();

      const sel = window.getSelection();
      const hasLiveRange = !!(
        sel && sel.rangeCount > 0 && !sel.isCollapsed
        && sel.anchorNode && sel.focusNode
        && editable.contains(sel.anchorNode) && editable.contains(sel.focusNode)
      );

      editable.focus({ preventScroll: true });
      if (!hasLiveRange) {
        setCaretOffset(editable, ctx.offset);
      }

      pasteDomSyncBlockIdRef.current = block.id;
      const inserted = document.execCommand('insertText', false, normalized);
      if (!inserted) {
        pasteDomSyncBlockIdRef.current = null;
        insertPlainTextAtCursor(normalized, ctx, editable);
        return;
      }

      const { text: newText, marks: newMarks } = extractContentFromEditable(editable);
      const next = [...blocksRef.current];
      next[ctx.blockIndex] = { ...block, text: newText, marks: newMarks };
      blocksRef.current = next;
      flushSync(() => {
        setActiveIndex(ctx.blockIndex);
        onActiveBlockChange(ctx.blockIndex);
        onBlocksChange(next, true);
      });
      pasteDomSyncBlockIdRef.current = null;

      const expectedCaret = ctx.offset + normalized.length;
      const finalize = () => restoreCaretInEditable(editable, expectedCaret);
      finalize();
      requestAnimationFrame(finalize);
      setTimeout(finalize, 0);
      return;
    }

    insertPlainTextAtCursor(normalized, ctx, editable);
  }, [insertPlainTextAtCursor, replaceActiveSelectionWithText, pasteDocBlocksAtEditable, resolvePasteBlocks, armPasteCaretGuard, restoreCaretInEditable, onBlocksChange, onActiveBlockChange]);

  pastePlainTextRefFn.current = pastePlainTextAtEditable;
  pasteDocBlocksRefFn.current = pasteDocBlocksAtEditable;

  const capturePasteContext = useCallback((text: string) => {
    const sel = window.getSelection();
    const focusNode = sel?.focusNode ?? (document.activeElement instanceof Node ? document.activeElement : null);
    const editableRoot = findEditableRoot(focusNode);
    if (editableRoot) {
      const ctx = resolveEditablePasteContext(editableRoot, blocksRef.current);
      if (ctx) {
        pendingPasteTextRef.current = text;
        pendingPasteContextRef.current = ctx;
        setPendingMarkdown(text);
        setMarkdownDialogOpen(true);
        return;
      }
    }

    const fromNode = findBlockIndexFromNode(focusNode);
    const rangeCtx = getSelectionBlockRange();
    const blockIndex = fromNode >= 0 ? fromNode : (rangeCtx?.startBlock ?? activeIndexRef.current);
    const block = blocksRef.current[blockIndex];

    let offset = 0;
    let currentText = '';
    let currentMarks: TextMark[] = [];
    let listItemIndex: number | undefined;

    if (editableRoot && block?.type === 'table') {
      const tableCell = parseTableCellCoords(editableRoot);
      const cell = tableCell ? block.cells[tableCell.row]?.[tableCell.col] : null;
      if (tableCell && cell) {
        const extracted = extractContentFromEditable(editableRoot);
        currentText = extracted.text;
        currentMarks = extracted.marks;
        offset = getCaretOffset(editableRoot);
        pendingPasteTextRef.current = text;
        pendingPasteContextRef.current = { blockIndex, offset, currentText, currentMarks, tableCell };
        setPendingMarkdown(text);
        setMarkdownDialogOpen(true);
        return;
      }
    }

    if (editableRoot && block && isTextBlock(block)) {
      const extracted = extractContentFromEditable(editableRoot);
      currentText = extracted.text;
      currentMarks = extracted.marks;
      offset = getCaretOffset(editableRoot);
    } else if (editableRoot && block?.type === 'list') {
      const listCtx = getListCaretContext(editableRoot);
      currentText = extractPlainText(editableRoot);
      offset = listCtx?.focusOffset ?? getCaretOffset(editableRoot);
      listItemIndex = listCtx?.focusItemIndex;
    } else if (block && isTextBlock(block)) {
      currentText = block.text;
      currentMarks = block.marks ?? [];
      offset = currentText.length;
    }

    pendingPasteTextRef.current = text;
    pendingPasteContextRef.current = {
      blockIndex, offset, currentText, currentMarks,
      ...(listItemIndex != null ? { listItemIndex } : {}),
    };
    setPendingMarkdown(text);
    setMarkdownDialogOpen(true);
  }, [setPendingMarkdown, setMarkdownDialogOpen]);

  capturePasteContextRefFn.current = capturePasteContext;

  const handleEditablePaste = useCallback(async (e: ClipboardEvent, el: HTMLElement) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();

    const imageFile = getImageFileFromClipboard(e.clipboardData);
    if (imageFile) {
      if (!markDocPasteHandled()) return;
      try {
        const payload = await prepareImageFileForInsert(imageFile);
        handleInsertImage(payload);
      } catch (err) {
        console.error('粘贴图片上传失败', err);
      }
      return;
    }

    const clipBlocks = resolvePasteBlocks(e.clipboardData, getClipboardTextFromDataTransfer(e.clipboardData));
    if (clipBlocks?.length) {
      pasteDocBlocksAtEditable(clipBlocks, el);
      return;
    }

    const html = e.clipboardData?.getData('text/html')?.trim();
    if (html) {
      const meaningful = parseHtmlClipboardToBlocks(html);
      if (meaningful?.length) {
        pasteDocBlocksAtEditable(meaningful, el);
        return;
      }
    }

    handleEditablePasteEvent(e, el, capturePasteContextRefFn.current, pastePlainTextRefFn.current);
  }, [handleInsertImage, pasteDocBlocksAtEditable, resolvePasteBlocks, markDocPasteHandled]);

  // Ctrl+V keyboard handler
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const root = editorRef.current;
      if (!root) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && !e.isComposing) {
        const active = document.activeElement;
        const inEditor = active instanceof Node && root.contains(active);
        const fallbackEditable = getFallbackPasteEditable();
        const editable = (active ? findDocPasteEditable(active) : null) ?? fallbackEditable;
        if (!inEditor && !editable) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();

        if (inEditor) {
          void (async () => {
            const imageFile = await getImageFileFromClipboardAsync();
            if (imageFile) {
              if (!markDocPasteHandled()) return;
              try {
                const payload = await prepareImageFileForInsert(imageFile);
                handleInsertImage(payload);
              } catch (err) {
                console.error('粘贴图片上传失败', err);
              }
              return;
            }

            try {
              if (navigator.clipboard?.read) {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                  if (item.types.includes('text/html')) {
                    const blob = await item.getType('text/html');
                    const html = await blob.text();
                    const meaningful = parseHtmlClipboardToBlocks(html);
                    if (meaningful?.length && editable) {
                      pasteDocBlocksAtEditable(meaningful, editable);
                      return;
                    }
                  }
                }
              }
            } catch { /* permission or env */ }

            handlePasteKeyboardEvent(e, root, capturePasteContextRefFn.current, pastePlainTextRefFn.current, getFallbackPasteEditable);
          })();
          return;
        }

        handlePasteKeyboardEvent(e, root, capturePasteContextRefFn.current, pastePlainTextRefFn.current, getFallbackPasteEditable);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [handleInsertImage, getFallbackPasteEditable, markDocPasteHandled, pasteDocBlocksAtEditable]);

  // Copy/Cut handler
  useEffect(() => {
    const getSelectedObjectIndex = () =>
      selectedImageIndexRef.current
      ?? selectedTableIndexRef.current
      ?? selectedBaseIndexRef.current
      ?? null;

    const shouldHandleCopy = () => {
      const el = editorRef.current;
      if (!el) return false;
      if (hasActiveDocSelection()) return true;
      if (getSelectedObjectIndex() != null) return true;
      const active = document.activeElement;
      if (active instanceof Node && el.contains(active)) return true;
      const focusNode = window.getSelection()?.focusNode;
      if (focusNode && el.contains(focusNode)) return true;
      return false;
    };

    const buildCopyPayload = () => {
      const focusNode = window.getSelection()?.focusNode ?? (document.activeElement instanceof Node ? document.activeElement : null);
      return resolveDocCopyPayload({
        blocks: blocksRef.current,
        blockEls: blockRefs.current,
        docSelection: hasActiveDocSelection() ? docSelectionRef.current : null,
        savedNativeDetail: savedTextSelectionRef.current,
        focusNode,
        selectedBlockIndex: getSelectedObjectIndex(),
      });
    };

    const onCopy = (e: ClipboardEvent) => {
      if (!shouldHandleCopy()) return;
      const payload = buildCopyPayload();
      if (!payload?.blocks.length) return;
      e.preventDefault();
      writeDocCopyToClipboard(e.clipboardData, payload);
    };

    const onCut = (e: ClipboardEvent) => {
      if (!shouldHandleCopy()) return;
      const nativeSel = window.getSelection();
      const hasNativeRange = !!(nativeSel && !nativeSel.isCollapsed);
      const objectIdx = getSelectedObjectIndex();
      const hasRealSelection = hasActiveDocSelection() || hasNativeRange || objectIdx != null;
      if (!hasRealSelection) return;

      const payload = buildCopyPayload();
      if (!payload?.blocks.length) return;
      e.preventDefault();
      writeDocCopyToClipboard(e.clipboardData, payload);

      if (objectIdx != null && !hasActiveDocSelection() && !hasNativeRange) {
        handleDeleteBlock(objectIdx);
        setSelectedImageIndex(null);
        setSelectedTableIndex(null);
        setSelectedBaseIndex(null);
        return;
      }

      handleDeleteDocSelection();
    };

    document.addEventListener('copy', onCopy, true);
    document.addEventListener('cut', onCut, true);
    return () => {
      document.removeEventListener('copy', onCopy, true);
      document.removeEventListener('cut', onCut, true);
    };
  }, [hasActiveDocSelection, handleDeleteDocSelection, handleDeleteBlock]);

  return {
    markDocPasteHandled,
    commitTextBlockPaste,
    replaceActiveSelectionWithText,
    insertPlainTextAtCursor,
    applyMarkdownPaste,
    dismissMarkdownPaste,
    pasteDocBlocksAtEditable,
    getFallbackPasteEditable,
    resolvePasteBlocks,
    pastePlainTextAtEditable,
    capturePasteContext,
    handleEditablePaste,
  };
}