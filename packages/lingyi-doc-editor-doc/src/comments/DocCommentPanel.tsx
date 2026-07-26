import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { DocCommentThread } from '@lingyi-doc/core-doc';
import { DOC_COLORS } from '../styles';
import { DocCommentCard } from './DocCommentCard';
import { COMMENT_PANEL_WIDTH } from './commentStyles';

interface DocCommentPanelProps {
  threads: DocCommentThread[];
  selectedId: string | null;
  canComment?: boolean;
  currentAuthorId?: string;
  currentAuthorName?: string;
  currentAuthorAvatar?: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onResolve: (id: string) => void;
  onReply: (id: string, text: string) => void;
  onEditReply: (threadId: string, replyId: string, text: string) => void;
  onDeleteReply: (threadId: string, replyId: string) => void;
  onLikeReply: (threadId: string, replyId: string) => void;
  /** 创建草稿评论的首条回复 */
  onCreateReply?: (threadId: string, text: string) => void;
  /** 取消草稿评论 */
  onCancelDraft?: (threadId: string) => void;
}

export const DocCommentPanel: React.FC<DocCommentPanelProps> = ({
  threads,
  selectedId,
  canComment = false,
  currentAuthorId = '',
  currentAuthorName = '当前用户',
  currentAuthorAvatar,
  onSelect,
  onClose,
  onResolve,
  onReply,
  onEditReply,
  onDeleteReply,
  onLikeReply,
  onCreateReply,
  onCancelDraft,
}) => {
  const [width, setWidth] = useState(COMMENT_PANEL_WIDTH);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedCardRef = useRef<HTMLDivElement>(null);

  const activeThreads = threads.filter(t => !t.resolved);
  const selectedIndex = selectedId ? activeThreads.findIndex(t => t.id === selectedId) : -1;

  useEffect(() => {
    if (!selectedId || !selectedCardRef.current || !listRef.current) return;
    selectedCardRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId, activeThreads.length]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startW: width };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX;
      setWidth(Math.max(260, Math.min(420, dragRef.current.startW + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [width]);

  return (
    <div style={{
      width,
      flexShrink: 0,
      borderLeft: `1px solid ${DOC_COLORS.border}`,
      background: '#F7F8FA',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
    }}>
      <div
        onMouseDown={onMouseDown}
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
          cursor: 'col-resize', zIndex: 1,
        }}
      />
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: `1px solid ${DOC_COLORS.border}`,
        background: '#fff',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: DOC_COLORS.text }}>
          评论 ({activeThreads.length})
        </span>
        <button
          type="button"
          title="收起评论"
          onClick={onClose}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#86909C',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: '2px 4px',
          }}
        >
          »
        </button>
      </div>

      <div
        ref={listRef}
        style={{ flex: 1, overflow: 'auto', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {activeThreads.length === 0 ? (
          <div style={{ padding: '24px 12px', fontSize: 13, color: DOC_COLORS.muted, lineHeight: 1.6, textAlign: 'center' }}>
            选中文本后点击评论图标即可开始讨论
          </div>
        ) : (
          activeThreads.map(thread => (
            <div
              key={thread.id}
              ref={thread.id === selectedId ? selectedCardRef : undefined}
            >
              <DocCommentCard
                thread={thread}
                selected={thread.id === selectedId}
                canComment={canComment}
                currentAuthorId={currentAuthorId}
                currentAuthorName={currentAuthorName}
                currentAuthorAvatar={currentAuthorAvatar}
                canNavigateUp={selectedIndex > 0}
                canNavigateDown={selectedIndex >= 0 && selectedIndex < activeThreads.length - 1}
                onSelect={() => onSelect(thread.id)}
                onNavigateUp={() => {
                  if (selectedIndex > 0) onSelect(activeThreads[selectedIndex - 1].id);
                }}
                onNavigateDown={() => {
                  if (selectedIndex >= 0 && selectedIndex < activeThreads.length - 1) {
                    onSelect(activeThreads[selectedIndex + 1].id);
                  }
                }}
                onResolve={canComment ? () => onResolve(thread.id) : () => {}}
                onReply={canComment ? text => onReply(thread.id, text) : () => {}}
                onEditReply={(replyId, text) => onEditReply(thread.id, replyId, text)}
                onDeleteReply={replyId => onDeleteReply(thread.id, replyId)}
                onLikeReply={replyId => onLikeReply(thread.id, replyId)}
                onCreate={canComment ? text => onCreateReply?.(thread.id, text) : undefined}
                onCancelDraft={canComment ? () => onCancelDraft?.(thread.id) : undefined}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
};
