import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocBlock, DocCommentAnchor, DocCommentReply, DocCommentThread } from '@lingyi-doc/core-doc';
import { appendCommentReply, applyRemoteCommentUpdate, createEmptyCommentThread, deleteCommentReply, deleteCommentThread, resolveCommentThread, toggleCommentReplyLike, updateCommentReply, type CommentUpdatePayload } from '@lingyi-doc/core-doc';

export interface DocCommentAuthor {
  authorId: string;
  authorName: string;
  authorAvatar?: string | null;
}

export interface UseDocCommentControllerOptions {
  enabled: boolean;
  canComment: boolean;
  commentAuthor?: DocCommentAuthor;
  initialThreads?: DocCommentThread[];
  remoteCommentUpdate?: CommentUpdatePayload | null;
  filterThread?: (thread: DocCommentThread) => boolean;
  onPersistCreate?: (input: {
    thread: DocCommentThread;
    blocks?: DocBlock[];
  }) => Promise<DocCommentThread | void>;
  onPersistReply?: (threadId: string, text: string) => Promise<DocCommentReply | void>;
  onPersistResolve?: (threadId: string) => Promise<void>;
  onPersistEdit?: (threadId: string, replyId: string, text: string) => Promise<DocCommentReply | void>;
  onPersistDelete?: (threadId: string, replyId: string) => Promise<{ threadDeleted: boolean } | void>;
  onPersistLike?: (threadId: string, replyId: string) => Promise<{ liked: boolean; likeCount: number; reply: DocCommentReply } | void>;
  onThreadDeleted?: (threadId: string) => void;
}

export function useDocCommentController({
  enabled,
  canComment,
  commentAuthor,
  initialThreads,
  remoteCommentUpdate = null,
  filterThread,
  onPersistCreate,
  onPersistReply,
  onPersistResolve,
  onPersistEdit,
  onPersistDelete,
  onPersistLike,
  onThreadDeleted,
}: UseDocCommentControllerOptions) {
  const author = commentAuthor ?? { authorId: 'local', authorName: '当前用户' };
  const [commentThreads, setCommentThreads] = useState<DocCommentThread[]>(initialThreads ?? []);
  const [showCommentPanel, setShowCommentPanel] = useState(false);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const commentThreadsRef = useRef(commentThreads);
  const remoteCommentSeqRef = useRef(0);

  useEffect(() => {
    commentThreadsRef.current = commentThreads;
  }, [commentThreads]);

  useEffect(() => {
    if (!enabled) {
      setCommentThreads([]);
      setShowCommentPanel(false);
      setSelectedCommentId(null);
      return;
    }
    if (initialThreads) {
      setCommentThreads(initialThreads);
    }
  }, [enabled, initialThreads]);

  useEffect(() => {
    if (!enabled || !remoteCommentUpdate) return;
    remoteCommentSeqRef.current += 1;
    const { threads } = applyRemoteCommentUpdate(commentThreadsRef.current, [], remoteCommentUpdate);
    setCommentThreads(threads);
    if (remoteCommentUpdate.action === 'thread_delete') {
      setSelectedCommentId(cur => (cur === remoteCommentUpdate.threadId ? null : cur));
      if (remoteCommentUpdate.threadId) onThreadDeleted?.(remoteCommentUpdate.threadId);
    }
  }, [enabled, remoteCommentUpdate, onThreadDeleted]);

  const visibleThreads = filterThread
    ? commentThreads.filter(filterThread)
    : commentThreads;

  const requestAddComment = useCallback((anchor: DocCommentAnchor) => {
    if (!canComment) return;
    const draft = createEmptyCommentThread(anchor);
    const thread = { ...draft, anchor };
    const prevThreads = commentThreadsRef.current;
    setCommentThreads(prev => [...prev, thread]);
    setShowCommentPanel(true);
    setSelectedCommentId(thread.id);

    void (async () => {
      try {
        const saved = await onPersistCreate?.({ thread });
        if (saved) {
          setCommentThreads(prev => prev.map(t => {
            if (t.id !== thread.id) return t;
            // 保留本地可能已被「替换落点」更新过的锚点，避免异步创建回写旧位置
            return { ...saved, anchor: t.anchor };
          }));
        }
      } catch {
        setCommentThreads(prevThreads);
        setSelectedCommentId(null);
      }
    })();
  }, [canComment, onPersistCreate]);

  const handleSelectComment = useCallback((id: string) => {
    setSelectedCommentId(id);
  }, []);

  const handleCommentReply = useCallback((threadId: string, text: string) => {
    if (!canComment) return;
    const prevThreads = commentThreadsRef.current;
    setCommentThreads(prev => appendCommentReply(prev, threadId, {
      ...author,
      text,
    }));
    void (async () => {
      try {
        const saved = await onPersistReply?.(threadId, text);
        if (!saved) return;
        setCommentThreads(prev => prev.map(thread => {
          if (thread.id !== threadId) return thread;
          if (thread.replies.some(r => r.id === saved.id)) return thread;
          const idx = thread.replies.findIndex(
            r => r.text === text && r.authorId === author.authorId,
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
  }, [canComment, onPersistReply, author]);

  const handleCommentResolve = useCallback((threadId: string) => {
    if (!canComment) return;
    const prevThreads = commentThreadsRef.current;
    setCommentThreads(prev => resolveCommentThread(prev, threadId));
    setSelectedCommentId(cur => (cur === threadId ? null : cur));
    void (async () => {
      try {
        await onPersistResolve?.(threadId);
      } catch {
        setCommentThreads(prevThreads);
      }
    })();
  }, [canComment, onPersistResolve]);

  const handleCommentEdit = useCallback((threadId: string, replyId: string, text: string) => {
    if (!canComment) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const prevThreads = commentThreadsRef.current;
    setCommentThreads(prev => updateCommentReply(prev, threadId, replyId, trimmed));
    void (async () => {
      try {
        const saved = await onPersistEdit?.(threadId, replyId, trimmed);
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
  }, [canComment, onPersistEdit]);

  const handleCommentDelete = useCallback((threadId: string, replyId: string) => {
    if (!canComment) return;
    const prevThreads = commentThreadsRef.current;
    const nextThreads = deleteCommentReply(commentThreadsRef.current, threadId, replyId);
    const threadRemoved = !nextThreads.some(t => t.id === threadId);
    setCommentThreads(nextThreads);
    if (threadRemoved) {
      setSelectedCommentId(cur => (cur === threadId ? null : cur));
      onThreadDeleted?.(threadId);
    }
    void (async () => {
      try {
        await onPersistDelete?.(threadId, replyId);
      } catch {
        setCommentThreads(prevThreads);
      }
    })();
  }, [canComment, onPersistDelete, onThreadDeleted]);

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
        const saved = await onPersistLike?.(threadId, replyId);
        if (!saved) return;
        setCommentThreads(prev => toggleCommentReplyLike(
          prev, threadId, replyId, saved.liked, saved.likeCount,
        ));
      } catch {
        setCommentThreads(prevThreads);
      }
    })();
  }, [onPersistLike]);

  return {
    commentThreads: visibleThreads,
    allCommentThreads: commentThreads,
    setCommentThreads,
    showCommentPanel,
    setShowCommentPanel,
    selectedCommentId,
    setSelectedCommentId,
    requestAddComment,
    handleSelectComment,
    handleCommentReply,
    handleCommentResolve,
    handleCommentEdit,
    handleCommentDelete,
    handleCommentLike,
    commentAuthor: author,
  };
}
