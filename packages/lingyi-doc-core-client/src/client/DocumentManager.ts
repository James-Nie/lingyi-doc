import { Workbook } from '@lingyi-doc/core-sheet';
import { RichDocument, type RichDocumentJSON } from '@lingyi-doc/core-doc';
import { MindNoteDocument, type MindNoteJSON } from '@lingyi-doc/core-mindmap';
import {
  WhiteboardDocument,
  normalizeWhiteboardData,
  type WhiteboardJSON,
} from '@lingyi-doc/core-whiteboard';
import type { PatchRequest, PatchResult } from '@lingyi-doc/core-io';
import { DocumentPatchConflictError, requireDocumentHandler } from '@lingyi-doc/core-io';
import { deriveWorkbookDocType } from '@lingyi-doc/core-sheet';
import type { ActiveSheetType, RecordHistoryPayloadEntry } from '@lingyi-doc/core-types';

/** 避免 pathname 已是 percent-encoding 时二次 encode 导致 404 */
function encodePathSegment(segment: string): string {
  let cur = segment;
  for (let i = 0; i < 3; i++) {
    if (!/%[0-9A-Fa-f]{2}/.test(cur)) break;
    try {
      const next = decodeURIComponent(cur);
      if (next === cur) break;
      cur = next;
    } catch {
      break;
    }
  }
  return encodeURIComponent(cur);
}

export interface DocumentListItem {
  id: string;
  title: string;
  docType: string;
  ownerId?: string | null;
  ownerName?: string | null;
  location: string;
  createdAt: number;
  updatedAt: number;
  lastVisitedAt: number;
  /** 公开路径片段，列表返回后可直接跳转，无需再调 path 接口 */
  docSlug?: string | null;
  spaceSlug?: string | null;
  bookSlug?: string | null;
  sharePermission?: 'none' | 'read' | 'comment' | 'edit' | 'manage';
  sharedByName?: string;
}

export interface RecycleBinItem {
  id: string;
  title: string;
  docType: string;
  operatorName: string;
  deletedAt: number;
  daysRemaining: number;
}

export interface UploadedFileInfo {
  url: string;
  objectKey: string;
  name: string;
  size: number;
  mimeType: string;
}

interface ApiEnvelope<T> {
  code: number;
  data?: T;
  message?: string;
}

export type DocumentPermission = 'owner' | 'none' | 'read' | 'comment' | 'edit' | 'manage';
export type DocumentViewMode = 'edit' | 'preview';

export interface DocumentApiResponse {
  id?: string;
  title: string;
  docType: string;
  version?: number;
  data: unknown;
  permission?: DocumentPermission;
  canEdit?: boolean;
  viewMode?: DocumentViewMode;
}

let apiBase = '/api/v1';
let getAccessToken: (() => string | null) | null = null;
let refreshAccessToken: (() => Promise<boolean>) | null = null;
let onSessionExpired: (() => void) | null = null;
let onDocumentListChanged: (() => void) | null = null;

const AUTH_ERROR_CODES = new Set([110001, 110002, 110004]);

function notifyDocumentListChanged(): void {
  onDocumentListChanged?.();
}

/** 配置 API 地址（默认 /api/v1，开发环境由 Vite 代理） */
export function configureDocumentManager(config: {
  apiBase?: string;
  getAccessToken?: () => string | null;
  refreshAccessToken?: () => Promise<boolean>;
  onSessionExpired?: () => void;
  onDocumentListChanged?: () => void;
}): void {
  if (config.apiBase) apiBase = config.apiBase.replace(/\/$/, '');
  if (config.getAccessToken) getAccessToken = config.getAccessToken;
  if (config.refreshAccessToken) refreshAccessToken = config.refreshAccessToken;
  if (config.onSessionExpired) onSessionExpired = config.onSessionExpired;
  if (config.onDocumentListChanged) onDocumentListChanged = config.onDocumentListChanged;
}

