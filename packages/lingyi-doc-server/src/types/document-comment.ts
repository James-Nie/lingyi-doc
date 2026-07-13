export interface DocCommentAnchorDto {
  blockId: string;
  start: number;
  end: number;
  quote: string;
  anchorType?: 'text' | 'sheet_cell' | 'sheet_record' | 'freeform_cell' | 'whiteboard_element' | 'whiteboard_mind_node';
  sheetId?: string;
  recordId?: string;
  fieldId?: string;
  viewId?: string;
  elementId?: string;
  mindNodeId?: string;
}

export interface DocCommentReplyDto {
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

export interface DocCommentThreadDto {
  id: string;
  anchor: DocCommentAnchorDto;
  replies: DocCommentReplyDto[];
  resolved: boolean;
  createdAt: number;
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
  thread?: DocCommentThreadDto;
  threadId?: string;
  reply?: DocCommentReplyDto;
  replyId?: string;
  liked?: boolean;
  likeCount?: number;
  anchor?: DocCommentAnchorDto;
}
