import type { DocBlock, TextMark } from './types';
import type { TextSelectionSlice } from './selectionFormat';
import type { TabStop } from './tabStops';
import { genBlockId, isTextBlock, normalizeMarks } from './utils';
import { DOC_COMMENT_HIGHLIGHT_SELECTED_BG, DOC_COMMENT_HIGHLIGHT_IDLE_BG } from '@lingyi-doc/core-types';

export interface DocCommentAnchor {
  blockId: string;
  start: number;
  end: number;
  quote: string;
  /** text=富文本选区；sheet_cell=多维表单元格；sheet_record=整行记录；freeform_cell=普通表格单元格（start=行,end=列）；whiteboard_*=画板（start/end=pin 坐标） */
  anchorType?: 'text' | 'sheet_cell' | 'sheet_record' | 'freeform_cell' | 'whiteboard_element' | 'whiteboard_mind_node' | 'whiteboard_point';
  sheetId?: string;
  recordId?: string;
  fieldId?: string;
  viewId?: string;
  elementId?: string;
  mindNodeId?: string;
  /** 相对绑定图形原点的偏移（有 elementId 时用于跟随移动） */
  pinOffsetX?: number;
  pinOffsetY?: number;
}

export interface DocCommentReply {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string | null;
  text: string;
  createdAt: number;
  updatedAt?: number;
  likeCount?: number;
  likedByMe?: boolean;
}

export interface DocCommentThread {
  id: string;
  anchor: DocCommentAnchor;
  replies: DocCommentReply[];
  resolved: boolean;
  createdAt: number;
}

// BG constants are defined in @lingyi-doc/core-types; borders remain doc-local
export const DOC_COMMENT_HIGHLIGHT_SELECTED_BORDER = '#F7C900';
export const DOC_COMMENT_HIGHLIGHT_IDLE_BORDER = 'rgba(247, 201, 0, 0.45)';

export function genCommentId(): string {
  return `cmt_${genBlockId().slice(2)}`;
}