function authHeaders(): Record<string, string> {
  const token = getAccessToken?.();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const inflightGetRequests = new Map<string, Promise<unknown>>();

async function requestOnce<T>(path: string, options?: RequestInit, retried = false): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    ...options,
    // keepalive 允许页面卸载时仍发出请求
    keepalive: options?.keepalive,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...options?.headers,
    },
  });

  let json: ApiEnvelope<T>;
  try {
    json = await res.json();
  } catch {
    throw new Error(`请求失败 (${res.status})`);
  }

  if ((!res.ok || json.code !== 0) && !retried && refreshAccessToken && AUTH_ERROR_CODES.has(json.code ?? 0)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return requestOnce<T>(path, options, true);
    onSessionExpired?.();
  }

  if (!res.ok || json.code !== 0) {
    throw new Error(json.message || `请求失败 (${res.status})`);
  }

  return json.data as T;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? 'GET').toUpperCase();
  if (method === 'GET') {
    const pending = inflightGetRequests.get(path);
    if (pending) return pending as Promise<T>;
    const next = requestOnce<T>(path, options).finally(() => {
      inflightGetRequests.delete(path);
    });
    inflightGetRequests.set(path, next);
    return next;
  }
  return requestOnce<T>(path, options);
}

async function patchRequest(
  path: string,
  body: PatchRequest,
  retried = false,
  opts?: { keepalive?: boolean },
): Promise<PatchResult> {
  const res = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    keepalive: opts?.keepalive,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });

  let json: ApiEnvelope<PatchResult & { currentVersion?: number }>;
  try {
    json = await res.json();
  } catch {
    throw new Error(`请求失败 (${res.status})`);
  }

  if (json.code === 200010) {
    throw new DocumentPatchConflictError(json.data?.currentVersion ?? 0);
  }

  if ((!res.ok || json.code !== 0) && !retried && refreshAccessToken && AUTH_ERROR_CODES.has(json.code ?? 0)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return patchRequest(path, body, true, opts);
    onSessionExpired?.();
  }

  if (!res.ok || json.code !== 0) {
    throw new Error(json.message || `请求失败 (${res.status})`);
  }

  return json.data as PatchResult;
}

export class DocumentManager {
  /** 供 DashboardApi 等模块复用同一套鉴权请求 */
  static requestJson<T>(path: string, options?: RequestInit): Promise<T> {
    return request<T>(path, options);
  }

  /** 拉取文档原始响应（供路由层一次加载、多编辑器复用） */
  static async fetchDocument(docId: string): Promise<DocumentApiResponse> {
    return request<DocumentApiResponse>(`/docs/${docId}`);
  }

  /** 按路径加载文档（权限与 viewMode 由后端根据当前用户/分享 token 决定） */
  static async fetchDocumentByPath(
    spaceSlug: string,
    bookSlug: string,
    docSlug: string,
    options?: { token?: string },
  ): Promise<DocumentApiResponse> {
    const qs = new URLSearchParams();
    if (options?.token) qs.set('token', options.token);
    const query = qs.toString();
    return request<DocumentApiResponse>(
      `/c/docs/by-path/${encodePathSegment(spaceSlug)}/${encodePathSegment(bookSlug)}/${encodePathSegment(docSlug)}${query ? `?${query}` : ''}`,
    );
  }

