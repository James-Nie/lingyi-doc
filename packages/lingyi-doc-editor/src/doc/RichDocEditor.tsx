import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { DocBlock, ImageBlock, OutlineNode, ToolbarState, ParagraphStyle, ListType, OrderedListStyle, BlockAlign, TextMark, DocSelectionContext, PendingCaret, PendingCaretSpec, DocSelection, BlockSelectionState, DocAnchor } from '@lingyi-doc/core';
import {
  findActiveOutlineId,
  increaseBlockIndent,
  decreaseBlockIndent,
  isTextBlock,
  splitMarks,
  stripLeadingNewlines,
  findBlockIndexFromNode,
  findEditableRoot,
  getFocusedDocContext,
  isDocumentBodyContext,
  getSelectionBlockRange,
  getInlineStateFromSelection,
  selectElementContents,
  saveSelection,
  restoreSelection,
  extractContentFromEditable,
  extractPlainText,
  setCaretOffset,
  getCaretOffset,
  hasNonCollapsedTextSelection,
  isCaretAtStart,
  isCaretAtEnd,
  applyBlockTextMark,
  cloneDocBlock,
  marksToHtml,
  parseMarkdownToBlocks,
  spliceMarkdownBlocks,
  parseMarkdownTable,
  markdownTableDataToTableBlock,
  insertTableBlockAt,
  blocksToCellContent,
  spliceMarkdownIntoCellContent,
  applyMarkdownTableToTableBlock,
  createEmptyTable,
  createEmptyMermaid,
  createEmptyBaseBlock,
  createEmptyWhiteboardBlock,
  createFlowchartWhiteboardBlock,
  createMindmapWhiteboardBlock,
  splitListItemOnEnter,
  isListItemTextEmpty,
  listItemToParagraphBlocks,
  indentListItem,
  outdentListItem,
  parseOrderedListMarkdownLine,
  parseBulletListMarkdownLine,
  textToListItems,
  normalizeOrderedListItems,
  normalizeBulletListItems,
  extractListItemsFromDom,
  getListCaretContext,
  getListItemTextEl,
  setListItemCaret,
  getListItemPlainText,
  focusListItemFromPointer,
  listDomNeedsFullSync,
  deleteListItemCharAt,
  deleteListDomSelection,
  handleEmptyListItemEnter,
  handleEmptyListItemBackspace,
  mergeFollowingBlockIntoList,
  mergeTextBlockIntoPrecedingList,
  buildPendingCaret,
  pendingCaretFromBoundary,
  applyCaretToBlockEl,
  applyPendingCaretToBlockEl,
  isCollapsedDocSelection,
  getSelectionBlockIndices,
  getBlockSelectionState,
  selectAllDocumentBlocks,
  docSelectionToContext,
  blockAnchor,
  resolveAnchorFromNode,
  resolveAnchorFromPoint,
  resolveBlockIndexFromClientY,
  resolveClickCaretPosition,
  applyTextSelectionBetweenAnchors,
  deleteDocSelectionBlocks,
  replaceDocSelectionWithText,
  resolveEditableDocSelection,
  isCrossBlockEditableSelection,
  getNativeTextSelectionDetail,
  applyInlineFormatToBlocks,
  restoreNativeTextSelection,
  syncFormattedBlocksDom,
  selectionSlicesToAnchors,
  resolveEditablePasteContext,
  insertTextWithMarks,
  normalizePasteText,
  getClipboardTextFromDataTransfer,
  resolveDocCopyPayload,
  writeDocCopyToClipboard,
  parseClipboardDocBlocks,
  type DocCopyPayload,
  type InlineFormatAction,
  type NativeTextSelectionDetail,
  type TextSelectionSlice,
} from '@lingyi-doc/core';
import {
  applyCommentMarkFromSlice,
  applyCommentMarksFromThreads,
  applyRemoteCommentUpdate,
  appendCommentReply,
  createEmptyCommentThread,
  removeCommentMarksFromBlocks,
  resolveCommentThread,
  updateCommentReply,
  deleteCommentReply,
  deleteCommentThread,
  toggleCommentReplyLike,
  type CommentUpdatePayload,
  type DocCommentThread,
} from '@lingyi-doc/core';
import { handleEditablePasteEvent, handlePasteKeyboardEvent, parseTableCellCoords, findDocPasteEditable, type MarkdownPasteContext } from './markdownPaste';
import { getImageFileFromClipboard, getImageFileFromClipboardAsync, prepareImageFileForInsert } from './imageUtils';
import { DOC_PAGE_BG, DOC_EDITOR_MAX_WIDTH, DOC_PLACEHOLDER_BODY_COLOR } from './styles';
import { DocBlockView, createEmptyParagraph, genBlockId } from './DocBlockView';
import { DocSelectionOverlay } from './DocSelectionOverlay';
import { DOC_BODY_PLACEHOLDER } from './DocTitleEditor';
import { DocBlockWrapper, type BlockDragState } from './DocBlockWrapper';
import type { InsertBlockKind } from './DocBlockInsertMenu';
import { DocBlockInsertMenu } from './DocBlockInsertMenu';
import { DocToolbar } from './DocToolbar';
import { DocOutline } from './DocOutline';
import { DocCommentPanel } from './comments/DocCommentPanel';
import { DocCommentToolbarBar } from './comments/DocCommentToolbarBar';
import { DocTextSelectionComment } from './comments/DocTextSelectionComment';
import { DocImageInsertDialog, type InsertImagePayload } from './DocImageInsertDialog';
import { MarkdownConvertDialog } from './MarkdownConvertDialog';
import { DocTitleEditor } from './DocTitleEditor';
import { DocHistoryRevisionProvider } from './DocHistoryContext';

export interface RichDocEditorSaveRef {
  /** 保存前同步 DOM 编辑态到 model，并保持焦点/选区 */
  flushBeforeSave: () => void;
}

export interface RichDocEditorProps {
  documentId: string;
  title: string;
  blocks: DocBlock[];
  toolbarState: ToolbarState;
  outline: OutlineNode[];
  showOutline: boolean;
  fullscreen: boolean;
  onTitleChange?: (title: string) => void;
  onBlocksChange: (blocks: DocBlock[], recordHistory?: boolean) => void;
  onToolbarAction: (action: ToolbarAction, ctx: DocSelectionContext | null) => void;
  onToolbarStateChange: (partial: Partial<ToolbarState>, blockIndex: number) => void;
  onToggleOutline: () => void;
  onToggleFullscreen: () => void;
  onActiveBlockChange: (index: number) => void;
  readOnly?: boolean;
  /** 撤销/重做后递增，驱动 contentEditable 强制同步 */
  historyRevision?: number;
  /** 自动保存前回调注册（同步编辑态，避免 blur 丢光标） */
  editorSaveRef?: React.MutableRefObject<RichDocEditorSaveRef | null>;
  /** 是否开启评论功能（受服务端 FEATURE_COMMENTS_ENABLED 控制） */
  commentsEnabled?: boolean;
  /** 是否允许发表评论（编辑权或可评论权限） */
  canComment?: boolean;
  /** 当前用户（用于乐观更新评论作者信息） */
  commentAuthor?: { authorId: string; authorName: string; authorAvatar?: string | null };
  /** 初始评论列表（从 API 加载） */
  initialCommentThreads?: DocCommentThread[];
  /** 远端协同评论事件 */
  remoteCommentUpdate?: CommentUpdatePayload | null;
  /** 创建评论（持久化） */
  onPersistCommentCreate?: (input: {
    thread: DocCommentThread;
    blocks: DocBlock[];
  }) => Promise<DocCommentThread | void>;
  /** 回复评论（持久化） */
  onPersistCommentReply?: (threadId: string, text: string) => Promise<import('@lingyi-doc/core').DocCommentReply | void>;
  /** 解决评论（持久化） */
  onPersistCommentResolve?: (threadId: string) => Promise<void>;
  /** 编辑评论回复（持久化） */
  onPersistCommentEdit?: (threadId: string, replyId: string, text: string) => Promise<import('@lingyi-doc/core').DocCommentReply | void>;
  /** 删除评论回复（持久化） */
  onPersistCommentDelete?: (threadId: string, replyId: string) => Promise<{ threadDeleted: boolean } | void>;
  /** 点赞评论回复（持久化） */
  onPersistCommentLike?: (threadId: string, replyId: string) => Promise<{ liked: boolean; likeCount: number; reply: import('@lingyi-doc/core').DocCommentReply } | void>;
}

export type ToolbarAction =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'paragraphStyle'; style: ParagraphStyle }
  | { type: 'fontSize'; size: number }
  | { type: 'inline'; cmd: 'bold' | 'italic' | 'underline' | 'strikethrough' }
  | { type: 'color'; color: string }
  | { type: 'background'; color: string }
  | { type: 'align'; align: BlockAlign }
  | { type: 'list'; listType: ListType; orderedStyle?: OrderedListStyle }
  | { type: 'quote' }
  | { type: 'code' }
  | { type: 'divider' }
  | { type: 'link' }
  | { type: 'image'; url: string; width?: number }
  | { type: 'new' }
  | { type: 'indent'; direction: 'increase' | 'decrease' };