export function truncateCommentQuote(text: string, maxLen = 18): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}...`;
}

export function isSheetCommentAnchor(anchor: DocCommentAnchor): boolean {
  return anchor.anchorType === 'sheet_cell'
    || anchor.anchorType === 'sheet_record'
    || anchor.anchorType === 'freeform_cell';
}

export function isWhiteboardCommentAnchor(anchor: DocCommentAnchor): boolean {
  return anchor.anchorType === 'whiteboard_element'
    || anchor.anchorType === 'whiteboard_mind_node'
    || anchor.anchorType === 'whiteboard_point';
}

export function isUnsubmittedCommentThread(thread: DocCommentThread): boolean {
  return !thread.resolved && thread.replies.length === 0;
}

export function getWhiteboardCommentPin(anchor: DocCommentAnchor): { x: number; y: number } {
  return { x: anchor.start, y: anchor.end };
}

export function buildWhiteboardCommentAnchor(input: {
  docId: string;
  elementId?: string;
  mindNodeId?: string;
  pinX: number;
  pinY: number;
  quote: string;
  pinOffsetX?: number;
  pinOffsetY?: number;
}): DocCommentAnchor {
  const pinX = Math.round(input.pinX);
  const pinY = Math.round(input.pinY);
  const hasElement = !!input.elementId;
  const anchorType = input.mindNodeId
    ? 'whiteboard_mind_node'
    : hasElement
      ? 'whiteboard_element'
      : 'whiteboard_point';
  return {
    blockId: `whiteboard:${input.docId}`,
    start: pinX,
    end: pinY,
    quote: input.quote,
    anchorType,
    elementId: input.elementId,
    mindNodeId: input.mindNodeId,
    pinOffsetX: hasElement && input.pinOffsetX != null ? Math.round(input.pinOffsetX) : undefined,
    pinOffsetY: hasElement && input.pinOffsetY != null ? Math.round(input.pinOffsetY) : undefined,
  };
}

export function filterCommentThreadsForWhiteboard(
  threads: DocCommentThread[],
  docId: string,
): DocCommentThread[] {
  const blockId = `whiteboard:${docId}`;
  return threads.filter(thread => (
    isWhiteboardCommentAnchor(thread.anchor) && thread.anchor.blockId === blockId
  ));
}

export function updateCommentThreadPin(
  threads: DocCommentThread[],
  threadId: string,
  pinX: number,
  pinY: number,
): DocCommentThread[] {
  return threads.map(thread => {
    if (thread.id !== threadId) return thread;
    return {
      ...thread,
      anchor: {
        ...thread.anchor,
        start: Math.round(pinX),
        end: Math.round(pinY),
      },
    };
  });
}

export function updateCommentThreadAnchor(
  threads: DocCommentThread[],
  threadId: string,
  anchor: DocCommentAnchor,
): DocCommentThread[] {
  return threads.map(thread => (
    thread.id === threadId ? { ...thread, anchor } : thread
  ));
}

export function buildFreeformCommentAnchor(input: {
  sheetId: string;
  row: number;
  col: number;
  quote: string;
}): DocCommentAnchor {
  return {
    blockId: `sheet:${input.sheetId}`,
    start: input.row,
    end: input.col,
    quote: input.quote,
    anchorType: 'freeform_cell',
    sheetId: input.sheetId,
  };
}

export function buildSheetCommentAnchor(input: {
  sheetId: string;
  recordId: string;
  quote: string;
  fieldId?: string;
  viewId?: string;
}): DocCommentAnchor {
  return {
    blockId: `sheet:${input.sheetId}`,
    start: 0,
    end: 0,
    quote: input.quote,
    anchorType: input.fieldId ? 'sheet_cell' : 'sheet_record',
    sheetId: input.sheetId,
    recordId: input.recordId,
    fieldId: input.fieldId,
    viewId: input.viewId,
  };
}

export function filterCommentThreadsForSheet(
  threads: DocCommentThread[],
  sheetId: string,
): DocCommentThread[] {
  return threads.filter(thread => (
    thread.anchor.sheetId === sheetId || thread.anchor.blockId === `sheet:${sheetId}`
  ));
}

export interface SheetCommentCellRef {
  threadId: string;
  row: number;
  col: number;
  /** sheet_record=整行评论；sheet_cell=单元格评论 */
  anchorType?: 'sheet_cell' | 'sheet_record';
  /** 行级评论数量（仅 anchorType=sheet_record 时有值） */
  commentCount?: number;
  /** 行级评论关联的全部 threadId（用于选中高亮匹配） */
  threadIds?: string[];
}

export interface ResolveCommentCellOptions {
  rows?: Array<{ _id?: string }>;
  columnDefs?: Array<{ id: string }>;
}

/** 将表格评论锚点解析为网格 row/col（普通表直接用 start/end；多维表用 recordId/fieldId） */
export function resolveCommentAnchorToCell(
  anchor: DocCommentAnchor,
  options?: ResolveCommentCellOptions,
): { row: number; col: number } | null {
  if (anchor.anchorType === 'freeform_cell') {
    return { row: anchor.start, col: anchor.end };
  }
  if (!options?.rows || !anchor.recordId) return null;
  const row = options.rows.findIndex(r => r._id === anchor.recordId);
  if (row < 0) return null;
  if (anchor.anchorType === 'sheet_record' || !anchor.fieldId) {
    return { row, col: 0 };
  }
  const col = options.columnDefs?.findIndex(c => c.id === anchor.fieldId) ?? -1;
  return { row, col: col >= 0 ? col : 0 };
}

export function resolveSheetCommentCells(
  threads: DocCommentThread[],
  sheetId: string,
  options?: ResolveCommentCellOptions,
): SheetCommentCellRef[] {
  const rowCommentMap = new Map<number, { threadIds: string[] }>();
  const cellComments: SheetCommentCellRef[] = [];
  const seenCells = new Set<string>();

  for (const thread of threads) {
    if (thread.resolved) continue;
    if (thread.anchor.sheetId !== sheetId && thread.anchor.blockId !== `sheet:${sheetId}`) continue;
    if (!isSheetCommentAnchor(thread.anchor)) continue;
    const cell = resolveCommentAnchorToCell(thread.anchor, options);
    if (!cell) continue;

    const isRowComment = thread.anchor.anchorType === 'sheet_record'
      || (thread.anchor.anchorType !== 'freeform_cell' && !thread.anchor.fieldId);
    if (isRowComment) {
      const existing = rowCommentMap.get(cell.row);
      if (existing) {
        existing.threadIds.push(thread.id);
      } else {
        rowCommentMap.set(cell.row, { threadIds: [thread.id] });
      }
      continue;
    }

    const key = `${cell.row},${cell.col}`;
    if (seenCells.has(key)) continue;
    seenCells.add(key);
    cellComments.push({
      threadId: thread.id,
      row: cell.row,
      col: cell.col,
      anchorType: 'sheet_cell',
    });
  }

  const rowComments: SheetCommentCellRef[] = [];
  for (const [row, { threadIds }] of rowCommentMap) {
    rowComments.push({
      threadId: threadIds[0]!,
      threadIds,
      row,
      col: 0,
      anchorType: 'sheet_record',
      commentCount: threadIds.length,
    });
  }

  return [...rowComments, ...cellComments];
}

export function isSheetCommentCellSelected(
  cell: SheetCommentCellRef,
  selectedCommentId?: string | null,
): boolean {
  if (!selectedCommentId) return false;
  if (cell.threadIds?.includes(selectedCommentId)) return true;
  return cell.threadId === selectedCommentId;
}

export function formatCommentTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  const d = new Date(ts);
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function createEmptyCommentThread(anchor: DocCommentAnchor): DocCommentThread {
  return {
    id: genCommentId(),
    anchor,
    replies: [],
    resolved: false,
    createdAt: Date.now(),
  };
}

export function createCommentThread(
  anchor: DocCommentAnchor,
  reply: Omit<DocCommentReply, 'id' | 'createdAt'>,
): DocCommentThread {
  const now = Date.now();
  return {
    id: genCommentId(),
    anchor,
    replies: [{ ...reply, id: genCommentId(), createdAt: now }],
    resolved: false,
    createdAt: now,
  };
}

export function applyCommentMarkToBlock(
  block: DocBlock,
  start: number,
  end: number,
  threadId: string,
): DocBlock {
  if (!isTextBlock(block)) return block;
  const lo = Math.max(0, Math.min(start, end));
  const hi = Math.min(block.text.length, Math.max(start, end));
  if (lo >= hi) return block;
  const marks = [
    ...block.marks.filter(m => !(m.type === 'comment' && m.start < hi && m.end > lo)),
    { type: 'comment' as const, start: lo, end: hi, value: threadId },
  ];
  return { ...block, marks: normalizeMarks(marks, block.text.length) };
}

export function removeCommentMarksFromBlocks(
  blocks: DocBlock[],
  threadId: string,
): DocBlock[] {
  return blocks.map(block => {
    if (!isTextBlock(block)) return block;
    const marks = block.marks.filter(m => !(m.type === 'comment' && m.value === threadId));
    if (marks.length === block.marks.length) return block;
    return { ...block, marks };
  });
}

export function commentMarkStyle(threadId: string, selectedCommentId?: string | null): string {
  const selected = selectedCommentId === threadId;
  if (selected) {
    return `background:${DOC_COMMENT_HIGHLIGHT_SELECTED_BG};border-bottom:2px solid ${DOC_COMMENT_HIGHLIGHT_SELECTED_BORDER};cursor:pointer;`;
  }
  return `background:${DOC_COMMENT_HIGHLIGHT_IDLE_BG};border-bottom:1px solid ${DOC_COMMENT_HIGHLIGHT_IDLE_BORDER};cursor:pointer;`;
}

export function applyCommentMarkFromSlice(
  blocks: DocBlock[],
  slice: TextSelectionSlice,
  threadId: string,
): { blocks: DocBlock[]; anchor: DocCommentAnchor } | null {
  const block = blocks[slice.blockIndex];
  if (!block) return null;
  const lo = Math.max(0, Math.min(slice.start, slice.end));
  const hi = Math.max(slice.start, slice.end);

  if (block.type === 'list' && slice.listItemIndex != null) {
    const item = block.items[slice.listItemIndex];
    if (!item) return null;
    const end = Math.min(item.text.length, hi);
    const start = Math.min(lo, end);
    if (start >= end) return null;
    const quote = item.text.slice(start, end);
    const marks = [
      ...(item.marks ?? []).filter(m => !(m.type === 'comment' && m.start < end && m.end > start)),
      { type: 'comment' as const, start, end, value: threadId },
    ];
    const items = [...block.items];
    items[slice.listItemIndex] = { ...item, marks: normalizeMarks(marks, item.text.length) };
    const next = [...blocks];
    next[slice.blockIndex] = { ...block, items };
    return {
      blocks: next,
      anchor: { blockId: block.id, start, end, quote },
    };
  }

  if (!isTextBlock(block)) return null;
  const end = Math.min(block.text.length, hi);
  const start = Math.min(lo, end);
  if (start >= end) return null;
  const quote = block.text.slice(start, end);
  const nextBlock = applyCommentMarkToBlock(block, start, end, threadId);
  const next = [...blocks];
  next[slice.blockIndex] = nextBlock;
  return {
    blocks: next,
    anchor: { blockId: block.id, start, end, quote },
  };
}

export function appendCommentReply(
  threads: DocCommentThread[],
  threadId: string,
  reply: Omit<DocCommentReply, 'id' | 'createdAt' | 'updatedAt' | 'likeCount' | 'likedByMe'>,
): DocCommentThread[] {
  const now = Date.now();
  return threads.map(thread => {
    if (thread.id !== threadId) return thread;
    return {
      ...thread,
      replies: [...thread.replies, { ...reply, id: genCommentId(), createdAt: now, likeCount: 0, likedByMe: false }],
    };
  });
}

export function updateCommentReply(
  threads: DocCommentThread[],
  threadId: string,
  replyId: string,
  text: string,
): DocCommentThread[] {
  const now = Date.now();
  return threads.map(thread => {
    if (thread.id !== threadId) return thread;
    return {
      ...thread,
      replies: thread.replies.map(reply => (
        reply.id === replyId ? { ...reply, text, updatedAt: now } : reply
      )),
    };
  });
}

export function deleteCommentReply(
  threads: DocCommentThread[],
  threadId: string,
  replyId: string,
): DocCommentThread[] {
  return threads
    .map(thread => {
      if (thread.id !== threadId) return thread;
      return { ...thread, replies: thread.replies.filter(reply => reply.id !== replyId) };
    })
    .filter(thread => thread.replies.length > 0 || thread.id !== threadId);
}

export function deleteCommentThread(
  threads: DocCommentThread[],
  threadId: string,
): DocCommentThread[] {
  return threads.filter(thread => thread.id !== threadId);
}

export function toggleCommentReplyLike(
  threads: DocCommentThread[],
  threadId: string,
  replyId: string,
  liked: boolean,
  likeCount: number,
): DocCommentThread[] {
  return threads.map(thread => {
    if (thread.id !== threadId) return thread;
    return {
      ...thread,
      replies: thread.replies.map(reply => (
        reply.id === replyId ? { ...reply, likedByMe: liked, likeCount } : reply
      )),
    };
  });
}

export function resolveCommentThread(
  threads: DocCommentThread[],
  threadId: string,
): DocCommentThread[] {
  return threads.map(thread => (
    thread.id === threadId ? { ...thread, resolved: true } : thread
  ));
}

export type CommentUpdateAction =
  | 'thread_create'
  | 'reply'
  | 'resolve'
  | 'reply_edit'
  | 'reply_delete'
  | 'thread_delete'
  | 'reply_like'
  | 'anchor_move';

export interface CommentUpdatePayload {
  action: CommentUpdateAction;
  thread?: DocCommentThread;
  threadId?: string;
  reply?: DocCommentReply;
  replyId?: string;
  liked?: boolean;
  likeCount?: number;
  anchor?: DocCommentAnchor;
}

export function applyCommentMarksFromThreads(
  blocks: DocBlock[],
  threads: DocCommentThread[],
): DocBlock[] {
  let next = blocks;
  for (const thread of threads) {
    if (thread.resolved) continue;
    const blockIndex = next.findIndex(b => b.id === thread.anchor.blockId);
    if (blockIndex < 0) continue;
    const applied = applyCommentMarkFromSlice(next, {
      blockIndex,
      start: thread.anchor.start,
      end: thread.anchor.end,
    }, thread.id);
    if (applied) next = applied.blocks;
  }
  return next;
}

export function applyRemoteCommentUpdate(
  threads: DocCommentThread[],
  blocks: DocBlock[],
  payload: CommentUpdatePayload,
): { threads: DocCommentThread[]; blocks: DocBlock[] } {
  switch (payload.action) {
    case 'thread_create': {
      if (!payload.thread) return { threads, blocks };
      if (threads.some(t => t.id === payload.thread!.id)) {
        return { threads, blocks };
      }
      const nextThreads = [...threads, payload.thread];
      const nextBlocks = applyCommentMarksFromThreads(blocks, [payload.thread]);
      return { threads: nextThreads, blocks: nextBlocks };
    }
    case 'reply': {
      if (!payload.threadId || !payload.reply) return { threads, blocks };
      return {
        threads: threads.map(thread => {
          if (thread.id !== payload.threadId) return thread;
          if (thread.replies.some(r => r.id === payload.reply!.id)) return thread;
          return { ...thread, replies: [...thread.replies, payload.reply!] };
        }),
        blocks,
      };
    }
    case 'resolve': {
      if (!payload.threadId) return { threads, blocks };
      return {
        threads: resolveCommentThread(threads, payload.threadId),
        blocks: removeCommentMarksFromBlocks(blocks, payload.threadId),
      };
    }
    case 'reply_edit': {
      if (!payload.threadId || !payload.reply) return { threads, blocks };
      return {
        threads: threads.map(thread => {
          if (thread.id !== payload.threadId) return thread;
          return {
            ...thread,
            replies: thread.replies.map(reply => (
              reply.id === payload.reply!.id ? payload.reply! : reply
            )),
          };
        }),
        blocks,
      };
    }
    case 'reply_delete': {
      if (!payload.threadId || !payload.replyId) return { threads, blocks };
      const nextThreads = deleteCommentReply(threads, payload.threadId, payload.replyId);
      const threadRemoved = !nextThreads.some(t => t.id === payload.threadId);
      return {
        threads: nextThreads,
        blocks: threadRemoved
          ? removeCommentMarksFromBlocks(blocks, payload.threadId)
          : blocks,
      };
    }
    case 'thread_delete': {
      if (!payload.threadId) return { threads, blocks };
      return {
        threads: deleteCommentThread(threads, payload.threadId),
        blocks: removeCommentMarksFromBlocks(blocks, payload.threadId),
      };
    }
    case 'reply_like': {
      if (!payload.threadId || !payload.replyId) return { threads, blocks };
      return {
        threads: toggleCommentReplyLike(
          threads,
          payload.threadId,
          payload.replyId,
          !!payload.liked,
          payload.likeCount ?? 0,
        ),
        blocks,
      };
    }
    case 'anchor_move': {
      if (!payload.threadId || !payload.anchor) return { threads, blocks };
      return {
        threads: threads.map(thread => (
          thread.id === payload.threadId
            ? { ...thread, anchor: payload.anchor! }
            : thread
        )),
        blocks,
      };
    }
    default:
      return { threads, blocks };
  }
}

export interface MarksToHtmlOptions {
  selectedCommentId?: string | null;
  /** 制表位规则；缺省使用每隔 0.74cm 的左对齐制表位 */
  tabStops?: TabStop[];
  /** 用于估算制表宽度的字号 */
  fontSizePx?: number;
  /** 查找高亮（临时渲染，不写入文档 marks） */
  findHighlights?: import('./findReplace').FindHighlightRange[];
}

export function mergeCommentMarks(marks: TextMark[]): TextMark[] {
  return marks;
}
