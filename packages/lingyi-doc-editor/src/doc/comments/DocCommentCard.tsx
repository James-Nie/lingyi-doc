import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DocCommentReply, DocCommentThread } from '@lingyi-doc/core';
import { formatCommentTime, truncateCommentQuote } from '@lingyi-doc/core';
import { DOC_COLORS } from '../styles';
import { COMMENT_CARD } from './commentStyles';

interface DocCommentCardProps {
  thread: DocCommentThread;
  selected: boolean;
  canComment?: boolean;
  currentAuthorId?: string;
  currentAuthorName?: string;
  currentAuthorAvatar?: string | null;
  canNavigateUp: boolean;
  canNavigateDown: boolean;
  onSelect: () => void;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onResolve: () => void;
  onReply: (text: string) => void;
  onEditReply: (replyId: string, text: string) => void;
  onDeleteReply: (replyId: string) => void;
  onLikeReply: (replyId: string) => void;
}

function Avatar({ name, src }: { name: string; src?: string | null }) {
  const initial = name.trim().slice(0, 1).toUpperCase() || '?';
  return (
    <div
      style={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: '#E8F3FF',
        color: '#3370FF',
        fontSize: 11,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {src
        ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initial}
    </div>
  );
}

function IconBtn({
  title,
  disabled,
  active,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={e => { e.stopPropagation(); onClick?.(); }}
      style={{
        width: 22,
        height: 22,
        border: 'none',
        borderRadius: 4,
        background: active ? '#F2F3F5' : 'transparent',
        color: disabled ? '#C9CDD4' : active ? DOC_COLORS.primary : '#86909C',
        cursor: disabled ? 'default' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

function ReplyMoreMenu({
  open,
  anchorRef,
  onEdit,
  onDelete,
  onClose,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.right - 120 });
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      data-sheet-keep-selection
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 10005,
        minWidth: 120,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        border: `1px solid ${DOC_COLORS.border}`,
        padding: '4px 0',
      }}
    >
      {[
        { id: 'edit', label: '编辑', onClick: onEdit },
        { id: 'delete', label: '删除', onClick: onDelete },
      ].map(item => (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            item.onClick();
            onClose();
          }}
          style={{
            display: 'block',
            width: '100%',
            padding: '8px 14px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 14,
            color: item.id === 'delete' ? '#F53F3F' : DOC_COLORS.text,
            textAlign: 'left',
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

function CommentReplyItem({
  reply,
  selected,
  canComment,
  isOwn,
  onLike,
  onFocusReply,
  onEdit,
  onDelete,
}: {
  reply: DocCommentReply;
  selected: boolean;
  canComment: boolean;
  isOwn: boolean;
  onLike: () => void;
  onFocusReply: () => void;
  onEdit: (text: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(reply.text);
  const [menuOpen, setMenuOpen] = useState(false);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) editRef.current?.focus({ preventScroll: true });
  }, [editing]);

  const submitEdit = () => {
    const text = editText.trim();
    if (!text || text === reply.text) {
      setEditing(false);
      setEditText(reply.text);
      return;
    }
    onEdit(text);
    setEditing(false);
  };

  return (
    <div style={{ marginTop: reply === undefined ? 0 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Avatar name={reply.authorName} src={reply.authorAvatar} />
        <span style={{ fontSize: 13, fontWeight: 500, color: COMMENT_CARD.textColor }}>
          {reply.authorName}
        </span>
        <span style={{ fontSize: 12, color: COMMENT_CARD.metaColor }}>
          {formatCommentTime(reply.updatedAt ?? reply.createdAt)}
        </span>
        {selected && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconBtn
              title="点赞"
              active={!!reply.likedByMe}
              onClick={onLike}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={reply.likedByMe ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
                <path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
              </svg>
            </IconBtn>
            {(reply.likeCount ?? 0) > 0 && (
              <span style={{ fontSize: 12, color: COMMENT_CARD.metaColor, minWidth: 12 }}>
                {reply.likeCount}
              </span>
            )}
            {canComment && (
              <IconBtn title="回复" onClick={onFocusReply}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </IconBtn>
            )}
            {canComment && isOwn && (
              <>
                <button
                  ref={moreBtnRef}
                  type="button"
                  title="更多"
                  onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
                  style={{
                    width: 22,
                    height: 22,
                    border: 'none',
                    borderRadius: 4,
                    background: menuOpen ? '#F2F3F5' : 'transparent',
                    color: '#86909C',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                >
                  ⋯
                </button>
                <ReplyMoreMenu
                  open={menuOpen}
                  anchorRef={moreBtnRef}
                  onEdit={() => {
                    setEditText(reply.text);
                    setEditing(true);
                  }}
                  onDelete={onDelete}
                  onClose={() => setMenuOpen(false)}
                />
              </>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div style={{ paddingLeft: 32 }} onClick={e => e.stopPropagation()}>
          <textarea
            ref={editRef}
            value={editText}
            onChange={e => setEditText(e.target.value)}
            rows={2}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitEdit();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setEditing(false);
                setEditText(reply.text);
              }
            }}
            style={{
              width: '100%',
              resize: 'none',
              border: `1px solid ${COMMENT_CARD.replyBorder}`,
              borderRadius: 6,
              padding: '8px 10px',
              fontSize: 14,
              lineHeight: 1.5,
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setEditText(reply.text);
              }}
              style={{
                height: 26,
                padding: '0 10px',
                border: `1px solid ${DOC_COLORS.border}`,
                borderRadius: 6,
                background: '#fff',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={submitEdit}
              style={{
                height: 26,
                padding: '0 10px',
                border: 'none',
                borderRadius: 6,
                background: DOC_COLORS.primary,
                color: '#fff',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              保存
            </button>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 14, lineHeight: 1.6, color: COMMENT_CARD.textColor, paddingLeft: 32 }}>
          {reply.text}
        </div>
      )}
    </div>
  );
}

export const DocCommentCard: React.FC<DocCommentCardProps> = ({
  thread,
  selected,
  canComment = false,
  currentAuthorId = '',
  currentAuthorName = '当前用户',
  currentAuthorAvatar,
  canNavigateUp,
  canNavigateDown,
  onSelect,
  onNavigateUp,
  onNavigateDown,
  onResolve,
  onReply,
  onEditReply,
  onDeleteReply,
  onLikeReply,
}) => {
  const [reply, setReply] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const firstReply = thread.replies[0];
  const showAuthorRow = firstReply || (selected && canComment);
  const authorName = firstReply?.authorName ?? currentAuthorName;
  const authorAvatar = firstReply?.authorAvatar ?? currentAuthorAvatar;

  useEffect(() => {
    if (selected && !firstReply) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [selected, firstReply]);

  const submitReply = () => {
    const text = reply.trim();
    if (!text) return;
    onReply(text);
    setReply('');
  };

  const focusReplyInput = () => {
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
      style={{
        position: 'relative',
        background: COMMENT_CARD.bg,
        border: `1px solid ${COMMENT_CARD.border}`,
        borderRadius: COMMENT_CARD.radius,
        boxShadow: selected ? COMMENT_CARD.shadowSelected : COMMENT_CARD.shadowIdle,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s ease',
      }}
    >
      {selected && (
        <div style={{ height: COMMENT_CARD.topBarHeight, background: COMMENT_CARD.topBar }} />
      )}

      <div style={{ padding: selected ? '10px 12px 12px' : '12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              borderLeft: `2px solid ${COMMENT_CARD.quoteBorder}`,
              paddingLeft: 8,
              fontSize: 12,
              lineHeight: 1.5,
              color: COMMENT_CARD.quoteColor,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {truncateCommentQuote(thread.anchor.quote, 24)}
          </div>
          {selected && canComment && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
              <IconBtn title="上一条" disabled={!canNavigateUp} onClick={onNavigateUp}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 15l-6-6-6 6" />
                </svg>
              </IconBtn>
              <IconBtn title="下一条" disabled={!canNavigateDown} onClick={onNavigateDown}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </IconBtn>
              <IconBtn title="解决评论" onClick={onResolve}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </IconBtn>
            </div>
          )}
        </div>

        {!firstReply && showAuthorRow && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Avatar name={authorName} src={authorAvatar} />
            <span style={{ fontSize: 13, fontWeight: 500, color: COMMENT_CARD.textColor }}>
              {authorName}
            </span>
          </div>
        )}

        {firstReply && (
          <CommentReplyItem
            reply={firstReply}
            selected={selected}
            canComment={canComment}
            isOwn={firstReply.authorId === currentAuthorId}
            onLike={() => onLikeReply(firstReply.id)}
            onFocusReply={focusReplyInput}
            onEdit={text => onEditReply(firstReply.id, text)}
            onDelete={() => onDeleteReply(firstReply.id)}
          />
        )}

        {thread.replies.length > 1 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {thread.replies.slice(1).map(replyItem => (
              <CommentReplyItem
                key={replyItem.id}
                reply={replyItem}
                selected={selected}
                canComment={canComment}
                isOwn={replyItem.authorId === currentAuthorId}
                onLike={() => onLikeReply(replyItem.id)}
                onFocusReply={focusReplyInput}
                onEdit={text => onEditReply(replyItem.id, text)}
                onDelete={() => onDeleteReply(replyItem.id)}
              />
            ))}
          </div>
        )}

        {selected && canComment && (
          <div
            style={{ position: 'relative', marginTop: firstReply ? 10 : 0 }}
            onClick={e => e.stopPropagation()}
          >
            <textarea
              ref={inputRef}
              value={reply}
              onChange={e => setReply(e.target.value)}
              placeholder={firstReply ? '回复' : '输入评论'}
              rows={1}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitReply();
                }
              }}
              style={{
                width: '100%',
                minHeight: 36,
                resize: 'none',
                border: `1px solid ${COMMENT_CARD.replyBorder}`,
                borderRadius: 6,
                padding: '8px 10px',
                fontSize: 14,
                lineHeight: 1.5,
                outline: 'none',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
