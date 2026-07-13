import type { DocCommentAnchor, DocCommentReply, DocCommentThread } from '@lingyi-doc/core';
import { authFetch } from '../stores/authStore';

const DOC_BASE = '/api/v1/c/docs';

export async function listDocumentComments(docId: string): Promise<DocCommentThread[]> {
  return authFetch<DocCommentThread[]>(`${DOC_BASE}/${docId}/comments`);
}

export async function createDocumentComment(
  docId: string,
  input: { id: string; anchor: DocCommentAnchor; text?: string },
): Promise<DocCommentThread> {
  return authFetch<DocCommentThread>(`${DOC_BASE}/${docId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function replyDocumentComment(
  docId: string,
  threadId: string,
  text: string,
): Promise<DocCommentReply> {
  return authFetch<DocCommentReply>(`${DOC_BASE}/${docId}/comments/${threadId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}

export async function resolveDocumentComment(
  docId: string,
  threadId: string,
): Promise<DocCommentThread> {
  return authFetch<DocCommentThread>(`${DOC_BASE}/${docId}/comments/${threadId}/resolve`, {
    method: 'PATCH',
  });
}

export async function editDocumentCommentReply(
  docId: string,
  threadId: string,
  replyId: string,
  text: string,
): Promise<DocCommentReply> {
  return authFetch<DocCommentReply>(`${DOC_BASE}/${docId}/comments/${threadId}/replies/${replyId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}

export async function deleteDocumentCommentReply(
  docId: string,
  threadId: string,
  replyId: string,
): Promise<{ threadDeleted: boolean }> {
  return authFetch<{ threadDeleted: boolean }>(
    `${DOC_BASE}/${docId}/comments/${threadId}/replies/${replyId}`,
    { method: 'DELETE' },
  );
}

export async function likeDocumentCommentReply(
  docId: string,
  threadId: string,
  replyId: string,
): Promise<{ liked: boolean; likeCount: number; reply: DocCommentReply }> {
  return authFetch<{ liked: boolean; likeCount: number; reply: DocCommentReply }>(
    `${DOC_BASE}/${docId}/comments/${threadId}/replies/${replyId}/like`,
    { method: 'POST' },
  );
}

export async function updateDocumentCommentAnchor(
  docId: string,
  threadId: string,
  pinX: number,
  pinY: number,
): Promise<DocCommentThread> {
  return authFetch<DocCommentThread>(`${DOC_BASE}/${docId}/comments/${threadId}/anchor`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pinX, pinY }),
  });
}
