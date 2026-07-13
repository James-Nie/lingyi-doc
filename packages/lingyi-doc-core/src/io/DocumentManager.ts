import { Workbook } from '../model/Workbook';
import { RichDocument, createEmptyDocument, type RichDocumentJSON } from '../doc/index';
import { MindNoteDocument, createEmptyMindNote, type MindNoteJSON } from '../mindnote/index';
import {
  WhiteboardDocument,
  createEmptyWhiteboard,
  normalizeWhiteboardData,
  type WhiteboardJSON,
} from '../whiteboard/index';
import type { PatchRequest, PatchResult } from './patch/types';
import { DocumentPatchConflictError } from './patch/types';
import { deriveWorkbookDocType } from '../utils/sheetType';
import type { ActiveSheetType } from '../types/index';

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

async function patchRequest(path: string, body: PatchRequest, retried = false): Promise<PatchResult> {
  const res = await fetch(`${apiBase}${path}`, {
    method: 'POST',
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
    if (refreshed) return patchRequest(path, body, true);
    onSessionExpired?.();
  }

  if (!res.ok || json.code !== 0) {
    throw new Error(json.message || `请求失败 (${res.status})`);
  }

  return json.data as PatchResult;
}

export class DocumentManager {
  /** 拉取文档原始响应（供路由层一次加载、多编辑器复用） */
  static async fetchDocument(docId: string): Promise<DocumentApiResponse> {
    return request<DocumentApiResponse>(`/docs/${docId}`);
  }

  /** 按语雀风格路径加载文档（权限与 viewMode 由后端根据当前用户/分享 token 决定） */
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
      `/c/docs/by-path/${encodeURIComponent(spaceSlug)}/${encodeURIComponent(bookSlug)}/${encodeURIComponent(docSlug)}${query ? `?${query}` : ''}`,
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
      `/docs/by-path/${encodeURIComponent(spaceSlug)}/${encodeURIComponent(bookSlug)}/${encodeURIComponent(docSlug)}/access`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  }

  /** 新建富文本文档 */
  static async createRichText(title: string): Promise<string> {
    const json = createEmptyDocument('', title);
    const data = await request<{ id: string }>('/docs', {
      method: 'POST',
      body: JSON.stringify({ title, docType: 'richtext', data: json }),
    });
    notifyDocumentListChanged();
    return data.id;
  }

  /** 从已构建的 RichDocument 创建富文本文档（用于文件导入） */
  static async createRichTextFromDocument(title: string, document: RichDocument): Promise<string> {
    document.title = title;
    const data = await request<{ id: string }>('/docs', {
      method: 'POST',
      body: JSON.stringify({ title, docType: 'richtext', data: document.toJSON() }),
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
      const document = RichDocument.fromJSON({
        ...json,
        documentId: docId,
        title: doc.title || json.title || '未命名文档',
      });
      document.documentId = docId;
      return { title: doc.title, version: doc.version ?? 0, document };
    } catch {
      return null;
    }
  }

  static async saveRichText(docId: string, title: string, document: RichDocument): Promise<{ version: number }> {
    document.documentId = docId;
    document.title = title;
    const result = await request<{ version?: number }>(`/docs/${docId}`, {
      method: 'PUT',
      body: JSON.stringify({ title, docType: 'richtext', data: document.toJSON() }),
    });
    return { version: result.version ?? 0 };
  }

  /** 新建思维笔记 */
  static async createMindNote(title: string): Promise<string> {
    const json = createEmptyMindNote('', title);
    return DocumentManager.createMindNoteFromDocument(title, MindNoteDocument.fromJSON(json));
  }

  /** 从已构建的 MindNoteDocument 创建思维笔记（用于模板） */
  static async createMindNoteFromDocument(title: string, document: MindNoteDocument): Promise<string> {
    document.title = title;
    const data = await request<{ id: string }>('/docs', {
      method: 'POST',
      body: JSON.stringify({ title, docType: 'mindnote', data: document.toJSON() }),
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
      const document = MindNoteDocument.fromJSON(json);
      document.documentId = docId;
      return { title: doc.title, version: doc.version ?? 0, document };
    } catch {
      return null;
    }
  }

  static async saveMindNote(docId: string, title: string, document: MindNoteDocument): Promise<{ version: number }> {
    document.documentId = docId;
    document.title = title;
    const result = await request<{ version?: number }>(`/docs/${docId}`, {
      method: 'PUT',
      body: JSON.stringify({ title, docType: 'mindnote', data: document.toJSON() }),
    });
    return { version: result.version ?? 0 };
  }

  /** 新建画板 */
  static async createWhiteboard(title: string): Promise<string> {
    const json = createEmptyWhiteboard('', title);
    return DocumentManager.createWhiteboardFromDocument(title, WhiteboardDocument.fromJSON(json));
  }

  /** 从已构建的 WhiteboardDocument 创建画板 */
  static async createWhiteboardFromDocument(title: string, document: WhiteboardDocument): Promise<string> {
    document.title = title;
    const data = await request<{ id: string }>('/docs', {
      method: 'POST',
      body: JSON.stringify({ title, docType: 'whiteboard', data: document.toJSON() }),
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
      const document = WhiteboardDocument.fromJSON(json);
      document.documentId = docId;
      return { title: doc.title, version: doc.version ?? 0, document };
    } catch {
      return null;
    }
  }

  static async saveWhiteboard(docId: string, title: string, document: WhiteboardDocument): Promise<{ version: number }> {
    document.documentId = docId;
    document.title = title;
    const result = await request<{ version?: number }>(`/docs/${docId}`, {
      method: 'PUT',
      body: JSON.stringify({ title, docType: 'whiteboard', data: document.toJSON() }),
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
    const data = await request<{ id: string }>('/docs', {
      method: 'POST',
      body: JSON.stringify({ title, docType, data: workbook.toJSON() }),
    });
    notifyDocumentListChanged();
    return data.id;
  }

  /** 保存文档 */
  static async save(docId: string, title: string, workbook: Workbook): Promise<{ version: number }> {
    workbook.prepareForSave();
    const docType = deriveWorkbookDocType(workbook.sheets.map(s => s.type));
    const result = await request<{ version?: number }>(`/docs/${docId}`, {
      method: 'PUT',
      body: JSON.stringify({ title, docType, data: workbook.toJSON() }),
    });
    return { version: result.version ?? 0 };
  }

  static async patch(docId: string, input: PatchRequest): Promise<PatchResult> {
    return patchRequest(`/docs/${docId}/patch`, input);
  }

  static async load(
    docId: string,
    prefetched?: DocumentApiResponse,
  ): Promise<{ title: string; docType: string; version: number; workbook: Workbook } | null> {
    try {
      const doc = prefetched ?? await DocumentManager.fetchDocument(docId);
      if (!doc?.data) return null;
      const workbook = Workbook.fromJSON(doc.data);
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

  /** 查询文档列表 */
  static async list(sortBy: 'lastVisited' | 'created' | 'updated' = 'lastVisited'): Promise<DocumentListItem[]> {
    const data = await request<{ items: DocumentListItem[]; total: number }>(
      `/docs?sortBy=${sortBy}`,
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
      const document = RichDocument.fromJSON({
        ...json,
        documentId: '',
        title,
      });
      return DocumentManager.createRichTextFromDocument(title, document);
    }

    if (docType === 'mindnote') {
      const json = normalizeMindNoteData(doc.data as MindNoteJSON, '', title);
      const document = MindNoteDocument.fromJSON(json);
      return DocumentManager.createMindNoteFromDocument(title, document);
    }

    if (docType === 'whiteboard') {
      const json = normalizeWhiteboardData(doc.data as WhiteboardJSON, '', title);
      const document = WhiteboardDocument.fromJSON(json);
      return DocumentManager.createWhiteboardFromDocument(title, document);
    }

    const workbook = Workbook.fromJSON(doc.data);
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

  /** 重命名文档标题 */
  static async renameTitle(docId: string, title: string): Promise<void> {
    const meta = await DocumentManager.getDocMeta(docId);
    if (!meta) throw new Error('文档不存在');
    if (meta.docType === 'richtext') {
      const loaded = await DocumentManager.loadRichText(docId);
      if (!loaded) throw new Error('文档不存在');
      await DocumentManager.saveRichText(docId, title.trim(), loaded.document);
      notifyDocumentListChanged();
      return;
    }
    if (meta.docType === 'mindnote') {
      const loaded = await DocumentManager.loadMindNote(docId);
      if (!loaded) throw new Error('文档不存在');
      await DocumentManager.saveMindNote(docId, title.trim(), loaded.document);
      notifyDocumentListChanged();
      return;
    }
    if (meta.docType === 'whiteboard') {
      const loaded = await DocumentManager.loadWhiteboard(docId);
      if (!loaded) throw new Error('文档不存在');
      await DocumentManager.saveWhiteboard(docId, title.trim(), loaded.document);
      notifyDocumentListChanged();
      return;
    }
    const loaded = await DocumentManager.load(docId);
    if (!loaded) throw new Error('文档不存在');
    await DocumentManager.save(docId, title.trim(), loaded.workbook);
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