  /** 带密码的公开路径访问验证 */
  static async verifyDocumentByPath(
    spaceSlug: string,
    bookSlug: string,
    docSlug: string,
    input: { token?: string; password?: string },
  ): Promise<DocumentApiResponse> {
    return request<DocumentApiResponse>(
      `/docs/by-path/${encodePathSegment(spaceSlug)}/${encodePathSegment(bookSlug)}/${encodePathSegment(docSlug)}/access`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  }

  /** 新建富文本文档 */
  static async createRichText(title: string): Promise<string> {
    const handler = requireDocumentHandler('richtext');
    const document = handler.create(title) as RichDocument;
    document.title = title;
    const data = await request<{ id: string }>('/docs', {
      method: 'POST',
      body: JSON.stringify({ title, docType: 'richtext', data: handler.toJSON(document) }),
    });
    notifyDocumentListChanged();
    return data.id;
  }

  /** 从已构建的 RichDocument 创建富文本文档（用于文件导入） */
  static async createRichTextFromDocument(title: string, document: RichDocument): Promise<string> {
    document.title = title;
    const handler = requireDocumentHandler('richtext');
    const data = await request<{ id: string }>('/docs', {
      method: 'POST',
      body: JSON.stringify({ title, docType: 'richtext', data: handler.toJSON(document) }),
    });
    notifyDocumentListChanged();
    return data.id;
  }

  /** 加载富文本文档 */
  static async loadRichText(
    docId: string,
    prefetched?: DocumentApiResponse,
  ): Promise<{ title: string; version: number; document: RichDocument } | null> {
    try {
      const doc = prefetched ?? await DocumentManager.fetchDocument(docId);
      if (!doc?.data) return null;
      const json = doc.data as RichDocumentJSON;
      const document = requireDocumentHandler('richtext').fromJSON({
        ...json,
        documentId: docId,
        title: doc.title || json.title || '未命名文档',
      }) as RichDocument;
      document.documentId = docId;
      return { title: doc.title, version: doc.version ?? 0, document };
    } catch {
      return null;
    }
  }

  static async saveRichText(docId: string, title: string, document: RichDocument): Promise<{ version: number }> {
    document.documentId = docId;
    document.title = title;
    const handler = requireDocumentHandler('richtext');
    const result = await request<{ version?: number }>(`/docs/${docId}`, {
      method: 'PUT',
      body: JSON.stringify({ title, docType: 'richtext', data: handler.toJSON(document) }),
    });
    return { version: result.version ?? 0 };
  }

  /** 新建思维笔记 */
  static async createMindNote(title: string): Promise<string> {
    const document = requireDocumentHandler('mindnote').create(title) as MindNoteDocument;
    return DocumentManager.createMindNoteFromDocument(title, document);
  }

  /** 从已构建的 MindNoteDocument 创建思维笔记（用于模板） */
  static async createMindNoteFromDocument(title: string, document: MindNoteDocument): Promise<string> {
    document.title = title;
    const handler = requireDocumentHandler('mindnote');
    const data = await request<{ id: string }>('/docs', {
      method: 'POST',
      body: JSON.stringify({ title, docType: 'mindnote', data: handler.toJSON(document) }),
    });
    notifyDocumentListChanged();
    return data.id;
  }

  /** 加载思维笔记 */
  static async loadMindNote(
    docId: string,
    prefetched?: DocumentApiResponse,
  ): Promise<{ title: string; version: number; document: MindNoteDocument } | null> {
    try {
      const doc = prefetched ?? await DocumentManager.fetchDocument(docId);
      if (!doc?.data) return null;
      const json = normalizeMindNoteData(doc.data as MindNoteJSON, docId, doc.title);
      const document = requireDocumentHandler('mindnote').fromJSON(json) as MindNoteDocument;
      document.documentId = docId;
      return { title: doc.title, version: doc.version ?? 0, document };
    } catch {
      return null;
    }
  }

  static async saveMindNote(docId: string, title: string, document: MindNoteDocument): Promise<{ version: number }> {
    document.documentId = docId;
    document.title = title;
    const handler = requireDocumentHandler('mindnote');
    const result = await request<{ version?: number }>(`/docs/${docId}`, {
      method: 'PUT',
      body: JSON.stringify({ title, docType: 'mindnote', data: handler.toJSON(document) }),
    });
    return { version: result.version ?? 0 };
  }

  /** 新建画板 */
  static async createWhiteboard(title: string): Promise<string> {
    const document = requireDocumentHandler('whiteboard').create(title) as WhiteboardDocument;
    return DocumentManager.createWhiteboardFromDocument(title, document);
  }

  /** 从已构建的 WhiteboardDocument 创建画板 */
  static async createWhiteboardFromDocument(title: string, document: WhiteboardDocument): Promise<string> {
    document.title = title;
    const handler = requireDocumentHandler('whiteboard');
    const data = await request<{ id: string }>('/docs', {
      method: 'POST',
      body: JSON.stringify({ title, docType: 'whiteboard', data: handler.toJSON(document) }),
    });
    notifyDocumentListChanged();
    return data.id;
  }

  /** 加载画板 */
  static async loadWhiteboard(
    docId: string,
    prefetched?: DocumentApiResponse,
  ): Promise<{ title: string; version: number; document: WhiteboardDocument } | null> {
    try {
      const doc = prefetched ?? await DocumentManager.fetchDocument(docId);
      if (!doc?.data) return null;
      const json = normalizeWhiteboardData(doc.data as WhiteboardJSON, docId, doc.title);
      const document = requireDocumentHandler('whiteboard').fromJSON(json) as WhiteboardDocument;
      document.documentId = docId;
      return { title: doc.title, version: doc.version ?? 0, document };
    } catch {
      return null;
    }
  }

  static async saveWhiteboard(docId: string, title: string, document: WhiteboardDocument): Promise<{ version: number }> {
    document.documentId = docId;
    document.title = title;
    const handler = requireDocumentHandler('whiteboard');
    const result = await request<{ version?: number }>(`/docs/${docId}`, {
      method: 'PUT',
      body: JSON.stringify({ title, docType: 'whiteboard', data: handler.toJSON(document) }),
    });
    return { version: result.version ?? 0 };
  }

  /** 获取文档元信息（不解析正文） */
  static async getDocMeta(
    docId: string,
    prefetched?: DocumentApiResponse,
  ): Promise<{ title: string; docType: string } | null> {
    try {
      const doc = prefetched ?? await DocumentManager.fetchDocument(docId);
      return { title: doc.title, docType: doc.docType || 'freeform' };
    } catch {
      return null;
    }
  }

  /** 新建文档 */
  static async create(
    title: string,
    workbook: Workbook,
    docType: ActiveSheetType = 'freeform',
  ): Promise<string> {
    const handler = requireDocumentHandler('workbook');
    const data = await request<{ id: string }>('/docs', {
      method: 'POST',
      body: JSON.stringify({ title, docType, data: handler.toJSON(workbook) }),
    });
    notifyDocumentListChanged();
    return data.id;
  }

  /** 保存文档 */
  static async save(
    docId: string,
    title: string,
    workbook: Workbook,
    opts?: { keepalive?: boolean; recordHistory?: RecordHistoryPayloadEntry[] },
  ): Promise<{ version: number }> {
    workbook.prepareForSave();
    const docType = deriveWorkbookDocType(workbook.sheets.map(s => s.type));
    const handler = requireDocumentHandler('workbook');
    const result = await request<{ version?: number }>(`/docs/${docId}`, {
      method: 'PUT',
      keepalive: opts?.keepalive,
      body: JSON.stringify({
        title,
        docType,
        data: handler.toJSON(workbook),
        recordHistory: opts?.recordHistory,
      }),
    });
    return { version: result.version ?? 0 };
  }

  static async patch(
    docId: string,
    input: PatchRequest,
    opts?: { keepalive?: boolean },
  ): Promise<PatchResult> {
    return patchRequest(`/docs/${docId}/patch`, input, false, opts);
  }

  /** 分页读取某条多维表记录的行级变更历史（详情抽屉「历史」页） */
  static async listRecordHistory(
    docId: string,
    recordId: string,
    page = 1,
    pageSize = 50,
  ): Promise<{ items: RecordHistoryPayloadEntry[]; total: number; hasMore: boolean }> {
    return request(`/docs/${docId}/records/${encodePathSegment(recordId)}/history?page=${page}&pageSize=${pageSize}`);
  }

  static async load(
    docId: string,
    prefetched?: DocumentApiResponse,
  ): Promise<{ title: string; docType: string; version: number; workbook: Workbook } | null> {
    try {
      const doc = prefetched ?? await DocumentManager.fetchDocument(docId);
      if (!doc?.data) return null;
      const workbook = requireDocumentHandler('workbook').fromJSON(doc.data) as Workbook;
      workbook.normalizeAfterLoad(doc.docType);
      const docType = deriveWorkbookDocType(workbook.sheets.map(s => s.type));
      return {
        title: doc.title,
        docType,
        version: doc.version ?? 0,
        workbook,
      };
    } catch {
      return null;
    }
  }

  /** 我的文档库（未挂知识库） */
  static async list(sortBy: 'lastVisited' | 'created' | 'updated' = 'lastVisited'): Promise<DocumentListItem[]> {
    const data = await request<{ items: DocumentListItem[]; total: number }>(
      `/docs?sortBy=${sortBy}`,
    );
    return data.items || [];
  }

  /** 归我所有（文档库 + 知识库内我创建的文档） */
  static async listOwned(sortBy: 'lastVisited' | 'created' | 'updated' = 'lastVisited'): Promise<DocumentListItem[]> {
    const data = await request<{ items: DocumentListItem[]; total: number }>(
      `/docs/owned?sortBy=${sortBy}`,
    );
    return data.items || [];
  }

  /** 最近访问（严格 per-user，默认近 30 天） */
  static async listRecent(
    sortBy: 'lastVisited' | 'created' | 'updated' = 'lastVisited',
    days = 30,
  ): Promise<DocumentListItem[]> {
    const data = await request<{ items: DocumentListItem[]; total: number }>(
      `/docs/recent?sortBy=${sortBy}&days=${days}`,
    );
    return data.items || [];
  }

  /** 与我共享的文档列表 */
  static async listSharedWithMe(sortBy: 'lastVisited' | 'created' | 'updated' = 'lastVisited'): Promise<DocumentListItem[]> {
    const data = await request<{ items: DocumentListItem[]; total: number }>(
      `/docs/shared-with-me?sortBy=${sortBy}`,
    );
    return data.items || [];
  }

  /** 删除文档（移入回收站） */
  static async delete(docId: string): Promise<boolean> {
    const data = await request<{ success: boolean }>(`/docs/${docId}`, { method: 'DELETE' });
    if (data.success) notifyDocumentListChanged();
    return data.success;
  }

  /** 回收站列表 */
  static async listRecycleBin(): Promise<RecycleBinItem[]> {
    const data = await request<{ items: RecycleBinItem[]; total: number }>('/docs/recycle-bin');
    return data.items || [];
  }

  /** 从回收站恢复 */
  static async restore(docId: string): Promise<boolean> {
    const data = await request<{ success: boolean }>(`/docs/${docId}/restore`, { method: 'POST' });
    if (data.success) notifyDocumentListChanged();
    return data.success;
  }

  /** 彻底删除 */
  static async permanentDelete(docId: string): Promise<boolean> {
    const data = await request<{ success: boolean }>(`/docs/${docId}/permanent`, { method: 'DELETE' });
    return data.success;
  }

  /** 创建文档副本，返回新文档 ID */
  static async duplicate(docId: string): Promise<string> {
    const doc = await request<{
      title: string;
      docType: string;
      data: unknown;
    }>(`/docs/${docId}`);
    if (!doc?.data) throw new Error('文档不存在');

    const title = `${doc.title || '未命名文档'} 副本`;
    const docType = doc.docType || 'freeform';

    if (docType === 'richtext') {
      const json = doc.data as RichDocumentJSON;
      const document = requireDocumentHandler('richtext').fromJSON({
        ...json,
        documentId: '',
        title,
      }) as RichDocument;
      return DocumentManager.createRichTextFromDocument(title, document);
    }

    if (docType === 'mindnote') {
      const json = normalizeMindNoteData(doc.data as MindNoteJSON, '', title);
      const document = requireDocumentHandler('mindnote').fromJSON(json) as MindNoteDocument;
      return DocumentManager.createMindNoteFromDocument(title, document);
    }

    if (docType === 'whiteboard') {
      const json = normalizeWhiteboardData(doc.data as WhiteboardJSON, '', title);
      const document = requireDocumentHandler('whiteboard').fromJSON(json) as WhiteboardDocument;
      return DocumentManager.createWhiteboardFromDocument(title, document);
    }

    const workbook = requireDocumentHandler('workbook').fromJSON(doc.data) as Workbook;
    workbook.normalizeAfterLoad(docType);
    const sheetDocType = deriveWorkbookDocType(workbook.sheets.map(s => s.type));
    return DocumentManager.create(title, workbook, sheetDocType);
  }

  /** 获取文档 canonical 路径 */
  static async resolveDocPath(docId: string): Promise<{
    spaceSlug: string;
    bookSlug: string;
    docSlug: string;
  }> {
    return request<{ spaceSlug: string; bookSlug: string; docSlug: string }>(`/c/docs/${docId}/path`);
  }

  /** 获取文档分享链接（canonical 路径） */
  static async getShareUrl(docId: string): Promise<string> {
    const path = await DocumentManager.resolveDocPath(docId);
    const href = `/${path.spaceSlug}/${path.bookSlug}/${path.docSlug}`;
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${href}`;
    }
    return href;
  }

  /** @deprecated 请使用 getShareUrl(docId) */
  static getLegacyShareUrl(docId: string): string {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/doc/${docId}`;
    }
    return `/doc/${docId}`;
  }

