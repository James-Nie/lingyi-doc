/**
 * 文档类型处理器（io/collab 插件化入口）。
 * type 与 doc_type / patch kind 对齐：workbook | richtext | mindnote | whiteboard
 */
export interface DocumentHandler<TDoc = unknown, TJson = unknown> {
  type: string;
  create(title?: string): TDoc;
  toJSON(doc: TDoc): TJson;
  fromJSON(json: TJson): TDoc;
}

const handlers = new Map<string, DocumentHandler>();

export function registerDocumentHandler(handler: DocumentHandler): void {
  handlers.set(handler.type, handler);
}

export function getDocumentHandler(type: string): DocumentHandler | undefined {
  return handlers.get(type);
}

export function requireDocumentHandler(type: string): DocumentHandler {
  const h = handlers.get(type);
  if (!h) {
    throw new Error(`[DocumentHandler] 未注册类型: ${type}`);
  }
  return h;
}

export function listDocumentHandlerTypes(): string[] {
  return Array.from(handlers.keys());
}
