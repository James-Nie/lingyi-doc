export const MCP_SCOPES = {
  KB_READ: 'kb:read',
  KB_WRITE: 'kb:write',
  DOC_READ: 'doc:read',
  DOC_WRITE: 'doc:write',
  AI_RAG: 'ai:rag',
} as const;

export type McpScope =
  | typeof MCP_SCOPES.KB_READ
  | typeof MCP_SCOPES.KB_WRITE
  | typeof MCP_SCOPES.DOC_READ
  | typeof MCP_SCOPES.DOC_WRITE
  | typeof MCP_SCOPES.AI_RAG;

export const MCP_SCOPE_PRESETS: Record<string, McpScope[]> = {
  readonly: [
    MCP_SCOPES.KB_READ,
    MCP_SCOPES.DOC_READ,
    MCP_SCOPES.AI_RAG,
  ],
  editor: [
    MCP_SCOPES.KB_READ,
    MCP_SCOPES.KB_WRITE,
    MCP_SCOPES.DOC_READ,
    MCP_SCOPES.DOC_WRITE,
    MCP_SCOPES.AI_RAG,
  ],
  full: [
    MCP_SCOPES.KB_READ,
    MCP_SCOPES.KB_WRITE,
    MCP_SCOPES.DOC_READ,
    MCP_SCOPES.DOC_WRITE,
    MCP_SCOPES.AI_RAG,
  ],
};

export interface McpAuthContext {
  tokenId: string;
  tokenName: string;
  userId: string;
  email: string;
  tenantId: string | null;
  scopes: McpScope[];
}

export interface McpJsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface McpToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}
