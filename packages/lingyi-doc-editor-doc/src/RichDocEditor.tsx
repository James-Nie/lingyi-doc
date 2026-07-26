import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { DocBlock, ImageBlock, OutlineNode, ToolbarState, ParagraphStyle, ListType, OrderedListStyle, BlockAlign, TextMark, DocSelectionContext, PendingCaret, PendingCaretSpec, DocSelection, BlockSelectionState, DocAnchor } from '@lingyi-doc/core-doc';
import { findActiveOutlineId, increaseBlockIndent, decreaseBlockIndent, isTextBlock, isObjectBlock, splitMarks, stripLeadingNewlines, findBlockIndexFromNode, findEditableRoot, getFocusedDocContext, isDocumentBodyContext, getSelectionBlockRange, getInlineStateFromSelection, selectElementContents, saveSelection, restoreSelection, extractContentFromEditable, extractPlainText, setCaretOffset, getCaretOffset, hasNonCollapsedTextSelection, isCaretAtStart, isCaretAtEnd, applyBlockTextMark, cloneDocBlock, marksToHtml, parseMarkdownToBlocks, spliceMarkdownBlocks, parseMarkdownTable, markdownTableDataToTableBlock, insertTableBlockAt, blocksToCellContent, spliceMarkdownIntoCellContent, applyMarkdownTableToTableBlock, createEmptyTable, createEmptyMermaid, createEmptyBaseBlock, createEmptyWhiteboardBlock, createFlowchartWhiteboardBlock, createMindmapWhiteboardBlock, splitListItemOnEnter, isListItemTextEmpty, listItemToParagraphBlocks, indentListItem, outdentListItem, parseOrderedListMarkdownLine, parseBulletListMarkdownLine, textToListItems, normalizeOrderedListItems, normalizeBulletListItems, extractListItemsFromDom, getListCaretContext, getListItemTextEl, setListItemCaret, getListItemPlainText, focusListItemFromPointer, listDomNeedsFullSync, deleteListItemCharAt, deleteListDomSelection, handleEmptyListItemEnter, handleEmptyListItemBackspace, mergeFollowingBlockIntoList, mergeTextBlockIntoPrecedingList, buildPendingCaret, pendingCaretFromBoundary, applyCaretToBlockEl, applyPendingCaretToBlockEl, isCollapsedDocSelection, getSelectionBlockIndices, getBlockSelectionState, selectAllDocumentBlocks, selectBlockRange, docSelectionToContext, blockAnchor, resolveAnchorFromNode, resolveAnchorFromPoint, resolveBlockIndexFromClientY, resolveClickCaretPosition, applyTextSelectionBetweenAnchors, deleteDocSelectionBlocks, getNativeTextSelectionDetail, type DocCopyPayload, type InlineFormatAction, type NativeTextSelectionDetail, type TextSelectionSlice } from '@lingyi-doc/core-doc';
import { applyCommentMarkFromSlice, applyCommentMarksFromThreads, applyRemoteCommentUpdate, appendCommentReply, createEmptyCommentThread, removeCommentMarksFromBlocks, resolveCommentThread, updateCommentReply, deleteCommentReply, deleteCommentThread, toggleCommentReplyLike, type CommentUpdatePayload, type DocCommentThread, findInDocument, groupFindHighlights, replaceMatchInDocument, replaceAllInDocument, selectTextOffsetsInEditable, computeRichDocumentTextStats, type FindMatch } from '@lingyi-doc/core-doc';
import { useEditorPaste } from './hooks/useEditorPaste';
import { type MarkdownPasteContext } from './markdownPaste';
import { getImageFileFromClipboard, getImageFileFromClipboardAsync, prepareImageFileForInsert } from '@lingyi-doc/editor-shared';
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
import { DocImageInsertDialog, type InsertImagePayload } from '@lingyi-doc/editor-shared';
import { MarkdownConvertDialog } from './MarkdownConvertDialog';
import { DocLinkDialog } from './DocLinkDialog';
import { DocTitleEditor } from './DocTitleEditor';
import { DocFindReplacePanel, type FindReplaceTab } from './DocFindReplacePanel';
import { DocHistoryRevisionProvider } from './DocHistoryContext';
import { useEditorCaret } from './hooks/useEditorCaret';
import { useEditorSelection } from './hooks/useEditorSelection';
import { useEditorKeyboard } from './hooks/useEditorKeyboard';
import { useEditorMouse } from './hooks/useEditorMouse';
import { useEditorComments } from './hooks/useEditorComments';
import { useEditorSave } from './hooks/useEditorSave';
import { useEditorToolbar } from './hooks/useEditorToolbar';
import { useEditorFindReplace } from './hooks/useEditorFindReplace';
import { useBlockDrag } from './hooks/useBlockDrag';
import { useArrowNavigation } from './hooks/useArrowNavigation';
import { useEditorDeleteCopy } from './hooks/useEditorDeleteCopy';