  /** 复制文档链接到剪贴板 */
  static async copyLink(docId: string): Promise<void> {
    const url = await DocumentManager.getShareUrl(docId);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  /** 更新文档基本信息（标题、描述等），不读写正文 */
  static async updateMeta(
    docId: string,
    meta: { title?: string; description?: string | null },
  ): Promise<{ id: string; title: string; description: string | null; version: number; updatedAt: number }> {
    return request(`/docs/${docId}/meta`, {
      method: 'PATCH',
      body: JSON.stringify(meta),
    });
  }

  /** 重命名文档标题（仅更新元信息） */
  static async renameTitle(docId: string, title: string): Promise<void> {
    await DocumentManager.updateMeta(docId, { title: title.trim() });
    notifyDocumentListChanged();
  }

  /** 导出文档 JSON */
  static async export(docId: string): Promise<Blob | null> {
    const fetchOnce = async (retried = false): Promise<Blob | null> => {
      const res = await fetch(`${apiBase}/docs/${docId}/export`, { headers: authHeaders() });
      if (!res.ok) {
        if (!retried && refreshAccessToken) {
          try {
            const json = await res.clone().json() as ApiEnvelope<unknown>;
            if (AUTH_ERROR_CODES.has(json.code ?? 0)) {
              const refreshed = await refreshAccessToken();
              if (refreshed) return fetchOnce(true);
              onSessionExpired?.();
            }
          } catch { /* ignore */ }
        }
        return null;
      }
      return res.blob();
    };
    return fetchOnce();
  }

  /** 上传文件到 OSS（经服务端 /c/uploads） */
  static async uploadFile(file: File | Blob, fileName?: string): Promise<UploadedFileInfo> {
    const formData = new FormData();
    const name = fileName ?? (file instanceof File ? file.name : 'file');
    formData.append('file', file, name);

    const uploadOnce = async (retried = false): Promise<UploadedFileInfo> => {
      const res = await fetch(`${apiBase}/c/uploads`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });

      let json: ApiEnvelope<UploadedFileInfo>;
      try {
        json = await res.json();
      } catch {
        throw new Error(`上传失败 (${res.status})`);
      }

      if ((!res.ok || json.code !== 0) && !retried && refreshAccessToken && AUTH_ERROR_CODES.has(json.code ?? 0)) {
        const refreshed = await refreshAccessToken();
        if (refreshed) return uploadOnce(true);
        onSessionExpired?.();
      }

      if (!res.ok || json.code !== 0 || !json.data) {
        throw new Error(json.message || `上传失败 (${res.status})`);
      }

      return json.data;
    };

    return uploadOnce();
  }

