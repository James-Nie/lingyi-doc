import { useCallback, useEffect, useMemo } from 'react';
import type { DocBlock, DocCommentThread, CommentUpdatePayload } from '@lingyi-doc/core-doc';
import {
  applyCommentMarkFromSlice,
  applyCommentMarksFromThreads,
  applyRemoteCommentUpdate,
  appendCommentReply,
  createCommentThread,
  createEmptyCommentThread,
  removeCommentMarksFromBlocks,
  resolveCommentThread,
  updateCommentReply,
  deleteCommentReply,
  deleteCommentThread,
  toggleCommentReplyLike,
  getNativeTextSelectionDetail,
} from '@lingyi-doc/core-doc';

interface CommentDeps {
  commentsEnabled: boolean;
  canComment: boolean;
  commentAuthor?: { authorId: string; authorName: string; authorAvatar?: string | null };
  initialCommentThreads?: DocCommentThread[];
  remoteCommentUpdate?: CommentUpdatePayload | null;
  blocksRef: React.MutableRefObject<DocBlock[]>;
  blockRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  commentThreads: DocCommentThread[];
  commentThreadsRef: React.MutableRefObject<DocCommentThread[]>;
  remoteCommentSeqRef: React.MutableRefObject<number>;
  setCommentThreads: (threads: DocCommentThread[] | ((prev: DocCommentThread[]) => DocCommentThread[])) => void;
  setShowCommentPanel: (show: boolean | ((prev: boolean) => boolean)) => void;
  setSelectedCommentId: (id: string | null | ((prev: string | null) => string | null)) => void;
  onBlocksChange: (blocks: DocBlock[], recordHistory?: boolean, skipSave?: boolean) => void;
  onPersistCommentCreate?: (input: {
    thread: DocCommentThread;
    blocks: DocBlock[];
  }) => Promise<DocCommentThread | void>;
  onPersistCommentReply?: (threadId: string, text: string) => Promise<import('@lingyi-doc/core').DocCommentReply | void>;
  onPersistCommentResolve?: (threadId: string) => Promise<void>;
  onPersistCommentEdit?: (threadId: string, replyId: string, text: string) => Promise<import('@lingyi-doc/core').DocCommentReply | void>;
  onPersistCommentDelete?: (threadId: string, replyId: string) => Promise<{ threadDeleted: boolean } | void>;
  onPersistCommentLike?: (threadId: string, replyId: string) => Promise<{ liked: boolean; likeCount: number; reply: import('@lingyi-doc/core').DocCommentReply } | void>;
}

export function useEditorComments(deps: CommentDeps) {
  const {
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
  } = deps;

  const COMMENT_AUTHOR = commentAuthor ?? { authorId: 'local', authorName: '当前用户' };

  // Sync ref with state
  useEffect(() => {
    commentThreadsRef.current = commentThreads as unknown as DocCommentThread[];
  });

  // Reset on commentsEnabled change
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

  // Handle remote comment updates
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

  const scrollToCommentAnchor = useCallback((threadId: string, commentThreads: DocCommentThread[]) => {
    const thread = commentThreads.find(t => t.id === threadId);
    if (!thread) return;
    const el = blockRefs.current.get(thread.anchor.blockId)
      ?? document.querySelector(`[data-block-id="${thread.anchor.blockId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [blockRefs]);

  const handleSelectComment = useCallback((id: string, commentThreads: DocCommentThread[]) => {
    setSelectedCommentId(id);
    scrollToCommentAnchor(id, commentThreads);
  }, [scrollToCommentAnchor, setSelectedCommentId]);

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
    setCommentThreads(prev => [...prev, thread]);
    // 只更新前端渲染，不触发 patch 保存
    onBlocksChange(applied.blocks, true, true);
    setShowCommentPanel(true);
    setSelectedCommentId(thread.id);
  }, [canComment, onBlocksChange]);

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
  }, [canComment, onPersistCommentReply]);

  /** 首条评论提交：将空线程转为含首条回复的正式评论，触发 blocks 保存 */
  const handleCommentCreate = useCallback((threadId: string, text: string) => {
    if (!canComment) return;
    const thread = commentThreadsRef.current.find(t => t.id === threadId);
    if (!thread) return;

    // 构建包含首条回复的正式评论线程
    const now = Date.now();
    const firstReply = { ...COMMENT_AUTHOR, text, id: `local_${now}`, createdAt: now, likeCount: 0, likedByMe: false };
    const formalThread: DocCommentThread = { ...thread, replies: [firstReply] };

    const prevThreads = commentThreadsRef.current;
    setCommentThreads(prev => prev.map(t => {
      if (t.id !== threadId) return t;
      return formalThread;
    }));

    // 正式保存 blocks（含评论高亮 mark），触发 patch 接口
    onBlocksChange(blocksRef.current, false);

    void (async () => {
      try {
        const saved = await onPersistCommentCreate?.({ thread: formalThread, blocks: blocksRef.current });
        if (saved) {
          setCommentThreads(prev => prev.map(t => (t.id === threadId ? saved : t)));
        }
      } catch {
        setCommentThreads(prevThreads);
      }
    })();
  }, [canComment, onPersistCommentCreate, onBlocksChange]);

  /** 取消新评论：移除空线程并清除高亮，不触发 patch 保存 */
  const handleCancelDraft = useCallback((threadId: string) => {
    setCommentThreads(prev => prev.filter(t => t.id !== threadId));
    const nextBlocks = removeCommentMarksFromBlocks(blocksRef.current, threadId);
    // 只恢复前端渲染，不触发 patch 保存
    onBlocksChange(nextBlocks, true, true);
    setSelectedCommentId(prev => (prev === threadId ? null : prev));
  }, [onBlocksChange, setSelectedCommentId]);

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

  return {
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
  };
}