export interface RichDocEditorSaveRef {
  /** 保存前同步 DOM 编辑态到 model，并保持焦点/选区 */
  flushBeforeSave: () => void;
  /** 记录历史前捕获当前光标（供 undo/redo 恢复） */
  captureHistoryCaret: () => PendingCaretSpec | null;
  /** 撤销/重做后恢复光标 */
  restoreHistoryCaret: (spec: PendingCaretSpec | null) => void;
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
  onBlocksChange: (blocks: DocBlock[], recordHistory?: boolean, skipSave?: boolean) => void;
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
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [selectedCodeIndex, setSelectedCodeIndex] = useState<number | null>(null);
  const [selectedTableIndex, setSelectedTableIndex] = useState<number | null>(null);
  const [selectedBaseIndex, setSelectedBaseIndex] = useState<number | null>(null);
  const [selectedWhiteboardIndex, setSelectedWhiteboardIndex] = useState<number | null>(null);
  const [markdownDialogOpen, setMarkdownDialogOpen] = useState(false);
  const [pendingMarkdown, setPendingMarkdown] = useState('');
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDialogTitle, setLinkDialogTitle] = useState('');
  const [showCommentPanel, setShowCommentPanel] = useState(false);
  const [commentThreads, setCommentThreads] = useState<DocCommentThread[]>(initialCommentThreads ?? []);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findReplaceTab, setFindReplaceTab] = useState<FindReplaceTab>('find');
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [findMatches, setFindMatches] = useState<FindMatch[]>([]);
  const [findMatchIndex, setFindMatchIndex] = useState(0);
  const commentThreadsRef = useRef(commentThreads);
  const remoteCommentSeqRef = useRef(0);
  const findReplaceAnchorRef = useRef<HTMLButtonElement>(null);
  const findMatchIndexRef = useRef(0);
  findMatchIndexRef.current = findMatchIndex;

  // (commentThreads sync, commentsEnabled reset, remoteCommentUpdate → useEditorComments)

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
  const preferredCaretXRef = useRef<number | null>(null);
  const slashAnchorRef = useRef<HTMLElement | null>(null);

  // (captureTextSelectionSnapshot → useEditorSelection)
  // (flushPendingSelectionRestore → useEditorSelection)

  // (finishTextSelectDrag, startTextSelectDrag → useEditorMouse)

  // ── Hook: 光标管理 ──
  const {
    scheduleCaret,
    consumePendingCaret,
    releasePendingCaret,
    applyPendingCaret,
    flushPendingCaret,
    queuePendingCaretFallback,
  } = useEditorCaret({ blocksRef, blockRefs, pendingCaretRef });

  // ── Hook: 选区管理 ──
  const {
    applyDocSelectionVisual,
    hasActiveDocSelection,
    clearActiveDocSelection,
    resolveActiveDocSelection,
    getContext,
    refreshToolbarState,
    selectEntireDocument,
    selectCurrentBlock,
    isFullDocumentSelection,
    isSingleBlockFullySelected,
    getFormatBlockIndices,
    captureTextSelectionSnapshot,
    flushPendingSelectionRestore,
  } = useEditorSelection({
    blocksRef,
    blockRefs,
    docSelectionRef,
    savedTextSelectionRef,
    pendingSelectionRestoreRef,
    skipSelectionClearRef,
    setDocSelection,
    setActiveIndex,
    onActiveBlockChange,
    onBlocksChange,
    onToolbarStateChange,
    activeIndex,
  });

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
    if (!toolbarInsertMenuOpen && !slashMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-doc-block-insert-menu]') || target.closest('[data-doc-table-picker]')) return;
      if (toolbarInsertAnchorRef.current?.contains(target)) return;
      if (slashAnchorRef.current?.contains(target)) return;
      setToolbarInsertMenuOpen(false);
      setSlashMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [toolbarInsertMenuOpen, slashMenuOpen]);

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

  const clearAllSelected = useCallback(() => {
    setSelectedImageIndex(null);
    setSelectedCodeIndex(null);
    setSelectedTableIndex(null);
    setSelectedBaseIndex(null);
    setSelectedWhiteboardIndex(null);
  }, []);

  const focusAfterTableInsert = useCallback((next: DocBlock[], tableIdx: number) => {
    setDocSelection(null);
    clearAllSelected();
    skipSelectionClearRef.current = true;
    window.getSelection()?.removeAllRanges();

    const afterIdx = tableIdx + 1 < next.length ? tableIdx + 1 : tableIdx;
    const afterBlock = next[afterIdx];
    setActiveIndex(afterIdx);
    onActiveBlockChange(afterIdx);
    if (afterBlock && (isTextBlock(afterBlock) || afterBlock.type === 'list')) {
      scheduleCaret({ blockIndex: afterIdx, position: 'start' }, next);
    }
  }, [onActiveBlockChange, scheduleCaret, clearAllSelected]);

  const registerRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) blockRefs.current.set(id, el);
    else blockRefs.current.delete(id);
  }, []);

  // (applyDocSelectionVisual → useEditorSelection)

  // (hasActiveDocSelection → useEditorSelection)

  // (clearActiveDocSelection → useEditorSelection)

  // (resolveActiveDocSelection → useEditorSelection)

  // (getContext → useEditorSelection)

  // (refreshToolbarState → useEditorSelection)

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

      // 如果浏览器选区跨块，同步到 docSelection
      if (ctx?.isMultiBlock) {
        const nativeSel = window.getSelection();
        if (nativeSel && nativeSel.rangeCount > 0 && !nativeSel.isCollapsed) {
          const range = nativeSel.getRangeAt(0);
          const anchor = resolveAnchorFromNode(range.startContainer, blocksRef.current);
          const focus = resolveAnchorFromNode(range.endContainer, blocksRef.current);
          if (anchor && focus) {
            setDocSelection({ anchor, focus });
            return;
          }
        }
      }

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

  // ── Hook: 保存/历史光标 ──
  useEditorSave({
    editorSaveRef,
    editorRef,
    blocksRef,
    blockRefs,
    activeIndexRef,
    saveSelectionRef,
    syncBlockFromEl,
    scheduleCaret,
    setActiveIndex,
    onActiveBlockChange,
  });

  // (getFormatBlockIndices → useEditorSelection)

  // ── Hook: 工具栏操作 ──
  const { applyInlineFormat, applyInlineToTargets, handleToolbarAction, applyLinkWithTitle } = useEditorToolbar({
    readOnly,
    blocks,
    activeIndex,
    blocksRef,
    blockRefs,
    savedTextSelectionRef,
    pendingSelectionRestoreRef,
    hasActiveDocSelection,
    getContext,
    getFormatBlockIndices,
    syncBlockFromEl,
    refreshToolbarState,
    onBlocksChange,
    onToolbarAction,
    onToolbarStateChange,
    setActiveIndex,
    onActiveBlockChange,
    setToolbarInsertMenuOpen,
    onOpenLinkDialog: () => {
      // 保存当前选区信息，对话框打开后浏览器焦点转移会导致选区丢失
      const detail = getNativeTextSelectionDetail(blocksRef.current, blockRefs.current);
      if (detail && !detail.collapsed && detail.slices.length) {
        // 保存选区到 savedTextSelectionRef，供 applyLinkWithTitle 使用
        savedTextSelectionRef.current = detail;
        // 获取选区文本作为预填充标题
        const slice = detail.slices[0];
        const block = blocksRef.current[slice.blockIndex];
        const selectedText = block && isTextBlock(block)
          ? block.text.slice(slice.start, slice.end)
          : '';
        setLinkDialogTitle(selectedText);
      } else {
        setLinkDialogTitle('');
      }
      setLinkDialogOpen(true);
    },
  });

  // (selectEntireDocument → useEditorSelection)
  // (selectCurrentBlock → useEditorSelection)
  // (isFullDocumentSelection → useEditorSelection)
  // (isSingleBlockFullySelected → useEditorSelection)

  // ── Hook: 键盘快捷键 ──
  useEditorKeyboard({
    readOnly,
    blocksRef,
    blockRefs,
    editorRef,
    activeIndexRef,
    selectedImageIndexRef,
    selectedTableIndexRef,
    selectedBaseIndexRef,
    selectedWhiteboardIndexRef,
    selectedCodeIndexRef,
    docSelectionRef,
    handleToolbarAction,
    keepCodeSelected,
    keepTableSelected,
    selectEntireDocument,
    selectCurrentBlock,
    isFullDocumentSelection,
    isSingleBlockFullySelected,
    onActiveBlockChange,
  });

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
    else {
      const pending = scheduleCaret({ blockIndex: newIdx, position: 'start' }, next);
      if (pending) queuePendingCaretFallback(pending);
    }
    onBlocksChange(next, true);
  }, [buildInsertBlock, onBlocksChange, focusAfterTableInsert, keepBaseSelected, keepWhiteboardSelected, keepCodeSelected, scheduleCaret, queuePendingCaretFallback]);

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
    const pending = scheduleCaret({ blockIndex: index + 1, position: 'start' }, next);
    if (pending) queuePendingCaretFallback(pending);
    setActiveIndex(index + 1);
    onActiveBlockChange(index + 1);
    onBlocksChange(next, true);
  };

  const handleTabIndent = useCallback((index: number, shiftKey = false) => {
    const ctx = getContext();
    const indices = getFormatBlockIndices(ctx);
    const targetIndices = indices.length > 1 ? indices : [index];
    const next = [...blocks];
    targetIndices.forEach(i => {
      const block = next[i];
      if (isTextBlock(block)) {
        next[i] = shiftKey ? decreaseBlockIndent(block) : increaseBlockIndent(block);
      }
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
      const pending = scheduleCaret(pendingCaretFromBoundary(cleared.focus), cleared.blocks);
      if (pending) queuePendingCaretFallback(pending);
      onBlocksChange(cleared.blocks, true);
      return;
    }
    const next = [...blocksRef.current];
    next[blockIndex] = { ...block, items: result.items };
    const pending = scheduleCaret({ blockIndex, position: 'start', listItemIndex: result.focusIndex }, next);
    if (pending) queuePendingCaretFallback(pending);
    onBlocksChange(next, true);
  }, [onBlocksChange, scheduleCaret, queuePendingCaretFallback]);

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
      const pending = scheduleCaret(pendingCaretFromBoundary(cleared.focus), cleared.blocks);
      if (pending) queuePendingCaretFallback(pending);
      onBlocksChange(cleared.blocks, true);
      return;
    }

    if (atStart) {
      const newBlocks = listItemToParagraphBlocks(block, itemIndex);
      const next = [...blocksRef.current];
      next.splice(blockIndex, 1, ...newBlocks);
      const paraOffset = newBlocks.findIndex(b => b.type === 'paragraph');
      const pending = scheduleCaret({ blockIndex: blockIndex + Math.max(0, paraOffset), position: 'start' }, next);
      if (pending) queuePendingCaretFallback(pending);
      onBlocksChange(next, true);
    }
  }, [onBlocksChange, scheduleCaret, queuePendingCaretFallback]);

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
        const pending = scheduleCaret({ blockIndex: blockIndex + Math.max(0, paraOffset), position: 'start' }, next);
        if (pending) queuePendingCaretFallback(pending);
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
  }, [onBlocksChange, scheduleCaret, queuePendingCaretFallback]);

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
      const pending = scheduleCaret({ blockIndex, position: mergeOffset, listItemIndex: itemIndex }, next);
      if (pending) queuePendingCaretFallback(pending);
      onBlocksChange(next, true);
      return;
    }

    if (blockIndex >= blocksRef.current.length - 1) return;
    const merged = mergeFollowingBlockIntoList(blocksRef.current, blockIndex);
    if (!merged) return;
    const pending = scheduleCaret(pendingCaretFromBoundary(merged.focus), merged.blocks);
    if (pending) queuePendingCaretFallback(pending);
    onBlocksChange(merged.blocks, true);
  }, [onBlocksChange, scheduleCaret, queuePendingCaretFallback]);

  const handleDeleteBlock = useCallback((index: number) => {
    if (readOnly) return;
    if (blocks.length <= 1) {
      const next = [createEmptyParagraph()];
      const pending = scheduleCaret({ blockIndex: 0, position: 'start' }, next);
      if (pending) queuePendingCaretFallback(pending);
      onBlocksChange(next, true);
      return;
    }
    const next = [...blocks];
    next.splice(index, 1);
    const anchor = Math.min(index, next.length - 1);
    let focusIdx = findNearestTextBlockIndex(next, anchor, 1);
    if (focusIdx < 0) focusIdx = findNearestTextBlockIndex(next, anchor, -1);
    if (focusIdx < 0) focusIdx = anchor;
    const pending = scheduleCaret({ blockIndex: focusIdx, position: 'start' }, next);
    if (pending) queuePendingCaretFallback(pending);
    onBlocksChange(next, true);
  }, [blocks, onBlocksChange, scheduleCaret, queuePendingCaretFallback, findNearestTextBlockIndex]);

  const handleCopyBlock = useCallback((index: number) => {
    const cloned = cloneDocBlock(blocks[index]);
    const next = [...blocks];
    next.splice(index + 1, 0, cloned);
    const pending = scheduleCaret({ blockIndex: index + 1, position: 'start' }, next);
    if (pending) queuePendingCaretFallback(pending);
    onBlocksChange(next, true);
  }, [blocks, onBlocksChange, scheduleCaret, queuePendingCaretFallback]);

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

  // ── Hook: 块拖拽 ──
  const { handleBlockDragStart } = useBlockDrag({
    blocksRef,
    blockDragRef,
    blockDragStateRef,
    setBlockDragState,
    onBlocksChange,
    setActiveIndex,
    onActiveBlockChange,
  });

  const handleBackspaceEmpty = (index: number) => {
    if (blocks.length <= 1) return;
    const next = [...blocks];
    next.splice(index, 1);
    setDocSelection(null);
    const target = findNearestTextBlockIndex(next, Math.max(0, index - 1), -1);
    const pending = scheduleCaret({ blockIndex: target >= 0 ? target : 0, position: 'end' }, next);
    if (pending) queuePendingCaretFallback(pending);
    onBlocksChange(next, true);
  };

  const handleDeleteAtEnd = useCallback((index: number) => {
    if (index >= blocks.length - 1) return;
    const curr = blocks[index];

    if (curr.type === 'list') {
      const merged = mergeFollowingBlockIntoList(blocks, index);
      if (!merged) return;
      setDocSelection(null);
      const pending = scheduleCaret(pendingCaretFromBoundary(merged.focus), merged.blocks);
      if (pending) queuePendingCaretFallback(pending);
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
    const pending = scheduleCaret({ blockIndex: index, position: splitAt }, next);
    if (pending) queuePendingCaretFallback(pending);
    setActiveIndex(index);
    onActiveBlockChange(index);
    onBlocksChange(next, true);
  }, [blocks, onBlocksChange, onActiveBlockChange, scheduleCaret, queuePendingCaretFallback]);

  const handleBackspaceMerge = useCallback((index: number) => {
    if (index <= 0) return;

    const listMerged = mergeTextBlockIntoPrecedingList(blocks, index);
    if (listMerged) {
      setDocSelection(null);
      const pending = scheduleCaret(pendingCaretFromBoundary(listMerged.focus), listMerged.blocks);
      if (pending) queuePendingCaretFallback(pending);
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
    const pending = scheduleCaret({ blockIndex: index - 1, position: splitAt }, next);
    if (pending) queuePendingCaretFallback(pending);
    setActiveIndex(index - 1);
    onActiveBlockChange(index - 1);
    onBlocksChange(next, true);
  }, [blocks, onBlocksChange, onActiveBlockChange, scheduleCaret, queuePendingCaretFallback]);

  const handleDeleteDocSelection = useCallback(() => {
    const sel = resolveActiveDocSelection();
    if (!sel) return;
    const result = deleteDocSelectionBlocks(blocksRef.current, sel);
    if (!result) return;

    clearActiveDocSelection();
    const caretSpec: PendingCaretSpec = result.caretListItemIndex != null
      ? { blockIndex: result.caretBlockIndex, position: result.caretOffset, listItemIndex: result.caretListItemIndex }
      : { blockIndex: result.caretBlockIndex, position: result.caretOffset };
    const pending = scheduleCaret(caretSpec, result.blocks);
    if (pending) queuePendingCaretFallback(pending);
    setActiveIndex(result.caretBlockIndex);
    onActiveBlockChange(result.caretBlockIndex);
    onBlocksChange(result.blocks, true);
  }, [resolveActiveDocSelection, clearActiveDocSelection, onBlocksChange, onActiveBlockChange, scheduleCaret, queuePendingCaretFallback]);

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

  // ── Hook: 粘贴系统 ──
  const {
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
  } = useEditorPaste({
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
  });

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

  // ── Hook: Delete/Backspace + Copy/Cut ──
  useEditorDeleteCopy({
    editorRef,
    blocksRef,
    blockRefs,
    docSelectionRef,
    savedTextSelectionRef,
    selectedImageIndexRef,
    selectedTableIndexRef,
    selectedBaseIndexRef,
    selectedWhiteboardIndexRef,
    selectedCodeIndexRef,
    activeIndexRef,
    lastDocCopyPayloadRef,
    hasActiveDocSelection,
    resolveActiveDocSelection,
    handleDeleteBlock,
    handleDeleteDocSelection,
    setSelectedImageIndex,
    setSelectedTableIndex,
    setSelectedBaseIndex,
    setSelectedWhiteboardIndex,
    setSelectedCodeIndex,
  });

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

  // ── Hook: 方向键导航 ──
  const { navigateDocArrow } = useArrowNavigation({
    blocksRef,
    blockRefs,
    editorRef,
    activeIndexRef,
    selectedImageIndexRef,
    selectedTableIndexRef,
    selectedBaseIndexRef,
    selectedWhiteboardIndexRef,
    selectedCodeIndexRef,
    docSelectionRef,
    preferredCaretXRef,
    setDocSelection,
    setSelectedImageIndex,
    setSelectedCodeIndex,
    setSelectedTableIndex,
    setSelectedBaseIndex,
    setSelectedWhiteboardIndex,
    setActiveIndex,
    onActiveBlockChange,
    focusBlockAt,
    findNearestTextBlockIndex,
    selectObjectBlock,
    hasActiveDocSelection,
    applyDocSelectionVisual,
  });

  // ── Hook: 鼠标事件 ──
  const {
    focusBlockFromPointer,
    handleEditorMouseDown,
    handleEditorMouseMove,
    handleEditorMouseUp,
    getBlockSelectionHighlight,
  } = useEditorMouse({
    readOnly,
    blocksRef,
    blockRefs,
    editorRef,
    docSelectionRef,
    activeIndexRef,
    skipSelectionClearRef,
    dragAnchor,
    dragStartAnchor,
    dragMoved,
    isDragging,
    savedTextSelectionRef,
    textSelectAnchorRef,
    textSelectCleanupRef,
    setDocSelection,
    setSelectedImageIndex,
    setSelectedCodeIndex,
    setSelectedTableIndex,
    setSelectedBaseIndex,
    setActiveHandleIndex,
    setActiveIndex,
    onActiveBlockChange,
    focusBlockAt,
    selectObjectBlock,
    keepImageSelected,
    keepCodeSelected,
    keepTableSelected,
    applyDocSelectionVisual,
    captureTextSelectionSnapshot,
    refreshToolbarState,
  });



  // ── Hook: 评论系统 ──
  const {
    COMMENT_AUTHOR,
    scrollToCommentAnchor,
    handleSelectComment,
    handleAddComment,
    handleCommentReply,
    handleCommentCreate,
    handleCommentResolve,
    handleCommentEdit,
    handleCommentDelete,
    handleCommentLike,
    handleCancelDraft,
  } = useEditorComments({
    commentsEnabled,
    canComment,
    commentAuthor,
    commentThreads,
    initialCommentThreads,
    remoteCommentUpdate,
    blocksRef,
    blockRefs,
    commentThreadsRef,
    remoteCommentSeqRef,
    setCommentThreads,
    setShowCommentPanel,
    setSelectedCommentId,
    onBlocksChange,
    onPersistCommentCreate,
    onPersistCommentReply,
    onPersistCommentResolve,
    onPersistCommentEdit,
    onPersistCommentDelete,
    onPersistCommentLike,
  });
  const commentsActive = commentsEnabled;
  const commentToolbarVisible = commentsEnabled;


  // ── Hook: 查找替换 ──
  const {
    openFindReplace,
    closeFindReplace,
    handleFindPrev,
    handleFindNext,
    handleReplaceOne,
    handleReplaceAll,
    findHighlightGroups,
    docWordCount,
    listHighlightsByBlock,
  } = useEditorFindReplace({
    readOnly,
    title,
    blocksRef,
    blockRefs,
    editorRef,
    showFindReplace,
    findQuery,
    replaceQuery,
    findMatches,
    findMatchIndex,
    findMatchIndexRef,
    setFindMatches,
    setFindMatchIndex,
    setShowFindReplace,
    setFindReplaceTab,
    onTitleChange,
    onBlocksChange,
  });

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
        showFindReplace={showFindReplace}
        onToggleComments={commentToolbarVisible ? () => setShowCommentPanel(v => !v) : undefined}
        onToggleFindReplace={() => {
          if (showFindReplace) closeFindReplace();
          else openFindReplace('find');
        }}
        onToggleOutline={onToggleOutline}
        onToggleFullscreen={onToggleFullscreen}
        onInsertImage={() => setImagePickerOpen(true)}
        insertMenuAnchorRef={toolbarInsertAnchorRef}
        findReplaceAnchorRef={findReplaceAnchorRef}
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

      {!readOnly && (toolbarInsertMenuOpen || slashMenuOpen) && (
        <DocBlockInsertMenu
          open
          anchorRef={(slashMenuOpen ? slashAnchorRef : toolbarInsertAnchorRef) as React.RefObject<HTMLElement | null>}
          placement={slashMenuOpen ? 'right' : 'bottom'}
          onClose={() => {
            setToolbarInsertMenuOpen(false);
            setSlashMenuOpen(false);
          }}
          onInsert={(kind, tableSize) => {
            const blocksLen = blocksRef.current.length;
            const insertAt = blocksLen > 0
              ? Math.min(activeIndexRef.current, blocksLen - 1)
              : -1;
            handleInsertBelow(insertAt, kind, tableSize);
            setToolbarInsertMenuOpen(false);
            setSlashMenuOpen(false);
          }}
        />
      )}

      <DocImageInsertDialog
        open={imagePickerOpen}
        onClose={() => setImagePickerOpen(false)}
        onInsert={handleInsertImage}
      />

      <DocFindReplacePanel
        open={showFindReplace}
        tab={findReplaceTab}
        findQuery={findQuery}
        replaceQuery={replaceQuery}
        matchIndex={findMatchIndex}
        matchCount={findMatches.length}
        readOnly={readOnly}
        anchorRef={findReplaceAnchorRef}
        onTabChange={setFindReplaceTab}
        onFindQueryChange={setFindQuery}
        onReplaceQueryChange={setReplaceQuery}
        onClose={closeFindReplace}
        onPrev={handleFindPrev}
        onNext={handleFindNext}
        onReplace={handleReplaceOne}
        onReplaceAll={handleReplaceAll}
      />

      <MarkdownConvertDialog
        open={markdownDialogOpen}
        onConvert={applyMarkdownPaste}
        onDismiss={dismissMarkdownPaste}
      />

      <DocLinkDialog
        open={linkDialogOpen}
        initialTitle={linkDialogTitle}
        initialUrl=""
        onConfirm={(title, url) => {
          setLinkDialogOpen(false);
          applyLinkWithTitle(title, url);
        }}
        onCancel={() => {
          setLinkDialogOpen(false);
        }}
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
        <div style={{ flex: 1, position: 'relative', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
            onDragOver={e => {
              if (readOnly) return;
              const hasImage = Array.from(e.dataTransfer?.types ?? []).includes('Files');
              if (!hasImage) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={e => {
              if (readOnly) return;
              const files = e.dataTransfer?.files;
              if (!files?.length) return;
              const imageFile = Array.from(files).find(f => f.type.startsWith('image/'));
              if (!imageFile) return;
              e.preventDefault();
              e.stopPropagation();
              const editorEl = editorRef.current;
              if (!editorEl) return;
              const insertAt = resolveBlockIndexFromClientY(e.clientY, editorEl);
              pendingImageInsertIndexRef.current = insertAt >= 0 ? insertAt + 1 : activeIndexRef.current + 1;
              void (async () => {
                try {
                  const payload = await prepareImageFileForInsert(imageFile);
                  handleInsertImage(payload);
                } catch (err) {
                  console.error('拖入图片上传失败', err);
                }
              })();
            }}
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
              findHighlights={showFindReplace ? findHighlightGroups.title : undefined}
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
                selectionState={getBlockSelectionHighlight(index, docSelection, blocks)}
                findHighlights={showFindReplace
                  ? (findHighlightGroups.byBlock.get(index) ?? findHighlightGroups.byCode.get(index))
                  : undefined}
                findHighlightsByListItem={showFindReplace ? listHighlightsByBlock.get(index) : undefined}
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
                onTab={shiftKey => handleTabIndent(index, shiftKey)}
                onSlashCommand={() => {
                  const block = blocksRef.current[index];
                  const el = block?.id ? blockRefs.current.get(block.id) : null;
                  slashAnchorRef.current = el ?? null;
                  setToolbarInsertMenuOpen(false);
                  setSlashMenuOpen(true);
                  setActiveIndex(index);
                  onActiveBlockChange(index);
                }}
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
        <div
          aria-live="polite"
          style={{
            position: 'absolute',
            left: 16,
            bottom: 12,
            zIndex: 5,
            pointerEvents: 'none',
            fontSize: 12,
            lineHeight: 1.2,
            color: '#8F959E',
            userSelect: 'none',
          }}
        >
          {docWordCount} 个字
        </div>
        </div>

        {commentsActive && showCommentPanel && (
          <DocCommentPanel
            threads={commentThreads}
            selectedId={selectedCommentId}
            onSelect={(id) => handleSelectComment(id, commentThreads)}
            onClose={() => setShowCommentPanel(false)}
            onResolve={handleCommentResolve}
            onReply={handleCommentReply}
            onEditReply={handleCommentEdit}
            onDeleteReply={handleCommentDelete}
            onLikeReply={handleCommentLike}
            onCreateReply={handleCommentCreate}
            onCancelDraft={handleCancelDraft}
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