  /** 拉取图片/附件并转为 data URL，供 Word/PDF 导出内嵌 */
  static async fetchAssetAsDataUrl(url: string): Promise<string> {
    if (!url) return url;
    if (url.startsWith('data:')) return url;

    const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? url));
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.readAsDataURL(blob);
    });

    if (url.startsWith('blob:')) {
      const blob = await fetch(url).then(res => {
        if (!res.ok) throw new Error(`资源加载失败 (${res.status})`);
        return res.blob();
      });
      return blobToDataUrl(blob);
    }

    const absolute = url.startsWith('http://') || url.startsWith('https://')
      ? url
      : `${typeof window !== 'undefined' ? window.location.origin : ''}${url.startsWith('/') ? url : `/${url}`}`;

    const fetchOnce = async (retried = false): Promise<Blob> => {
      const res = await fetch(absolute, { headers: authHeaders() });
      if (!res.ok) {
        if (!retried && refreshAccessToken && res.status === 401) {
          const refreshed = await refreshAccessToken();
          if (refreshed) return fetchOnce(true);
          onSessionExpired?.();
        }
        throw new Error(`资源加载失败 (${res.status})`);
      }
      return res.blob();
    };

    const blob = await fetchOnce();
    return blobToDataUrl(blob);
  }
}

function normalizeMindNoteData(data: MindNoteJSON, docId: string, title?: string): MindNoteJSON {
  return {
    ...data,
    documentId: docId,
    title: title || data.title || '未命名思维笔记',
  };
}
