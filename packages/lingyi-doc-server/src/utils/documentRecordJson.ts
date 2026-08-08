import type { DocumentRecord } from '../types/database';

/** 从 DB 取出的 content_json 文本（已是合法 JSON 片段，不再 parse/stringify） */
export function normalizeContentJsonRaw(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw.length > 0 ? raw : null;
  if (Buffer.isBuffer(raw)) {
    const text = raw.toString('utf8');
    return text.length > 0 ? text : null;
  }
  if (typeof raw === 'object') {
    const text = JSON.stringify(raw);
    return text.length > 0 ? text : null;
  }
  return null;
}

/**
 * 拼接 DocumentRecord JSON：meta 字段 stringify，data 直接嵌入 DB 原始 JSON 文本。
 */
export function buildDocumentRecordJson(
  meta: Omit<DocumentRecord, 'data'>,
  contentJsonRaw: string | null,
): string {
  const parts: string[] = ['{'];
  let first = true;

  const add = (key: string, value: unknown) => {
    if (value === undefined) return;
    if (!first) parts.push(',');
    first = false;
    parts.push(JSON.stringify(key), ':', JSON.stringify(value));
  };

  const addRaw = (key: string, raw: string | null) => {
    if (!first) parts.push(',');
    first = false;
    parts.push(JSON.stringify(key), ':', raw ?? 'null');
  };

  add('id', meta.id);
  add('title', meta.title);
  add('docType', meta.docType);
  add('version', meta.version);
  addRaw('data', contentJsonRaw);
  add('ownerId', meta.ownerId);
  add('ownerName', meta.ownerName);
  add('tenantId', meta.tenantId);
  add('orgId', meta.orgId);
  add('scope', meta.scope);
  add('location', meta.location);
  add('createdAt', meta.createdAt);
  add('updatedAt', meta.updatedAt);
  add('lastVisitedAt', meta.lastVisitedAt);
  add('permission', meta.permission);
  add('canEdit', meta.canEdit);
  add('viewMode', meta.viewMode);
  add('_meta', meta._meta);
  parts.push('}');
  return parts.join('');
}

/** 标准 API 包装：{ code: 0, data: ... } */
export function wrapApiDataJson(dataJson: string): string {
  return `{"code":0,"data":${dataJson}}`;
}

export function sendWrappedApiJson(res: { setHeader: (k: string, v: string) => void; send: (body: string) => void }, body: string): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(body);
}

/** 文档加载 HTTP 结果：大正文 raw 直出，小对象仍走 JSON.stringify */
export type DocumentLoadHttpResult =
  | { type: 'raw'; body: string }
  | { type: 'data'; data: unknown };

export function sendDocumentLoadHttpResult(
  res: { setHeader: (k: string, v: string) => void; send: (body: string) => void },
  result: DocumentLoadHttpResult,
): void {
  if (result.type === 'raw') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(result.body);
    return;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify({ code: 0, data: result.data }));
}
