import type { AuthUser } from '../auth/decorators/current-user.decorator';

/** MCP 知识库 Tool 所需能力面（由 KnowledgeBaseService 适配） */
export interface KnowledgeBasePort {
  list(auth: AuthUser, query?: unknown): Promise<unknown>;
  getById(auth: AuthUser, kbId: string): Promise<unknown>;
  create(auth: AuthUser, body: unknown): Promise<unknown>;
  update(auth: AuthUser, kbId: string, body: unknown): Promise<unknown>;
  remove(auth: AuthUser, kbId: string): Promise<unknown>;
  listNodes(auth: AuthUser, kbId: string): Promise<unknown>;
  createNode(auth: AuthUser, kbId: string, body: unknown): Promise<unknown>;
  updateNode(
    auth: AuthUser,
    kbId: string,
    nodeId: string,
    body: unknown,
  ): Promise<unknown>;
  removeNode(
    auth: AuthUser,
    kbId: string,
    nodeId: string,
    ...rest: unknown[]
  ): Promise<unknown>;
  createDocument(
    auth: AuthUser,
    kbId: string,
    parentNodeId: string,
    input: { title: string; docType: string; data?: unknown },
  ): Promise<{ docId: string; nodeId: string; docType: string; title: string }>;
}
