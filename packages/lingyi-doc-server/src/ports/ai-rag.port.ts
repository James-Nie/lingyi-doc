/** MCP / Agent RAG 能力面 */
export interface AiRagPort {
  search(
    query: string,
    topK?: number,
    tenantId?: string,
    documentIds?: string[],
  ): Promise<unknown[]>;
  embedDocument(documentId: string): Promise<{ chunkCount: number }>;
  deleteVectors(documentId: string): Promise<void>;
}