export const RichDocEditor: React.FC<RichDocEditorProps> = ({
  title,
  blocks,
  toolbarState,
  outline,
  showOutline,
  fullscreen,
  onTitleChange,
  onBlocksChange,
  onToolbarAction,
  onToolbarStateChange,
  onToggleOutline,
  onToggleFullscreen,
  onActiveBlockChange,
  historyRevision = 0,
  readOnly = false,
  editorSaveRef,
  commentsEnabled = false,
  canComment = false,
  commentAuthor,
  initialCommentThreads,
  remoteCommentUpdate = null,
  onPersistCommentCreate,
  onPersistCommentReply,
  onPersistCommentResolve,
  onPersistCommentEdit,
  onPersistCommentDelete,
  onPersistCommentLike,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const [docSelection, setDocSelection] = useState<DocSelection | null>(null);
  const [activeHandleIndex, setActiveHandleIndex] = useState<number | null>(null);
  const [blockDragState, setBlockDragState] = useState<BlockDragState | null>(null);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [toolbarInsertMenuOpen, setToolbarInsertMenuOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [selectedCodeIndex, setSelectedCodeIndex] = useState<number | null>(null);
  const [selectedTableIndex, setSelectedTableIndex] = useState<number | null>(null);
  const [selectedBaseIndex, setSelectedBaseIndex] = useState<number | null>(null);
  const [selectedWhiteboardIndex, setSelectedWhiteboardIndex] = useState<number | null>(null);
  const [markdownDialogOpen, setMarkdownDialogOpen] = useState(false);
  const [pendingMarkdown, setPendingMarkdown] = useState('');
  const [showCommentPanel, setShowCommentPanel] = useState(false);
  const [commentThreads, setCommentThreads] = useState<DocCommentThread[]>(initialCommentThreads ?? []);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const commentThreadsRef = useRef(commentThreads);
  const remoteCommentSeqRef = useRef(0);

  useEffect(() => {
    commentThreadsRef.current = commentThreads;
  }, [commentThreads]);

  useEffect(() => {
    if (!commentsEnabled) {
      setCommentThreads([]);
      setShowCommentPanel(false);
      setSelectedCommentId(null);
      return;
    }
    if (initialCommentThreads) {
      setCommentThreads(initialCommentThreads);
    }
  }, [commentsEnabled, initialCommentThreads]);

  useEffect(() => {
    if (!commentsEnabled || !remoteCommentUpdate) return;
    remoteCommentSeqRef.current += 1;
    const { threads, blocks } = applyRemoteCommentUpdate(
      commentThreadsRef.current,
      blocksRef.current,
      remoteCommentUpdate,
    );
    setCommentThreads(threads);
    const marksChanged = blocks !== blocksRef.current;
    if (marksChanged) {
      onBlocksChange(blocks, false);
    }
  }, [commentsEnabled, remoteCommentUpdate, onBlocksChange]);
  const selectedImageIndexRef = useRef<number | null>(null);
  const selectedTableIndexRef = useRef<number | null>(null);
  const selectedBaseIndexRef = useRef<number | null>(null);
  const selectedWhiteboardIndexRef = useRef<number | null>(null);
  const selectedCodeIndexRef = useRef<number | null>(null);
  const pendingPasteTextRef = useRef('');
  const pendingPasteContextRef = useRef<MarkdownPasteContext | null>(null);
  const pendingImageInsertIndexRef = useRef<number | null>(null);
  const toolbarInsertAnchorRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<Map<string, HTMLElement>>(new Map());
  const dragAnchor = useRef<number | null>(null);
  const isDragging = useRef(false);
  const docSelectionRef = useRef<DocSelection | null>(null);
  const dragStartAnchor = useRef<DocAnchor | null>(null);
  const dragMoved = useRef(false);
  const selectionCtxRef = useRef<DocSelectionContext | null>(null);
  const activeIndexRef = useRef(activeIndex);
  const blocksRef = useRef(blocks);
  const blockDragRef = useRef<{ fromIndex: number } | null>(null);
  const blockDragStateRef = useRef<BlockDragState | null>(null);
  const skipSelectionClearRef = useRef(false);
  const pasteCaretGuardUntilRef = useRef(0);
  const pasteDomSyncBlockIdRef = useRef<string | null>(null);
  const typingHistoryRef = useRef(false);
  const typingTimerRef = useRef<number | null>(null);
  const capturePasteContextRefFn = useRef<(text: string) => void>(() => {});
  const pastePlainTextRefFn = useRef<(text: string, editable: HTMLElement) => void>(() => {});
  const pasteDocBlocksRefFn = useRef<(blocks: DocBlock[], editable: HTMLElement) => void>(() => {});
  const lastDocCopyPayloadRef = useRef<DocCopyPayload | null>(null);
  const pendingCaretRef = useRef<PendingCaret | null>(null);
  const saveSelectionRef = useRef<Range | null>(null);
  const textSelectAnchorRef = useRef<DocAnchor | null>(null);
  const textSelectCleanupRef = useRef<(() => void) | null>(null);
  const pendingSelectionRestoreRef = useRef<{ blocks: DocBlock[]; slices: TextSelectionSlice[] } | null>(null);
  const savedTextSelectionRef = useRef<NativeTextSelectionDetail | null>(null);
  const lastDocPasteHandledAtRef = useRef(0);

  const markDocPasteHandled = useCallback((): boolean => {
    const now = Date.now();
    if (now - lastDocPasteHandledAtRef.current < 200) return false;
    lastDocPasteHandledAtRef.current = now;
    return true;
  }, []);

  const captureTextSelectionSnapshot = useCallback(() => {
    const detail = getNativeTextSelectionDetail(blocksRef.current, blockRefs.current);
    if (detail && !detail.collapsed && detail.slices.length) {
      savedTextSelectionRef.current = detail;
    } else if (detail?.collapsed) {
      savedTextSelectionRef.current = null;
    }
  }, []);

  const flushPendingSelectionRestore = useCallback(() => {
    const pending = pendingSelectionRestoreRef.current;
    if (!pending) return;
    pendingSelectionRestoreRef.current = null;
    syncFormattedBlocksDom(pending.blocks, pending.slices, blockRefs.current);
    skipSelectionClearRef.current = true;
    restoreNativeTextSelection(pending.blocks, pending.slices, blockRefs.current);
    savedTextSelectionRef.current = {
      slices: pending.slices,
      collapsed: false,
    };
  }, []);

  const finishTextSelectDrag = useCallback(() => {
    textSelectAnchorRef.current = null;
    textSelectCleanupRef.current?.();
    textSelectCleanupRef.current = null;
  }, []);

  const startTextSelectDrag = useCallback((anchor: DocAnchor | null) => {
    finishTextSelectDrag();
    if (!anchor) return;
    textSelectAnchorRef.current = anchor;

    const onMove = (e: MouseEvent) => {
      if (e.buttons !== 1) {
        finishTextSelectDrag();
        return;
      }
      let focus = resolveAnchorFromPoint(e.clientX, e.clientY, blocksRef.current)
        ?? resolveAnchorFromNode(document.elementFromPoint(e.clientX, e.clientY), blocksRef.current);

      if (!focus && editorRef.current) {
        const idx = resolveBlockIndexFromClientY(e.clientY, editorRef.current);
        const block = idx >= 0 ? blocksRef.current[idx] : null;
        const rowEl = editorRef.current.querySelector(`[data-block-row="${idx}"]`) as HTMLElement | null;
        if (block && isTextBlock(block)) {
          const pos = resolveClickCaretPosition(e.clientY, rowEl);
          focus = blockAnchor(idx, {
            kind: 'text',
            offset: pos === 'end' ? block.text.length : 0,
          });
        }
      }

      if (focus && textSelectAnchorRef.current) {
        skipSelectionClearRef.current = true;
        const applied = applyTextSelectionBetweenAnchors(
          textSelectAnchorRef.current,
          focus,
          blocksRef.current,
          blockRefs.current,
        );
        if (applied) {
          captureTextSelectionSnapshot();
          e.preventDefault();
        }
      }
    };
    const onUp = () => finishTextSelectDrag();

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    textSelectCleanupRef.current = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [finishTextSelectDrag, captureTextSelectionSnapshot]);

  const scheduleCaret = useCallback((spec: PendingCaretSpec, blocksOverride?: DocBlock[]) => {
    const pending = buildPendingCaret(blocksOverride ?? blocksRef.current, spec);
    if (pending) pendingCaretRef.current = pending;
    return pending;
  }, []);

  const consumePendingCaret = useCallback((
    blockId: string,
    tableCell?: { row: number; col: number },
  ): PendingCaret | null => {
    const pending = pendingCaretRef.current;
    if (!pending || pending.blockId !== blockId) return null;
    if (tableCell) {
      if (pending.tableCell?.row !== tableCell.row || pending.tableCell?.col !== tableCell.col) {
        return null;
      }
      return pending;
    }
    if (pending.tableCell) return null;
    return pending;
  }, []);

  const releasePendingCaret = useCallback((pending: PendingCaret) => {
    if (pendingCaretRef.current?.blockId === pending.blockId) {
      pendingCaretRef.current = null;
    }
  }, []);

  const applyPendingCaret = useCallback((pending: PendingCaret): boolean => {
    const block = blocksRef.current.find(b => b.id === pending.blockId);
    if (!block) return false;
    const el = blockRefs.current.get(block.id);
    if (!el) return false;
    applyPendingCaretToBlockEl(el, block, pending);
    releasePendingCaret(pending);
    return true;
  }, [releasePendingCaret]);

  const flushPendingCaret = useCallback(() => {
    const pending = pendingCaretRef.current;
    if (!pending) return;
    applyPendingCaret(pending);
  }, [applyPendingCaret]);

  const queuePendingCaretFallback = useCallback((pending: PendingCaret) => {
    requestAnimationFrame(() => {
      const still = pendingCaretRef.current;
      if (!still || still.blockId !== pending.blockId) return;
      applyPendingCaret(still);
    });
  }, [applyPendingCaret]);

  useLayoutEffect(() => {
    flushPendingSelectionRestore();
  }, [blocks, historyRevision, flushPendingSelectionRestore]);

  blocksRef.current = blocks;
  useEffect(() => { docSelectionRef.current = docSelection; }, [docSelection]);
  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => { selectedImageIndexRef.current = selectedImageIndex; }, [selectedImageIndex]);
  useEffect(() => { selectedTableIndexRef.current = selectedTableIndex; }, [selectedTableIndex]);
  useEffect(() => { selectedBaseIndexRef.current = selectedBaseIndex; }, [selectedBaseIndex]);
  useEffect(() => { selectedWhiteboardIndexRef.current = selectedWhiteboardIndex; }, [selectedWhiteboardIndex]);
  useEffect(() => { selectedCodeIndexRef.current = selectedCodeIndex; }, [selectedCodeIndex]);

  useEffect(() => {
    if (!toolbarInsertMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-doc-block-insert-menu]') || target.closest('[data-doc-table-picker]')) return;
      if (toolbarInsertAnchorRef.current?.contains(target)) return;
      setToolbarInsertMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [toolbarInsertMenuOpen]);

  const keepImageSelected = useCallback((index: number) => {
    setSelectedImageIndex(index);
    setSelectedCodeIndex(null);
    setSelectedTableIndex(null);
    setSelectedBaseIndex(null);
    setSelectedWhiteboardIndex(null);
    setActiveIndex(index);
    onActiveBlockChange(index);
  }, [onActiveBlockChange]);

  const keepCodeSelected = useCallback((index: number) => {
    setSelectedCodeIndex(index);
    setSelectedImageIndex(null);
    setSelectedTableIndex(null);
    setSelectedBaseIndex(null);
    setSelectedWhiteboardIndex(null);
    setActiveIndex(index);
    onActiveBlockChange(index);
  }, [onActiveBlockChange]);

  const keepTableSelected = useCallback((index: number) => {
    setSelectedTableIndex(index);
    setSelectedImageIndex(null);
    setSelectedCodeIndex(null);
    setSelectedBaseIndex(null);
    setSelectedWhiteboardIndex(null);
    setActiveIndex(index);
    onActiveBlockChange(index);
  }, [onActiveBlockChange]);

  const focusAfterTableInsert = useCallback((next: DocBlock[], tableIdx: number) => {
    setDocSelection(null);
    setSelectedImageIndex(null);
    setSelectedCodeIndex(null);
    setSelectedTableIndex(null);
    setSelectedBaseIndex(null);
    setSelectedWhiteboardIndex(null);
    skipSelectionClearRef.current = true;
    window.getSelection()?.removeAllRanges();

    const afterIdx = tableIdx + 1 < next.length ? tableIdx + 1 : tableIdx;
    const afterBlock = next[afterIdx];
    setActiveIndex(afterIdx);
    onActiveBlockChange(afterIdx);
    if (afterBlock && (isTextBlock(afterBlock) || afterBlock.type === 'list')) {
      scheduleCaret({ blockIndex: afterIdx, position: 'start' }, next);
    }
  }, [onActiveBlockChange, scheduleCaret]);

  const keepBaseSelected = useCallback((index: number) => {
    setSelectedBaseIndex(index);
    setSelectedImageIndex(null);
    setSelectedCodeIndex(null);
    setSelectedTableIndex(null);
    setSelectedWhiteboardIndex(null);
    setActiveIndex(index);
    onActiveBlockChange(index);
  }, [onActiveBlockChange]);

  const keepWhiteboardSelected = useCallback((index: number) => {
    setSelectedWhiteboardIndex(index);
    setSelectedImageIndex(null);
    setSelectedCodeIndex(null);
    setSelectedTableIndex(null);
    setSelectedBaseIndex(null);
    setActiveIndex(index);
    onActiveBlockChange(index);
  }, [onActiveBlockChange]);

  const registerRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) blockRefs.current.set(id, el);
    else blockRefs.current.delete(id);
  }, []);

  const applyDocSelectionVisual = useCallback((sel: DocSelection) => {
    if (!isCollapsedDocSelection(sel)) {
      skipSelectionClearRef.current = true;
      window.getSelection()?.removeAllRanges();
    }
  }, []);

  const hasActiveDocSelection = useCallback(() => {
    return !!resolveEditableDocSelection(
      blocksRef.current,
      blockRefs.current,
      docSelectionRef.current,
      savedTextSelectionRef.current,
    );
  }, []);

  const clearActiveDocSelection = useCallback(() => {
    setDocSelection(null);
    savedTextSelectionRef.current = null;
  }, []);

  const resolveActiveDocSelection = useCallback((): DocSelection | null => {
    return resolveEditableDocSelection(
      blocksRef.current,
      blockRefs.current,
      docSelectionRef.current,
      savedTextSelectionRef.current,
    );
  }, []);

  const getContext = useCallback((): DocSelectionContext | null => {
    const sel = docSelectionRef.current;
    if (sel && !isCollapsedDocSelection(sel)) {
      return docSelectionToContext(sel, blocksRef.current);
    }
    return getSelectionBlockRange();
  }, []);

  const refreshToolbarState = useCallback((blockIndex?: number) => {
    const idx = blockIndex ?? activeIndex;
    const inline = getInlineStateFromSelection();
    onToolbarStateChange(inline, idx);
  }, [activeIndex, onToolbarStateChange]);

  const armPasteCaretGuard = useCallback(() => {
    pasteCaretGuardUntilRef.current = Date.now() + 300;
    skipSelectionClearRef.current = true;
  }, []);

  const restoreCaretInEditable = useCallback((el: HTMLElement, offset: number) => {
    if (!el.isConnected) return;
    armPasteCaretGuard();
    el.focus({ preventScroll: true });
    const len = extractContentFromEditable(el).text.length;
    setCaretOffset(el, Math.min(offset, len));
  }, [armPasteCaretGuard]);

  useEffect(() => {
    const onSelectionChange = () => {
      if (Date.now() < pasteCaretGuardUntilRef.current) return;
      if (skipSelectionClearRef.current) {
        skipSelectionClearRef.current = false;
        return;
      }
      captureTextSelectionSnapshot();
      const ctx = getSelectionBlockRange();
      const sel = docSelectionRef.current;
      if (sel && !isCollapsedDocSelection(sel)) return;
      selectionCtxRef.current = ctx;
      if (ctx?.hasTextSelection && !ctx.isMultiBlock) {
        setDocSelection(null);
        refreshToolbarState(ctx.startBlock);
        setActiveIndex(ctx.startBlock);
        onActiveBlockChange(ctx.startBlock);
      }
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [refreshToolbarState, onActiveBlockChange, captureTextSelectionSnapshot]);

  const syncBlockFromEl = useCallback((index: number, el: HTMLElement) => {
    const block = blocksRef.current[index];
    if (!block) return;
    if (isTextBlock(block)) {
      const { text, marks } = extractContentFromEditable(el);
      const next = [...blocksRef.current];
      next[index] = { ...block, text, marks };
      onBlocksChange(next, false);
      return;
    }
    if (block.type === 'list') {
      const items = extractListItemsFromDom(el, block.items);
      const next = [...blocksRef.current];
      next[index] = { ...block, items };
      onBlocksChange(next, false);
    }
  }, [onBlocksChange]);

  useEffect(() => {
    if (!editorSaveRef) return;
    editorSaveRef.current = {
      flushBeforeSave: () => {
        saveSelectionRef.current = saveSelection();
        const root = editorRef.current;
        if (!root) return;
        const ctx = getFocusedDocContext(root);
        if (ctx.blockIndex >= 0 && ctx.editable) {
          syncBlockFromEl(ctx.blockIndex, ctx.editable);
        }
        requestAnimationFrame(() => {
          restoreSelection(saveSelectionRef.current);
        });
      },
    };
    return () => {
      editorSaveRef.current = null;
    };
  }, [editorSaveRef, syncBlockFromEl]);

  const getFormatBlockIndices = useCallback((ctx: DocSelectionContext | null): number[] => {
    const sel = docSelectionRef.current;
    if (sel && !isCollapsedDocSelection(sel)) {
      return getSelectionBlockIndices(sel, blocksRef.current) ?? [activeIndex];
    }
    if (ctx?.isMultiBlock) {
      const indices: number[] = [];
      for (let i = ctx.startBlock; i <= ctx.endBlock; i++) indices.push(i);
      return indices;
    }
    if (ctx?.hasTextSelection) return [ctx.startBlock];
    return [activeIndex];
  }, [activeIndex]);

  const applyInlineFormat = useCallback((action: InlineFormatAction): boolean => {
    let detail = getNativeTextSelectionDetail(blocksRef.current, blockRefs.current);
    if ((!detail || detail.collapsed || !detail.slices.length) && savedTextSelectionRef.current) {
      detail = savedTextSelectionRef.current;
    }
    if (!detail || detail.collapsed || !detail.slices.length) return false;

    const slices = detail.slices;
    const next = applyInlineFormatToBlocks(blocksRef.current, slices, action);
    pendingSelectionRestoreRef.current = { blocks: next, slices };
    onBlocksChange(next, true);

    refreshToolbarState(slices[0].blockIndex);
    setActiveIndex(slices[0].blockIndex);
    onActiveBlockChange(slices[0].blockIndex);
    return true;
  }, [onBlocksChange, refreshToolbarState, onActiveBlockChange]);

  const applyInlineToTargets = useCallback((action: InlineFormatAction, selectAllInMulti = true) => {
    if (applyInlineFormat(action)) return;

    const ctx = getContext();
    if (ctx?.hasTextSelection || savedTextSelectionRef.current?.slices.length) {
      return;
    }

    const indices = getFormatBlockIndices(ctx);
    const saved = saveSelection();
    const isMulti = indices.length > 1 || hasActiveDocSelection();

    indices.forEach(i => {
      const block = blocksRef.current[i];
      const el = block?.id ? blockRefs.current.get(block.id) : null;
      if (!el?.isContentEditable) return;
      if (isMulti && selectAllInMulti) selectElementContents(el);
      if (action.type === 'bold') document.execCommand('bold', false);
      else if (action.type === 'italic') document.execCommand('italic', false);
      else if (action.type === 'underline') document.execCommand('underline', false);
      else if (action.type === 'strikethrough') document.execCommand('strikeThrough', false);
      else if (action.type === 'color') document.execCommand('foreColor', false, action.value);
      else if (action.type === 'background') {
        if (action.value === 'transparent') document.execCommand('removeFormat', false);
        else document.execCommand('hiliteColor', false, action.value);
      } else if (action.type === 'fontSize') document.execCommand('fontSize', false, '3');
      else if (action.type === 'link') document.execCommand('createLink', false, action.value);
      syncBlockFromEl(i, el);
    });

    if (!isMulti) restoreSelection(saved);
    refreshToolbarState(indices[0] ?? activeIndex);
  }, [applyInlineFormat, getContext, getFormatBlockIndices, syncBlockFromEl, refreshToolbarState, activeIndex, hasActiveDocSelection]);

  const handleToolbarAction = useCallback((action: ToolbarAction) => {
    if (readOnly) return;
    const ctx = getContext();

    if (action.type === 'inline') {
      applyInlineToTargets({ type: action.cmd });
      return;
    }
    if (action.type === 'color') {
      applyInlineToTargets({ type: 'color', value: action.color });
      return;
    }
    if (action.type === 'background') {
      applyInlineToTargets({ type: 'background', value: action.color });
      return;
    }
    if (action.type === 'fontSize') {
      applyInlineToTargets({ type: 'fontSize', value: `${action.size}px` });
      onToolbarStateChange({ fontSize: action.size }, getFormatBlockIndices(ctx)[0] ?? activeIndex);
      return;
    }
    if (action.type === 'link') {
      const url = window.prompt('链接地址', 'https://');
      if (!url) return;
      applyInlineToTargets({ type: 'link', value: url }, false);
      return;
    }
    if (action.type === 'indent') {
      const indices = getFormatBlockIndices(ctx);
      const next = [...blocks];
      indices.forEach(i => {
        const block = next[i];
        if (!isTextBlock(block)) return;
        next[i] = action.direction === 'increase'
          ? increaseBlockIndent(block)
          : decreaseBlockIndent(block);
      });
      onBlocksChange(next, true);
      return;
    }
    if (action.type === 'new') {
      setToolbarInsertMenuOpen(v => !v);
      return;
    }

    onToolbarAction(action, ctx);
  }, [activeIndex, applyInlineToTargets, blocks, getContext, getFormatBlockIndices, onBlocksChange, onToolbarAction, onToolbarStateChange]);

  const selectEntireDocument = useCallback(() => {
    const allBlocks = blocksRef.current;
    if (!allBlocks.length) return;

    const sel = selectAllDocumentBlocks(allBlocks.length);
    skipSelectionClearRef.current = true;
    setDocSelection(sel);
    setSelectedImageIndex(null);
    setSelectedCodeIndex(null);
    setSelectedTableIndex(null);
    setSelectedBaseIndex(null);
    window.getSelection()?.removeAllRanges();
    setActiveIndex(0);
    onActiveBlockChange(0);
    refreshToolbarState(0);
  }, [onActiveBlockChange, refreshToolbarState]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a') return;
      if (e.isComposing) return;

      const root = editorRef.current;
      if (!root?.contains(document.activeElement)) return;

      const ctx = getFocusedDocContext(root);

      if (ctx.kind === 'code' && ctx.editable) {
        e.preventDefault();
        selectElementContents(ctx.editable);
        if (ctx.blockIndex >= 0) keepCodeSelected(ctx.blockIndex);
        return;
      }

      if (ctx.kind === 'mermaid' && ctx.editable) {
        e.preventDefault();
        selectElementContents(ctx.editable);
        if (ctx.blockIndex >= 0) keepCodeSelected(ctx.blockIndex);
        return;
      }

      if (ctx.kind === 'table') {
        e.preventDefault();
        if (ctx.blockIndex >= 0) {
          keepTableSelected(ctx.blockIndex);
          window.getSelection()?.removeAllRanges();
        }
        return;
      }

      if (ctx.kind === 'title' && ctx.editable) {
        e.preventDefault();
        selectElementContents(ctx.editable);
        return;
      }

      if (ctx.kind === 'list' && ctx.editable) {
        e.preventDefault();
        selectEntireDocument();
        return;
      }

      if (isDocumentBodyContext(ctx.kind)) {
        e.preventDefault();
        selectEntireDocument();
      }
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [keepCodeSelected, keepTableSelected, selectEntireDocument]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.isComposing) return;

      const root = editorRef.current;
      if (!root?.contains(document.activeElement)) return;

      const ctx = getFocusedDocContext(root);
      if (ctx.kind === 'title') return;

      if (e.shiftKey && e.key === '7') {
        e.preventDefault();
        handleToolbarAction({ type: 'list', listType: 'ordered' });
        return;
      }
      if (e.shiftKey && e.key === '8') {
        e.preventDefault();
        handleToolbarAction({ type: 'list', listType: 'bullet' });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleToolbarAction]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'b') { e.preventDefault(); handleToolbarAction({ type: 'inline', cmd: 'bold' }); }
      if (e.key === 'i') { e.preventDefault(); handleToolbarAction({ type: 'inline', cmd: 'italic' }); }
      if (e.key === 'u') { e.preventDefault(); handleToolbarAction({ type: 'inline', cmd: 'underline' }); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleToolbarAction]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.isComposing) return;

      const root = editorRef.current;
      if (!root?.contains(document.activeElement)) return;

      const ctx = getFocusedDocContext(root);
      if (ctx.kind === 'title') return;

      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        e.stopPropagation();
        handleToolbarAction({ type: e.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if (key === 'y' && e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        handleToolbarAction({ type: 'redo' });
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [handleToolbarAction]);

  const focusBlockAt = useCallback((
    index: number,
    position: 'start' | 'end' | number = 'start',
    listItemIndex?: number,
  ) => {
    setActiveIndex(index);
    onActiveBlockChange(index);
    setDocSelection(null);

    const block = blocksRef.current[index];
    if (block?.type === 'image') {
      setSelectedImageIndex(index);
      setSelectedCodeIndex(null);
      setSelectedTableIndex(null);
    } else if (block?.type === 'code' || block?.type === 'mermaid') {
      setSelectedCodeIndex(index);
      setSelectedImageIndex(null);
      setSelectedTableIndex(null);
    } else if (block?.type === 'table') {
      setSelectedTableIndex(index);
      setSelectedImageIndex(null);
      setSelectedCodeIndex(null);
    } else {
      setSelectedImageIndex(null);
      setSelectedCodeIndex(null);
      setSelectedTableIndex(null);
    }

    if (!block) return;

    const el = blockRefs.current.get(block.id);
    if (el && (isTextBlock(block) || block.type === 'list')) {
      applyCaretToBlockEl(el, block, { position, listItemIndex });
      return;
    }

    if (block.type === 'code' || block.type === 'mermaid') {
      el?.focus();
      return;
    }

    if (block.type === 'table') {
      const tableRoot = blockRefs.current.get(block.id);
      const cell = tableRoot?.querySelector('[data-table-cell="0-0"]') as HTMLElement | null;
      cell?.focus();
    }
  }, [onActiveBlockChange]);

  const focusBlock = focusBlockAt;

  const findNearestTextBlockIndex = useCallback((blocks: DocBlock[], from: number, direction: -1 | 1): number => {
    for (let i = from; i >= 0 && i < blocks.length; i += direction) {
      const b = blocks[i];
      if (isTextBlock(b) || b.type === 'list') return i;
    }
    return -1;
  }, []);

  const maxImageWidth = DOC_EDITOR_MAX_WIDTH - 96;

  const handleInsertImage = useCallback((payload: InsertImagePayload) => {
    const width = Math.min(payload.naturalWidth, maxImageWidth);
    const imageBlock = {
      type: 'image' as const,
      id: genBlockId(),
      url: payload.url,
      width,
      align: 'left' as const,
      naturalWidth: payload.naturalWidth,
      naturalHeight: payload.naturalHeight,
      imageStyle: 'none' as const,
      rotation: 0 as const,
    };
    const insertAt = pendingImageInsertIndexRef.current ?? activeIndex + 1;
    pendingImageInsertIndexRef.current = null;
    const next = [...blocksRef.current];
    next.splice(insertAt, 0, imageBlock, createEmptyParagraph());
    onBlocksChange(next, true);
    keepImageSelected(insertAt);
  }, [maxImageWidth, onBlocksChange, keepImageSelected, activeIndex]);

  const buildInsertBlock = useCallback((kind: InsertBlockKind, tableSize?: { rows: number; cols: number }): DocBlock => {
    switch (kind) {
      case 'heading1': return { type: 'heading', id: genBlockId(), level: 1, text: '', marks: [] };
      case 'heading2': return { type: 'heading', id: genBlockId(), level: 2, text: '', marks: [] };
      case 'heading3': return { type: 'heading', id: genBlockId(), level: 3, text: '', marks: [] };
      case 'heading4': return { type: 'heading', id: genBlockId(), level: 4, text: '', marks: [] };
      case 'bulletList':
        return { type: 'list', id: genBlockId(), listType: 'bullet', items: [{ text: '', level: 1, marks: [] }] };
      case 'orderedList':
        return { type: 'list', id: genBlockId(), listType: 'ordered', items: [{ text: '', level: 1, marks: [] }] };
      case 'taskList':
        return { type: 'list', id: genBlockId(), listType: 'task', items: [{ text: '', level: 1, checked: false, marks: [] }] };
      case 'code':
        return { type: 'code', id: genBlockId(), text: '', collapsed: false, height: 200, wordWrap: false };
      case 'mermaid':
        return createEmptyMermaid();
      case 'quote':
        return { type: 'quote', id: genBlockId(), text: '', marks: [] };
      case 'divider':
        return { type: 'divider', id: genBlockId() };
      case 'table':
        return createEmptyTable(tableSize?.rows ?? 3, tableSize?.cols ?? 3);
      case 'baseGrid':
        return createEmptyBaseBlock('grid');
      case 'baseKanban':
        return createEmptyBaseBlock('kanban');
      case 'baseGantt':
        return createEmptyBaseBlock('gantt');
      case 'baseGallery':
        return createEmptyBaseBlock('gallery');
      case 'whiteboard':
        return createEmptyWhiteboardBlock();
      case 'whiteboardFlowchart':
        return createFlowchartWhiteboardBlock();
      case 'whiteboardMindmap':
        return createMindmapWhiteboardBlock();
      default:
        return createEmptyParagraph();
    }
  }, []);

  const handleInsertBelow = useCallback((index: number, kind: InsertBlockKind, tableSize?: { rows: number; cols: number }) => {
    if (readOnly) return;
    if (kind === 'image') {
      pendingImageInsertIndexRef.current = index + 1;
      setImagePickerOpen(true);
      return;
    }
    const newBlock = buildInsertBlock(kind, tableSize);
    const next = [...blocksRef.current];
    next.splice(index + 1, 0, newBlock, createEmptyParagraph());
    const newIdx = index + 1;
    if (newBlock.type === 'table') focusAfterTableInsert(next, newIdx);
    else if (newBlock.type === 'base') keepBaseSelected(newIdx);
    else if (newBlock.type === 'whiteboard') keepWhiteboardSelected(newIdx);
    else if (newBlock.type === 'code' || newBlock.type === 'mermaid') keepCodeSelected(newIdx);
    else scheduleCaret({ blockIndex: newIdx, position: 'start' }, next);
    onBlocksChange(next, true);
  }, [buildInsertBlock, onBlocksChange, focusAfterTableInsert, keepBaseSelected, keepWhiteboardSelected, keepCodeSelected, scheduleCaret]);

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
  }, [onBlocksChange, keepImageSelected, keepCodeSelected, keepTableSelected, keepBaseSelected, keepWhiteboardSelected]);

  const handleImagePatch = useCallback((index: number, patch: Partial<ImageBlock>, recordHistory = true) => {
    const current = blocksRef.current[index];
    if (!current || current.type !== 'image') return;
    const next = [...blocksRef.current];
    next[index] = { ...current, ...patch };
    onBlocksChange(next, recordHistory);
    keepImageSelected(index);
  }, [onBlocksChange, keepImageSelected]);

  const handleEnter = (index: number, cursorOffset: number, fullText: string, domMarks: TextMark[]) => {
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
    scheduleCaret({ blockIndex: index + 1, position: 'start' }, next);
    setActiveIndex(index + 1);
    onActiveBlockChange(index + 1);
    onBlocksChange(next, true);
  };

  const handleTabIndent = useCallback((index: number) => {
    const ctx = getContext();
    const indices = getFormatBlockIndices(ctx);
    const targetIndices = indices.length > 1 ? indices : [index];
    const next = [...blocks];
    targetIndices.forEach(i => {
      const block = next[i];
      if (isTextBlock(block)) next[i] = increaseBlockIndent(block);
    });
    onBlocksChange(next, true);
  }, [blocks, getContext, getFormatBlockIndices, onBlocksChange]);

  const handleListEnter = useCallback((
    blockIndex: number,
    itemIndex: number,
    cursorOffset: number,
    fullText: string,
  ) => {
    const block = blocksRef.current[blockIndex];
    if (block.type !== 'list') return;
    setDocSelection(null);

    const result = splitListItemOnEnter(
      block.items, itemIndex, cursorOffset, fullText, block.listType, block.orderedStyle,
    );
    if ('cancel' in result) {
      const cleared = handleEmptyListItemEnter(blocksRef.current, blockIndex, itemIndex);
      scheduleCaret(pendingCaretFromBoundary(cleared.focus), cleared.blocks);
      onBlocksChange(cleared.blocks, true);
      return;
    }
    const next = [...blocksRef.current];
    next[blockIndex] = { ...block, items: result.items };
    scheduleCaret({ blockIndex, position: 'start', listItemIndex: result.focusIndex }, next);
    onBlocksChange(next, true);
  }, [onBlocksChange, scheduleCaret]);

  const handleListBackspace = useCallback((
    blockIndex: number,
    itemIndex: number,
    atStart: boolean,
    text: string,
  ) => {
    const block = blocksRef.current[blockIndex];
    if (block.type !== 'list') return;

    if (isListItemTextEmpty(text)) {
      const cleared = handleEmptyListItemBackspace(blocksRef.current, blockIndex, itemIndex);
      scheduleCaret(pendingCaretFromBoundary(cleared.focus), cleared.blocks);
      onBlocksChange(cleared.blocks, true);
      return;
    }

    if (atStart) {
      const newBlocks = listItemToParagraphBlocks(block, itemIndex);
      const next = [...blocksRef.current];
      next.splice(blockIndex, 1, ...newBlocks);
      const paraOffset = newBlocks.findIndex(b => b.type === 'paragraph');
      scheduleCaret({ blockIndex: blockIndex + Math.max(0, paraOffset), position: 'start' }, next);
      onBlocksChange(next, true);
    }
  }, [onBlocksChange, scheduleCaret]);

  const handleListTab = useCallback((
    blockIndex: number,
    itemIndex: number,
    shiftKey: boolean,
  ) => {
    const block = blocksRef.current[blockIndex];
    if (block.type !== 'list') return;
    const item = block.items[itemIndex];
    if (!item) return;

    if (shiftKey) {
      if (item.level <= 1) {
        const newBlocks = listItemToParagraphBlocks(block, itemIndex);
        const next = [...blocksRef.current];
        next.splice(blockIndex, 1, ...newBlocks);
        const paraOffset = newBlocks.findIndex(b => b.type === 'paragraph');
        scheduleCaret({ blockIndex: blockIndex + Math.max(0, paraOffset), position: 'start' }, next);
        onBlocksChange(next, true);
        return;
      }
      const items = outdentListItem(block.items, itemIndex, block.listType, block.orderedStyle);
      const next = [...blocksRef.current];
      next[blockIndex] = { ...block, items };
      onBlocksChange(next, true);
      return;
    }

    const items = indentListItem(block.items, itemIndex, block.listType, block.orderedStyle);
    const next = [...blocksRef.current];
    next[blockIndex] = { ...block, items };
    onBlocksChange(next, true);
  }, [onBlocksChange, scheduleCaret]);

  const handleListDeleteItemAtEnd = useCallback((
    blockIndex: number,
    itemIndex: number,
    _fullText: string,
  ) => {
    const block = blocksRef.current[blockIndex];
    if (block.type !== 'list') return;
    setDocSelection(null);

    if (itemIndex < block.items.length - 1) {
      const items = block.items.map(it => ({ ...it, marks: [...(it.marks ?? [])] }));
      const curr = items[itemIndex];
      const nextItem = items[itemIndex + 1];
      const mergeOffset = curr.text.length;
      items[itemIndex] = { ...curr, text: curr.text + nextItem.text };
      items.splice(itemIndex + 1, 1);
      const normalized = block.listType === 'ordered'
        ? normalizeOrderedListItems(items, block.orderedStyle)
        : block.listType === 'bullet'
          ? normalizeBulletListItems(items)
          : items;
      const next = [...blocksRef.current];
      next[blockIndex] = { ...block, items: normalized };
      scheduleCaret({ blockIndex, position: mergeOffset, listItemIndex: itemIndex }, next);
      onBlocksChange(next, true);
      return;
    }

    if (blockIndex >= blocksRef.current.length - 1) return;
    const merged = mergeFollowingBlockIntoList(blocksRef.current, blockIndex);
    if (!merged) return;
    scheduleCaret(pendingCaretFromBoundary(merged.focus), merged.blocks);
    onBlocksChange(merged.blocks, true);
  }, [onBlocksChange, scheduleCaret]);

  const handleDeleteBlock = useCallback((index: number) => {
    if (readOnly) return;
    if (blocks.length <= 1) {
      const next = [createEmptyParagraph()];
      scheduleCaret({ blockIndex: 0, position: 'start' }, next);
      onBlocksChange(next, true);
      return;
    }
    const next = [...blocks];
    next.splice(index, 1);
    const anchor = Math.min(index, next.length - 1);
    let focusIdx = findNearestTextBlockIndex(next, anchor, 1);
    if (focusIdx < 0) focusIdx = findNearestTextBlockIndex(next, anchor, -1);
    if (focusIdx < 0) focusIdx = anchor;
    scheduleCaret({ blockIndex: focusIdx, position: 'start' }, next);
    onBlocksChange(next, true);
  }, [blocks, onBlocksChange, scheduleCaret, findNearestTextBlockIndex]);

  const handleCopyBlock = useCallback((index: number) => {
    const cloned = cloneDocBlock(blocks[index]);
    const next = [...blocks];
    next.splice(index + 1, 0, cloned);
    scheduleCaret({ blockIndex: index + 1, position: 'start' }, next);
    onBlocksChange(next, true);
  }, [blocks, onBlocksChange, scheduleCaret]);

  const handleBlockTextColor = useCallback((index: number, color: string) => {
    const block = blocks[index];
    if (!isTextBlock(block)) return;
    const next = [...blocks];
    next[index] = applyBlockTextMark(block, 'color', color);
    onBlocksChange(next, true);
  }, [blocks, onBlocksChange]);

  const handleBlockBackgroundColor = useCallback((index: number, color: string) => {
    const block = blocks[index];
    const next = [...blocks];
    if (isTextBlock(block)) {
      if (color === 'transparent') {
        next[index] = { ...block, blockBackground: undefined };
      } else {
        next[index] = { ...block, blockBackground: color };
      }
    } else if (block.type === 'code') {
      next[index] = color === 'transparent'
        ? { ...block, blockBackground: undefined }
        : { ...block, blockBackground: color };
    }
    onBlocksChange(next, true);
  }, [blocks, onBlocksChange]);

  const handleBlockDragStart = useCallback((fromIndex: number) => {
    blockDragRef.current = { fromIndex };
    const initial: BlockDragState = { fromIndex, overIndex: fromIndex, position: 'after' };
    blockDragStateRef.current = initial;
    setBlockDragState(initial);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return;
      const row = el.closest('[data-block-row]') as HTMLElement | null;
      if (!row) return;
      const overIndex = Number(row.dataset.blockRow);
      if (Number.isNaN(overIndex)) return;

      const rect = row.getBoundingClientRect();
      const position: 'before' | 'after' = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      const state: BlockDragState = { fromIndex, overIndex, position };
      blockDragStateRef.current = state;
      setBlockDragState(state);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);

      const prev = blockDragStateRef.current;
      blockDragRef.current = null;
      blockDragStateRef.current = null;
      setBlockDragState(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      if (!prev || prev.fromIndex === prev.overIndex) return;

      const next = [...blocksRef.current];
      const [removed] = next.splice(prev.fromIndex, 1);
      let insertAt = prev.overIndex;
      if (prev.fromIndex < prev.overIndex) insertAt -= 1;
      if (prev.position === 'after') insertAt += 1;
      insertAt = Math.max(0, Math.min(insertAt, next.length));
      next.splice(insertAt, 0, removed);
      onBlocksChange(next, true);
      setActiveIndex(insertAt);
      onActiveBlockChange(insertAt);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [onBlocksChange, onActiveBlockChange]);

  const handleBackspaceEmpty = (index: number) => {
    if (blocks.length <= 1) return;
    const next = [...blocks];
    next.splice(index, 1);
    setDocSelection(null);
    const target = findNearestTextBlockIndex(next, Math.max(0, index - 1), -1);
    scheduleCaret({ blockIndex: target >= 0 ? target : 0, position: 'end' }, next);
    onBlocksChange(next, true);
  };

  const handleDeleteAtEnd = useCallback((index: number) => {
    if (index >= blocks.length - 1) return;
    const curr = blocks[index];

    if (curr.type === 'list') {
      const merged = mergeFollowingBlockIntoList(blocks, index);
      if (!merged) return;
      setDocSelection(null);
      scheduleCaret(pendingCaretFromBoundary(merged.focus), merged.blocks);
      onBlocksChange(merged.blocks, true);
      return;
    }

    const nextBlock = blocks[index + 1];
    if (!isTextBlock(curr) || !isTextBlock(nextBlock)) return;

    const splitAt = curr.text.length;
    const mergedText = curr.text + nextBlock.text;
    const mergedMarks = [
      ...curr.marks,
      ...nextBlock.marks.map(m => ({ ...m, start: m.start + splitAt, end: m.end + splitAt })),
    ];

    const next = [...blocks];
    next[index] = { ...curr, text: mergedText, marks: trimMarks(mergedMarks, mergedText.length) };
    next.splice(index + 1, 1);
    setDocSelection(null);
    scheduleCaret({ blockIndex: index, position: splitAt }, next);
    setActiveIndex(index);
    onActiveBlockChange(index);
    onBlocksChange(next, true);
  }, [blocks, onBlocksChange, onActiveBlockChange, scheduleCaret]);

  const handleBackspaceMerge = useCallback((index: number) => {
    if (index <= 0) return;

    const listMerged = mergeTextBlockIntoPrecedingList(blocks, index);
    if (listMerged) {
      setDocSelection(null);
      scheduleCaret(pendingCaretFromBoundary(listMerged.focus), listMerged.blocks);
      onBlocksChange(listMerged.blocks, true);
      return;
    }

    const prev = blocks[index - 1];
    const curr = blocks[index];
    if (!isTextBlock(prev) || !isTextBlock(curr)) return;

    const splitAt = prev.text.length;
    const mergedText = prev.text + curr.text;
    const mergedMarks = [
      ...prev.marks,
      ...curr.marks.map(m => ({ ...m, start: m.start + splitAt, end: m.end + splitAt })),
    ];

    const next = [...blocks];
    next[index - 1] = { ...prev, text: mergedText, marks: trimMarks(mergedMarks, mergedText.length) };
    next.splice(index, 1);
    setDocSelection(null);
    scheduleCaret({ blockIndex: index - 1, position: splitAt }, next);
    setActiveIndex(index - 1);
    onActiveBlockChange(index - 1);
    onBlocksChange(next, true);
  }, [blocks, onBlocksChange, onActiveBlockChange, scheduleCaret]);

  const handleDeleteDocSelection = useCallback(() => {
    const sel = resolveActiveDocSelection();
    if (!sel) return;
    const result = deleteDocSelectionBlocks(blocksRef.current, sel);
    if (!result) return;

    clearActiveDocSelection();
    const caretSpec: PendingCaretSpec = result.caretListItemIndex != null
      ? { blockIndex: result.caretBlockIndex, position: result.caretOffset, listItemIndex: result.caretListItemIndex }
      : { blockIndex: result.caretBlockIndex, position: result.caretOffset };
    scheduleCaret(caretSpec, result.blocks);
    setActiveIndex(result.caretBlockIndex);
    onActiveBlockChange(result.caretBlockIndex);
    onBlocksChange(result.blocks, true);
  }, [resolveActiveDocSelection, clearActiveDocSelection, onBlocksChange, onActiveBlockChange, scheduleCaret]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-doc-image-ui]') || target.closest('[data-doc-code-ui]') || target.closest('[data-doc-mermaid-ui]') || target.closest('[data-doc-table-ui]')) return;
      if (target.closest('[data-doc-block-insert-menu]') || target.closest('[data-doc-table-picker]')) return;
      if (target.closest('[data-block-index]') && findBlockIndexFromNode(target) === selectedImageIndexRef.current) return;
      if (editorRef.current?.contains(target)) return;
      setSelectedImageIndex(null);
      setSelectedCodeIndex(null);
      setSelectedTableIndex(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const commitTextBlockPaste = useCallback((
    next: DocBlock[],
    blockIndex: number,
    caretPos: number,
    targetEditable?: HTMLElement | null,
    recordHistory = false,
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
  }, [
    onBlocksChange,
    onActiveBlockChange,
    scheduleCaret,
    armPasteCaretGuard,
    restoreCaretInEditable,
  ]);

  const replaceActiveSelectionWithText = useCallback((text: string) => {
    const sel = resolveActiveDocSelection();
    if (!sel) return false;
    const result = replaceDocSelectionWithText(blocksRef.current, sel, text);
    if (!result) return false;
    clearActiveDocSelection();
    const target = result.blocks[result.caretBlockIndex];
    if (target && isTextBlock(target)) {
      commitTextBlockPaste(
        result.blocks,
        result.caretBlockIndex,
        result.caretOffset,
        null,
        true,
      );
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
  }, [onBlocksChange, onActiveBlockChange, scheduleCaret, commitTextBlockPaste, armPasteCaretGuard, resolveActiveDocSelection, clearActiveDocSelection]);

  const insertPlainTextAtCursor = useCallback((
    text: string,
    ctx?: MarkdownPasteContext | null,
    targetEditable?: HTMLElement | null,
  ) => {
    const normalized = normalizePasteText(text);
    if (!normalized) return;

    if (replaceActiveSelectionWithText(normalized)) return;

    // 粘贴只认当前 live 选区，不用 savedTextSelectionRef（复制后移动光标时 saved 会过期）
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
            ? {
                blockIndex: idx,
                position: result.caretOffset,
                listItemIndex: result.caretListItemIndex,
              }
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
      ctx.currentText,
      ctx.currentMarks,
      lo,
      normalized,
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
      onBlocksChange(next, false);
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
        i === ctx.listItemIndex
          ? { ...it, text: newText, marks: newMarks }
          : it,
      );
      const next = [...blocksRef.current];
      next[idx] = { ...block, items };
      blocksRef.current = next;
      scheduleCaret(
        { blockIndex: idx, position: caretPos, listItemIndex: ctx.listItemIndex },
        next,
      );
      setActiveIndex(idx);
      onActiveBlockChange(idx);
      onBlocksChange(next, false);
      savedTextSelectionRef.current = null;
      skipSelectionClearRef.current = true;
    }
  }, [
    onBlocksChange,
    onActiveBlockChange,
    replaceActiveSelectionWithText,
    scheduleCaret,
    commitTextBlockPaste,
    armPasteCaretGuard,
    queuePendingCaretFallback,
    releasePendingCaret,
  ]);

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
          ? {
              blockIndex,
              offset: deleted.caretOffset,
              currentText: block.text,
              currentMarks: block.marks,
            }
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
          baseBlocks,
          blockIndex,
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
        const merged = spliceMarkdownIntoCellContent(
          ctx.offset,
          ctx.currentText,
          ctx.currentMarks,
          insert,
        );
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
        next = spliceMarkdownBlocks(
          baseBlocks,
          pasteCtx.blockIndex,
          pasteCtx.offset,
          pasteCtx.currentText,
          pasteCtx.currentMarks,
          parsed,
        );
      } else {
        next = spliceMarkdownBlocks(
          baseBlocks,
          blockIndex,
          pasteCtx?.offset ?? 0,
          pasteCtx?.currentText ?? '',
          pasteCtx?.currentMarks ?? [],
          parsed,
        );
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
        scheduleCaret({
          blockIndex: focusIdx,
          position: 'end',
          listItemIndex: Math.max(0, focusBlock.items.length - 1),
        }, next);
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
      }
      return;
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
    if (!options?.skipDedup && !markDocPasteHandled()) return;
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
      next = spliceMarkdownBlocks(
        baseBlocks,
        pasteIdx,
        pasteOffset,
        pasteText,
        pasteMarks,
        parsed,
      );
    } else {
      next = spliceMarkdownBlocks(
        baseBlocks,
        pasteIdx,
        pasteOffset,
        pasteText,
        pasteMarks,
        parsed,
      );
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
      scheduleCaret({
        blockIndex: focusIdx,
        position: 'start',
        listItemIndex: 0,
      }, next);
    } else if (focusBlock && isTextBlock(focusBlock)) {
      const pastedBlock = parsed[0];
      const caretPos = parsed.length === 1
        && pastedBlock
        && isTextBlock(pastedBlock)
        && pastedBlock.type === focusBlock.type
        && pastedBlock.type !== 'paragraph'
        ? pastedBlock.text.length
        : focusBlock.text.length;
      scheduleCaret({ blockIndex: focusIdx, position: caretPos }, next);
      const el = blockRefs.current.get(focusBlock.id) ?? editable;
      requestAnimationFrame(() => restoreCaretInEditable(el, caretPos));
    }
  }, [
    onBlocksChange,
    onActiveBlockChange,
    scheduleCaret,
    armPasteCaretGuard,
    restoreCaretInEditable,
    markDocPasteHandled,
    resolveActiveDocSelection,
    clearActiveDocSelection,
  ]);

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
    if (!markDocPasteHandled()) return;

    const cachedBlocks = resolvePasteBlocks(null, normalized);
    if (cachedBlocks?.length) {
      pasteDocBlocksAtEditable(cachedBlocks, editable, { skipDedup: true });
      return;
    }

    if (replaceActiveSelectionWithText(normalized)) return;

    if (
      isCrossBlockEditableSelection(
        blocksRef.current,
        blockRefs.current,
        docSelectionRef.current,
        savedTextSelectionRef.current,
      )
    ) {
      insertPlainTextAtCursor(normalized, null, editable);
      return;
    }

    const ctx = resolveEditablePasteContext(editable, blocksRef.current);
    if (!ctx) return;

    const block = blocksRef.current[ctx.blockIndex];
    if (!block) return;

    if (
      isTextBlock(block)
      && editable.dataset.docEditable !== undefined
      && editable.dataset.listRoot === undefined
    ) {
      armPasteCaretGuard();

      const sel = window.getSelection();
      const hasLiveRange = !!(
        sel
        && sel.rangeCount > 0
        && !sel.isCollapsed
        && sel.anchorNode
        && sel.focusNode
        && editable.contains(sel.anchorNode)
        && editable.contains(sel.focusNode)
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
        onBlocksChange(next, false);
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
  }, [
    insertPlainTextAtCursor,
    replaceActiveSelectionWithText,
    pasteDocBlocksAtEditable,
    resolvePasteBlocks,
    armPasteCaretGuard,
    restoreCaretInEditable,
    onBlocksChange,
    onActiveBlockChange,
    markDocPasteHandled,
  ]);

  pastePlainTextRefFn.current = pastePlainTextAtEditable;
  pasteDocBlocksRefFn.current = pasteDocBlocksAtEditable;

  const capturePasteContext = useCallback((text: string) => {
    const sel = window.getSelection();
    const focusNode = sel?.focusNode
      ?? (document.activeElement instanceof Node ? document.activeElement : null);
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
        pendingPasteContextRef.current = {
          blockIndex,
          offset,
          currentText,
          currentMarks,
          tableCell,
        };
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
      blockIndex,
      offset,
      currentText,
      currentMarks,
      ...(listItemIndex != null ? { listItemIndex } : {}),
    };
    setPendingMarkdown(text);
    setMarkdownDialogOpen(true);
  }, []);

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

    const clipBlocks = resolvePasteBlocks(
      e.clipboardData,
      getClipboardTextFromDataTransfer(e.clipboardData),
    );
    if (clipBlocks?.length) {
      pasteDocBlocksAtEditable(clipBlocks, el);
      return;
    }

    handleEditablePasteEvent(e, el, capturePasteContextRefFn.current, pastePlainTextRefFn.current);
  }, [handleInsertImage, pasteDocBlocksAtEditable, resolvePasteBlocks, markDocPasteHandled]);

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

        // 必须同步 preventDefault，否则浏览器默认 paste 会与自定义粘贴叠加（内容翻倍）
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
            handlePasteKeyboardEvent(
              e,
              root,
              capturePasteContextRefFn.current,
              pastePlainTextRefFn.current,
              getFallbackPasteEditable,
            );
          })();
          return;
        }

        handlePasteKeyboardEvent(
          e,
          root,
          capturePasteContextRefFn.current,
          pastePlainTextRefFn.current,
          getFallbackPasteEditable,
        );
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [handleInsertImage, getFallbackPasteEditable, markDocPasteHandled]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (e.isComposing) return;
      if (hasActiveDocSelection()) return;

      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLElement && activeEl.isContentEditable && activeEl.dataset.docEditable !== undefined) {
        return;
      }

      const blocks = blocksRef.current;
      let idx =
        selectedImageIndexRef.current
        ?? selectedTableIndexRef.current
        ?? selectedBaseIndexRef.current
        ?? selectedWhiteboardIndexRef.current
        ?? selectedCodeIndexRef.current
        ?? null;

      if (idx == null) {
        const activeIdx = activeIndexRef.current;
        if (blocks[activeIdx]?.type === 'divider') idx = activeIdx;
      }

      if (idx == null) return;

      const block = blocks[idx];
      if (!block) return;
      if (block.type !== 'image' && block.type !== 'table' && block.type !== 'base' && block.type !== 'divider'
        && block.type !== 'code' && block.type !== 'mermaid') {
        return;
      }

      if (block.type === 'table' && activeEl instanceof HTMLElement) {
        const tableRoot = blockRefs.current.get(block.id);
        if (tableRoot?.contains(activeEl) && activeEl.isContentEditable) return;
      }

      if (block.type === 'base' && activeEl instanceof HTMLElement) {
        const baseRoot = blockRefs.current.get(block.id);
        if (baseRoot?.contains(activeEl)) return;
      }

      if ((block.type === 'code' || block.type === 'mermaid') && activeEl instanceof HTMLElement) {
        if (activeEl.closest('[data-doc-code-ui]') || activeEl.closest('[data-doc-mermaid-ui]')) return;
      }

      e.preventDefault();
      handleDeleteBlock(idx);
      setSelectedImageIndex(null);
      setSelectedTableIndex(null);
      setSelectedBaseIndex(null);
      setSelectedCodeIndex(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleDeleteBlock]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (e.isComposing) return;

      const root = editorRef.current;
      if (!root) return;

      if (!resolveActiveDocSelection()) return;

      const active = document.activeElement;
      const focusInEditor = active instanceof Node && root.contains(active);
      const blockSelection = docSelectionRef.current && !isCollapsedDocSelection(docSelectionRef.current);
      const focusNode = window.getSelection()?.focusNode;
      const selectionInEditor = focusNode instanceof Node && root.contains(focusNode);
      if (!focusInEditor && !blockSelection && !selectionInEditor) return;

      e.preventDefault();
      e.stopPropagation();
      handleDeleteDocSelection();
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [handleDeleteDocSelection, resolveActiveDocSelection]);

  useEffect(() => {
    const getSelectedObjectIndex = () =>
      selectedImageIndexRef.current
      ?? selectedTableIndexRef.current
      ?? selectedBaseIndexRef.current
      ?? selectedWhiteboardIndexRef.current
      ?? selectedCodeIndexRef.current
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

    const onCopy = (e: ClipboardEvent) => {
      if (!shouldHandleCopy()) return;

      const focusNode = window.getSelection()?.focusNode
        ?? (document.activeElement instanceof Node ? document.activeElement : null);

      const payload = resolveDocCopyPayload({
        blocks: blocksRef.current,
        blockEls: blockRefs.current,
        docSelection: hasActiveDocSelection() ? docSelectionRef.current : null,
        savedNativeDetail: savedTextSelectionRef.current,
        focusNode,
        selectedBlockIndex: getSelectedObjectIndex(),
      });

      if (!payload?.blocks.length) return;

      e.preventDefault();
      writeDocCopyToClipboard(e.clipboardData, payload);
      lastDocCopyPayloadRef.current = {
        plainText: payload.plainText,
        blocks: payload.blocks.map(block => cloneDocBlock(block)),
      };
    };
    document.addEventListener('copy', onCopy, true);
    return () => document.removeEventListener('copy', onCopy, true);
  }, [hasActiveDocSelection]);

  const navigateDocArrow = useCallback((key: string): boolean => {
    const root = editorRef.current;
    if (!root?.contains(document.activeElement)) return false;

    const ctx = getFocusedDocContext(root);
    const allBlocks = blocksRef.current;

    if (hasActiveDocSelection()) {
      setDocSelection(null);
      focusBlockAt(activeIndexRef.current, key === 'ArrowUp' ? 'end' : 'start');
      return true;
    }

    if (ctx.kind === 'title' && ctx.editable) {
      if (key === 'ArrowDown') {
        const idx = findNearestTextBlockIndex(allBlocks, 0, 1);
        if (idx >= 0) focusBlockAt(idx, 'start');
        return true;
      }
      return false;
    }

    if (ctx.kind === 'none' || !ctx.editable) return false;

    if (ctx.kind === 'code' || ctx.kind === 'mermaid') {
      const el = ctx.editable;
      if (key === 'ArrowUp' && ctx.blockIndex > 0) {
        const ta = el instanceof HTMLTextAreaElement ? el : null;
        if (!ta || ta.selectionStart === 0) {
          const prev = findNearestTextBlockIndex(allBlocks, ctx.blockIndex - 1, -1);
          if (prev >= 0) { focusBlockAt(prev, 'end'); return true; }
        }
      }
      if (key === 'ArrowDown' && ctx.blockIndex < allBlocks.length - 1) {
        const ta = el instanceof HTMLTextAreaElement ? el : null;
        if (!ta || ta.selectionStart === ta.value.length) {
          const next = findNearestTextBlockIndex(allBlocks, ctx.blockIndex + 1, 1);
          if (next >= 0) { focusBlockAt(next, 'start'); return true; }
        }
      }
      return false;
    }

    const blockIndex = ctx.blockIndex;
    if (blockIndex < 0) return false;
    const block = allBlocks[blockIndex];
    const el = ctx.editable;

    if (ctx.kind === 'list' && block.type === 'list') {
      const listRoot = (el?.dataset.listRoot !== undefined ? el : blockRefs.current.get(block.id)) as HTMLElement | null;
      if (!listRoot) return false;
      const caretCtx = getListCaretContext(listRoot);
      if (!caretCtx) return false;
      const textEl = getListItemTextEl(listRoot, caretCtx.focusItemIndex);
      if (!textEl) return false;
      const itemIndex = caretCtx.focusItemIndex;

      if (key === 'ArrowUp' && isCaretAtStart(textEl)) {
        if (itemIndex > 0) {
          focusBlockAt(blockIndex, 'end', itemIndex - 1);
          return true;
        }
        const prev = findNearestTextBlockIndex(allBlocks, blockIndex - 1, -1);
        if (prev >= 0) { focusBlockAt(prev, 'end'); return true; }
        return false;
      }
      if (key === 'ArrowDown' && isCaretAtEnd(textEl)) {
        if (itemIndex < block.items.length - 1) {
          focusBlockAt(blockIndex, 'start', itemIndex + 1);
          return true;
        }
        const next = findNearestTextBlockIndex(allBlocks, blockIndex + 1, 1);
        if (next >= 0) { focusBlockAt(next, 'start'); return true; }
        return false;
      }
      if (key === 'ArrowLeft' && isCaretAtStart(textEl) && blockIndex > 0) {
        const prev = findNearestTextBlockIndex(allBlocks, blockIndex - 1, -1);
        if (prev >= 0) { focusBlockAt(prev, 'end'); return true; }
      }
      if (key === 'ArrowRight' && isCaretAtEnd(textEl) && blockIndex < allBlocks.length - 1) {
        const next = findNearestTextBlockIndex(allBlocks, blockIndex + 1, 1);
        if (next >= 0) { focusBlockAt(next, 'start'); return true; }
      }
      return false;
    }

    if (!isTextBlock(block)) return false;

    if (key === 'ArrowUp' && isCaretAtStart(el)) {
      if (blockIndex === 0) {
        const titleEl = root.querySelector('[data-doc-title][contenteditable]') as HTMLElement | null;
        titleEl?.focus();
        return !!titleEl;
      }
      const prev = findNearestTextBlockIndex(allBlocks, blockIndex - 1, -1);
      if (prev >= 0) { focusBlockAt(prev, 'end'); return true; }
      return false;
    }
    if (key === 'ArrowDown' && isCaretAtEnd(el)) {
      const next = findNearestTextBlockIndex(allBlocks, blockIndex + 1, 1);
      if (next >= 0) { focusBlockAt(next, 'start'); return true; }
      return false;
    }
    if (key === 'ArrowLeft' && isCaretAtStart(el) && blockIndex > 0) {
      const prev = findNearestTextBlockIndex(allBlocks, blockIndex - 1, -1);
      if (prev >= 0) { focusBlockAt(prev, 'end'); return true; }
    }
    if (key === 'ArrowRight' && isCaretAtEnd(el) && blockIndex < allBlocks.length - 1) {
      const next = findNearestTextBlockIndex(allBlocks, blockIndex + 1, 1);
      if (next >= 0) { focusBlockAt(next, 'start'); return true; }
    }
    return false;
  }, [focusBlockAt, findNearestTextBlockIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (navigateDocArrow(e.key)) e.preventDefault();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [navigateDocArrow]);

  const selectObjectBlock = useCallback((idx: number) => {
    const block = blocksRef.current[idx];
    if (!block) return;
    if (block.type === 'image') keepImageSelected(idx);
    else if (block.type === 'code' || block.type === 'mermaid') keepCodeSelected(idx);
    else if (block.type === 'table') keepTableSelected(idx);
    else if (block.type === 'base') keepBaseSelected(idx);
    else if (block.type === 'whiteboard') keepWhiteboardSelected(idx);
    else if (block.type === 'divider') {
      setSelectedImageIndex(null);
      setSelectedCodeIndex(null);
      setSelectedTableIndex(null);
      setSelectedBaseIndex(null);
      setSelectedWhiteboardIndex(null);
      setActiveIndex(idx);
      onActiveBlockChange(idx);
    }
  }, [keepImageSelected, keepCodeSelected, keepTableSelected, keepBaseSelected, keepWhiteboardSelected, onActiveBlockChange]);

  const focusBlockFromPointer = useCallback((clientX: number, clientY: number) => {
    const blocks = blocksRef.current;
    const editorEl = editorRef.current;
    if (!editorEl) return;

    const anchor = resolveAnchorFromPoint(clientX, clientY, blocks);
    if (anchor?.kind === 'title') return;

    if (anchor?.kind === 'block') {
      const block = blocks[anchor.blockIndex];
      if (!block) return;

      if (isTextBlock(block) || block.type === 'list') {
        if (anchor.sub.kind === 'text') {
          focusBlockAt(anchor.blockIndex, anchor.sub.offset);
        } else if (anchor.sub.kind === 'list') {
          focusBlockAt(anchor.blockIndex, anchor.sub.offset, anchor.sub.itemIndex);
        } else {
          const row = editorEl.querySelector(`[data-block-row="${anchor.blockIndex}"]`) as HTMLElement | null;
          focusBlockAt(anchor.blockIndex, resolveClickCaretPosition(clientY, row));
        }
        refreshToolbarState(anchor.blockIndex);
        setActiveHandleIndex(null);
        return;
      }

      selectObjectBlock(anchor.blockIndex);
      return;
    }

    const blockIndex = resolveBlockIndexFromClientY(clientY, editorEl);
    if (blockIndex < 0) return;

    const block = blocks[blockIndex];
    if (!block) return;

    const row = editorEl.querySelector(`[data-block-row="${blockIndex}"]`) as HTMLElement | null;
    const position = resolveClickCaretPosition(clientY, row);

    if (isTextBlock(block) || block.type === 'list') {
      focusBlockAt(blockIndex, position);
      refreshToolbarState(blockIndex);
      setActiveHandleIndex(null);
      return;
    }

    selectObjectBlock(blockIndex);
  }, [focusBlockAt, refreshToolbarState, selectObjectBlock]);

  const isNativeTextSelectionTarget = (target: Node): boolean => {
    if (!(target instanceof Element)) return false;
    if (target.closest('[data-doc-title]')) return true;
    if (target.closest('[data-doc-editable], [data-list-root], [data-list-text], [data-list-marker]')) return true;
    if (target.closest('[data-doc-code-ui] textarea, [data-doc-mermaid-ui] textarea')) return true;
    return false;
  };

  const handleEditorMouseDown = (e: React.MouseEvent) => {
    if (readOnly) return;
    const target = e.target as Node;
    if (target instanceof Element && (
      target.closest('[data-doc-block-insert-menu]')
      || target.closest('[data-doc-table-picker]')
    )) return;

    if (target instanceof Element && target.closest('[data-doc-title]')) return;

    // 正文/列表内拖拽选字时不启动块级选区，避免清除原生选区（首项无法选中等）
    if (!e.shiftKey && isNativeTextSelectionTarget(target)) {
      setDocSelection(null);
      setSelectedImageIndex(null);
      setSelectedCodeIndex(null);
      setSelectedTableIndex(null);
      setSelectedBaseIndex(null);
      dragAnchor.current = null;
      dragStartAnchor.current = null;
      dragMoved.current = false;
      isDragging.current = false;
      startTextSelectDrag(
        resolveAnchorFromPoint(e.clientX, e.clientY, blocksRef.current)
          ?? resolveAnchorFromNode(target, blocksRef.current),
      );
      return;
    }
    finishTextSelectDrag();

    let idx = findBlockIndexFromNode(target);
    let anchor = resolveAnchorFromNode(target, blocksRef.current);

    if (idx < 0 && editorRef.current?.contains(target)) {
      const pointAnchor = resolveAnchorFromPoint(e.clientX, e.clientY, blocksRef.current);
      if (pointAnchor?.kind === 'block') {
        idx = pointAnchor.blockIndex;
        anchor = pointAnchor;
      } else {
        const fromY = resolveBlockIndexFromClientY(e.clientY, editorRef.current);
        if (fromY >= 0) {
          idx = fromY;
          anchor = blockAnchor(fromY);
        }
      }
    }

    if (idx < 0) {
      setDocSelection(null);
      setActiveHandleIndex(null);
      return;
    }

    if (e.shiftKey && anchor) {
      const baseAnchor = docSelectionRef.current?.anchor
        ?? blockAnchor(activeIndexRef.current);
      const next: DocSelection = { anchor: baseAnchor, focus: anchor };
      setDocSelection(next);
      applyDocSelectionVisual(next);
      setSelectedImageIndex(null);
      setSelectedCodeIndex(null);
      setSelectedTableIndex(null);
      setSelectedBaseIndex(null);
      e.preventDefault();
      return;
    }

    dragAnchor.current = idx;
    dragStartAnchor.current = anchor ?? blockAnchor(idx);
    dragMoved.current = false;
    isDragging.current = true;
    setDocSelection(null);
    setSelectedImageIndex(null);
    setSelectedCodeIndex(null);
    setSelectedTableIndex(null);
    setSelectedBaseIndex(null);
  };

  const handleEditorMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || e.buttons !== 1 || dragAnchor.current == null) return;
    dragMoved.current = true;

    const focus = resolveAnchorFromPoint(e.clientX, e.clientY, blocksRef.current)
      ?? resolveAnchorFromNode(e.target as Node, blocksRef.current);
    const startAnchor = dragStartAnchor.current ?? blockAnchor(dragAnchor.current);
    if (!focus) return;

    const next: DocSelection = { anchor: startAnchor, focus };
    setDocSelection(next);
    applyDocSelectionVisual(next);
    setSelectedImageIndex(null);
    setSelectedCodeIndex(null);
    setSelectedTableIndex(null);
    setSelectedBaseIndex(null);
  };

  const handleEditorMouseUp = (e?: React.MouseEvent) => {
    finishTextSelectDrag();
    const wasDragging = isDragging.current;
    const moved = dragMoved.current;
    const anchorIdx = dragAnchor.current;
    isDragging.current = false;
    dragAnchor.current = null;
    dragStartAnchor.current = null;
    dragMoved.current = false;

    const sel = docSelectionRef.current;
    if (sel && !isCollapsedDocSelection(sel)) {
      applyDocSelectionVisual(sel);
      const indices = getSelectionBlockIndices(sel, blocksRef.current);
      const focusIdx = indices?.[0] ?? activeIndexRef.current;
      refreshToolbarState(focusIdx);
      onActiveBlockChange(focusIdx);
      setActiveIndex(focusIdx);
      return;
    }

    if (wasDragging && anchorIdx != null && !moved) {
      setDocSelection(null);
      if (e) {
        focusBlockFromPointer(e.clientX, e.clientY);
      } else {
        selectObjectBlock(anchorIdx);
      }
    }
  };

  const getBlockSelectionHighlight = useCallback((index: number): BlockSelectionState => {
    return getBlockSelectionState(docSelection, index, blocks);
  }, [docSelection, blocks]);

  const COMMENT_AUTHOR = commentAuthor ?? { authorId: 'local', authorName: '当前用户' };
  const commentsActive = commentsEnabled;
  const commentToolbarVisible = commentsEnabled;

  const scrollToCommentAnchor = useCallback((threadId: string) => {
    const thread = commentThreads.find(t => t.id === threadId);
    if (!thread) return;
    const el = blockRefs.current.get(thread.anchor.blockId)
      ?? document.querySelector(`[data-block-id="${thread.anchor.blockId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [commentThreads]);

  const handleSelectComment = useCallback((id: string) => {
    setSelectedCommentId(id);
    scrollToCommentAnchor(id);
  }, [scrollToCommentAnchor]);

  const handleAddComment = useCallback(() => {
    if (!canComment) return;
    const detail = getNativeTextSelectionDetail(blocksRef.current, blockRefs.current);
    if (!detail || detail.collapsed || !detail.slices.length) return;
    const slice = detail.slices[0];
    const draft = createEmptyCommentThread({
      blockId: blocksRef.current[slice.blockIndex]?.id ?? '',
      start: 0,
      end: 0,
      quote: '',
    });
    const applied = applyCommentMarkFromSlice(blocksRef.current, slice, draft.id);
    if (!applied) return;
    const thread = { ...draft, anchor: applied.anchor };
    const prevThreads = commentThreadsRef.current;
    const prevBlocks = blocksRef.current;
    setCommentThreads(prev => [...prev, thread]);
    onBlocksChange(applied.blocks, true);
    setShowCommentPanel(true);
    setSelectedCommentId(thread.id);

    void (async () => {
      try {
        const saved = await onPersistCommentCreate?.({ thread, blocks: applied.blocks });
        if (saved) {
          setCommentThreads(prev => prev.map(t => (t.id === thread.id ? saved : t)));
        }
      } catch {
        setCommentThreads(prevThreads);
        onBlocksChange(prevBlocks, false);
        setSelectedCommentId(null);
      }
    })();
  }, [canComment, onBlocksChange, onPersistCommentCreate]);

  const handleCommentReply = useCallback((threadId: string, text: string) => {
    if (!canComment) return;
    const prevThreads = commentThreadsRef.current;
    setCommentThreads(prev => appendCommentReply(prev, threadId, {
      ...COMMENT_AUTHOR,
      text,
    }));
    void (async () => {
      try {
        const saved = await onPersistCommentReply?.(threadId, text);
        if (!saved) return;
        setCommentThreads(prev => prev.map(thread => {
          if (thread.id !== threadId) return thread;
          if (thread.replies.some(r => r.id === saved.id)) return thread;
          const idx = thread.replies.findIndex(
            r => r.text === text && r.authorId === COMMENT_AUTHOR.authorId,
          );
          if (idx >= 0) {
            const replies = [...thread.replies];
            replies[idx] = saved;
            return { ...thread, replies };
          }
          return { ...thread, replies: [...thread.replies, saved] };
        }));
      } catch {
        setCommentThreads(prevThreads);
      }
    })();
  }, [canComment, onPersistCommentReply, commentAuthor]);

  const handleCommentResolve = useCallback((threadId: string) => {
    if (!canComment) return;
    const prevThreads = commentThreadsRef.current;
    const prevBlocks = blocksRef.current;
    setCommentThreads(prev => resolveCommentThread(prev, threadId));
    const nextBlocks = removeCommentMarksFromBlocks(blocksRef.current, threadId);
    onBlocksChange(nextBlocks, true);
    setSelectedCommentId(cur => (cur === threadId ? null : cur));
    void (async () => {
      try {
        await onPersistCommentResolve?.(threadId);
      } catch {
        setCommentThreads(prevThreads);
        onBlocksChange(prevBlocks, false);
      }
    })();
  }, [canComment, onBlocksChange, onPersistCommentResolve]);

  const handleCommentEdit = useCallback((threadId: string, replyId: string, text: string) => {
    if (!canComment) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const prevThreads = commentThreadsRef.current;
    setCommentThreads(prev => updateCommentReply(prev, threadId, replyId, trimmed));
    void (async () => {
      try {
        const saved = await onPersistCommentEdit?.(threadId, replyId, trimmed);
        if (!saved) return;
        setCommentThreads(prev => prev.map(thread => {
          if (thread.id !== threadId) return thread;
          return {
            ...thread,
            replies: thread.replies.map(reply => (reply.id === replyId ? saved : reply)),
          };
        }));
      } catch {
        setCommentThreads(prevThreads);
      }
    })();
  }, [canComment, onPersistCommentEdit]);

  const handleCommentDelete = useCallback((threadId: string, replyId: string) => {
    if (!canComment) return;
    const prevThreads = commentThreadsRef.current;
    const prevBlocks = blocksRef.current;
    const nextThreads = deleteCommentReply(commentThreadsRef.current, threadId, replyId);
    const threadRemoved = !nextThreads.some(t => t.id === threadId);
    setCommentThreads(nextThreads);
    if (threadRemoved) {
      const nextBlocks = removeCommentMarksFromBlocks(blocksRef.current, threadId);
      onBlocksChange(nextBlocks, true);
      setSelectedCommentId(cur => (cur === threadId ? null : cur));
    }
    void (async () => {
      try {
        await onPersistCommentDelete?.(threadId, replyId);
      } catch {
        setCommentThreads(prevThreads);
        onBlocksChange(prevBlocks, false);
      }
    })();
  }, [canComment, onBlocksChange, onPersistCommentDelete]);

  const handleCommentLike = useCallback((threadId: string, replyId: string) => {
    const thread = commentThreadsRef.current.find(t => t.id === threadId);
    const reply = thread?.replies.find(r => r.id === replyId);
    if (!reply) return;
    const prevLiked = !!reply.likedByMe;
    const prevCount = reply.likeCount ?? 0;
    const optimisticLiked = !prevLiked;
    const optimisticCount = Math.max(0, prevCount + (optimisticLiked ? 1 : -1));
    const prevThreads = commentThreadsRef.current;
    setCommentThreads(prev => toggleCommentReplyLike(prev, threadId, replyId, optimisticLiked, optimisticCount));
    void (async () => {
      try {
        const saved = await onPersistCommentLike?.(threadId, replyId);
        if (!saved) return;
        setCommentThreads(prev => toggleCommentReplyLike(
          prev, threadId, replyId, saved.liked, saved.likeCount,
        ));
      } catch {
        setCommentThreads(prevThreads);
      }
    })();
  }, [onPersistCommentLike]);

  const handleEditorClick = useCallback((e: React.MouseEvent) => {
    const mark = (e.target as HTMLElement).closest('[data-doc-comment]') as HTMLElement | null;
    const id = mark?.dataset.docComment;
    if (!id) return;
    setShowCommentPanel(true);
    setSelectedCommentId(id);
  }, []);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: fullscreen ? '100vh' : '100%', width: fullscreen ? '100vw' : '100%',
      position: fullscreen ? 'fixed' : 'relative',
      top: fullscreen ? 0 : undefined, left: fullscreen ? 0 : undefined,
      zIndex: fullscreen ? 9999 : undefined, background: DOC_PAGE_BG,
    }}>
      {!readOnly && (
      <DocToolbar
        state={toolbarState}
        onAction={handleToolbarAction}
        showOutline={showOutline && !showCommentPanel}
        showComments={commentToolbarVisible && showCommentPanel}
        onToggleComments={commentToolbarVisible ? () => setShowCommentPanel(v => !v) : undefined}
        onToggleOutline={onToggleOutline}
        onToggleFullscreen={onToggleFullscreen}
        onInsertImage={() => setImagePickerOpen(true)}
        insertMenuAnchorRef={toolbarInsertAnchorRef}
      />
      )}
      {readOnly && commentToolbarVisible && (
        <DocCommentToolbarBar
          showComments={showCommentPanel}
          showOutline={showOutline && !showCommentPanel}
          onToggleComments={() => setShowCommentPanel(v => !v)}
          onToggleOutline={onToggleOutline}
          onToggleFullscreen={onToggleFullscreen}
        />
      )}

      {!readOnly && toolbarInsertMenuOpen && (
        <DocBlockInsertMenu
          open
          anchorRef={toolbarInsertAnchorRef}
          placement="bottom"
          onClose={() => setToolbarInsertMenuOpen(false)}
          onInsert={(kind, tableSize) => {
            const blocksLen = blocksRef.current.length;
            const insertAt = blocksLen > 0
              ? Math.min(activeIndexRef.current, blocksLen - 1)
              : -1;
            handleInsertBelow(insertAt, kind, tableSize);
            setToolbarInsertMenuOpen(false);
          }}
        />
      )}

      <DocImageInsertDialog
        open={imagePickerOpen}
        onClose={() => setImagePickerOpen(false)}
        onInsert={handleInsertImage}
      />

      <MarkdownConvertDialog
        open={markdownDialogOpen}
        onConvert={applyMarkdownPaste}
        onDismiss={dismissMarkdownPaste}
      />

      {commentsActive && canComment && !readOnly && (
        <DocTextSelectionComment
          editorRef={editorRef}
          scrollRef={scrollRef}
          enabled={commentsActive && canComment && !readOnly}
          blockSelectionActive={!!docSelection && !isCollapsedDocSelection(docSelection)}
          onAddComment={handleAddComment}
        />
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <DocHistoryRevisionProvider value={historyRevision}>
        <div ref={scrollRef} onScroll={() => {
          const container = scrollRef.current;
          if (!container) return;
          const tops = new Map<string, number>();
          blocks.forEach(b => {
            const el = blockRefs.current.get(b.id);
            if (el) tops.set(b.id, el.offsetTop);
          });
          setActiveOutlineId(findActiveOutlineId(blocks, tops, container.scrollTop));
        }} style={{ flex: 1, overflow: 'auto', padding: '24px 0' }}>
          <div
            ref={editorRef}
            onMouseDown={handleEditorMouseDown}
            onClick={handleEditorClick}
            onMouseMove={handleEditorMouseMove}
            onMouseUp={handleEditorMouseUp}
            onMouseLeave={handleEditorMouseUp}
            style={{
              position: 'relative',
              maxWidth: DOC_EDITOR_MAX_WIDTH, margin: '0 auto', background: '#fff',
              minHeight: 'calc(100% - 48px)', padding: '32px 48px 32px 64px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)', borderRadius: 4,
              userSelect: 'text', WebkitUserSelect: 'text',
            }}
          >
            <DocSelectionOverlay
              containerRef={editorRef}
              docSelection={docSelection}
              blocks={blocks}
              blockRefs={blockRefs}
            />
            <DocTitleEditor
              title={title}
              onChange={onTitleChange ?? (() => {})}
              readOnly={readOnly}
            />
            {blocks.map((block, index) => (
              <DocBlockWrapper
                key={block.id}
                block={block}
                index={index}
                readOnly={readOnly}
                isHandleActive={activeHandleIndex === index}
                dragState={blockDragState}
                onHandleActivate={setActiveHandleIndex}
                onHandleDeactivate={() => setActiveHandleIndex(null)}
                onDragStart={i => handleBlockDragStart(i)}
                onDelete={() => handleDeleteBlock(index)}
                onCopy={() => handleCopyBlock(index)}
                onTextColor={color => handleBlockTextColor(index, color)}
                onBackgroundColor={color => handleBlockBackgroundColor(index, color)}
                onInsertBelow={(kind, tableSize) => handleInsertBelow(index, kind, tableSize)}
                onGapClick={(_index, clientX, clientY) => focusBlockFromPointer(clientX, clientY)}
              >
              <DocBlockView
                key={block.id}
                block={block}
                index={index}
                readOnly={readOnly}
                active={activeIndex === index}
                placeholder={index === 0 && block.type === 'paragraph' ? DOC_BODY_PLACEHOLDER : ''}
                placeholderColor={DOC_PLACEHOLDER_BODY_COLOR}
                imageSelected={selectedImageIndex === index}
                codeSelected={selectedCodeIndex === index}
                tableSelected={selectedTableIndex === index}
                baseSelected={selectedBaseIndex === index}
                whiteboardSelected={selectedWhiteboardIndex === index}
                maxImageWidth={maxImageWidth}
                selectionState={getBlockSelectionHighlight(index)}
                onImageSelect={() => keepImageSelected(index)}
                onCodeSelect={() => keepCodeSelected(index)}
                onTableSelect={() => keepTableSelected(index)}
                onBaseSelect={() => keepBaseSelected(index)}
                onWhiteboardSelect={() => keepWhiteboardSelected(index)}
                onFocus={() => {
                  if (!isDragging.current) setDocSelection(null);
                  setActiveIndex(index);
                  onActiveBlockChange(index);
                  refreshToolbarState(index);
                  if (block.type !== 'image') setSelectedImageIndex(null);
                  if (block.type !== 'code' && block.type !== 'mermaid') setSelectedCodeIndex(null);
                  if (block.type !== 'table') setSelectedTableIndex(null);
                  if (block.type !== 'base') setSelectedBaseIndex(null);
                  if (block.type !== 'whiteboard') setSelectedWhiteboardIndex(null);
                  setActiveHandleIndex(null);
                }}
                onChange={(b, recordHistory) => handleBlockChange(index, b, recordHistory)}
                onImagePatch={(patch, recordHistory) => handleImagePatch(index, patch, recordHistory)}
                onEnter={(cursorOffset, fullText, marks) => handleEnter(index, cursorOffset, fullText, marks)}
                onTab={() => handleTabIndent(index)}
                onBackspaceEmpty={() => handleBackspaceEmpty(index)}
                onBackspaceAtStart={() => handleBackspaceMerge(index)}
                onDeleteAtEnd={() => handleDeleteAtEnd(index)}
                onRegisterRef={registerRef}
                onNativePaste={handleEditablePaste}
                onListItemCheck={(itemIndex, checked) => {
                  if (block.type !== 'list') return;
                  const items = [...block.items];
                  items[itemIndex] = { ...items[itemIndex], checked };
                  handleBlockChange(index, { ...block, items });
                }}
                onListEnter={(itemIndex, cursorOffset, fullText) =>
                  handleListEnter(index, itemIndex, cursorOffset, fullText)}
                onListBackspace={(itemIndex, atStart, text) =>
                  handleListBackspace(index, itemIndex, atStart, text)}
                onListTab={(itemIndex, shiftKey) =>
                  handleListTab(index, itemIndex, shiftKey)}
                onListDeleteItemAtEnd={(itemIndex, fullText) =>
                  handleListDeleteItemAtEnd(index, itemIndex, fullText)}
                consumePendingCaret={consumePendingCaret}
                releasePendingCaret={releasePendingCaret}
                applyPendingCaret={applyPendingCaret}
              />
              </DocBlockWrapper>
            ))}
          </div>
        </div>

        {commentsActive && showCommentPanel && (
          <DocCommentPanel
            threads={commentThreads}
            selectedId={selectedCommentId}
            onSelect={handleSelectComment}
            onClose={() => setShowCommentPanel(false)}
            onResolve={handleCommentResolve}
            onReply={handleCommentReply}
            onEditReply={handleCommentEdit}
            onDeleteReply={handleCommentDelete}
            onLikeReply={handleCommentLike}
            canComment={canComment}
            currentAuthorId={COMMENT_AUTHOR.authorId}
            currentAuthorName={COMMENT_AUTHOR.authorName}
            currentAuthorAvatar={commentAuthor?.authorAvatar}
          />
        )}

        {!showCommentPanel && showOutline && (
          <DocOutline nodes={outline} activeId={activeOutlineId} onNavigate={blockId => {
            const el = blockRefs.current.get(blockId) || document.querySelector(`[data-block-id="${blockId}"]`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }} />
        )}
        </DocHistoryRevisionProvider>
      </div>
    </div>
  );
};

function trimMarks(marks: TextMark[], len: number): TextMark[] {
  return marks.filter(m => m.start < len && m.end > 0).map(m => ({
    ...m, start: Math.max(0, m.start), end: Math.min(len, m.end),
  }));
}

export type { DocSelectionContext };
