import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../common/exceptions/business.exception';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import { RateLimitService } from '../../services/rate-limit.service';
import { McpAuditService } from './mcp-audit.service';
import { McpTokenService } from './mcp-token.service';
import { McpToolRegistry } from './mcp-tool.registry';
import type { McpJsonRpcRequest, McpToolCallParams } from './mcp.types';

@Injectable()
export class McpTransportService {
  constructor(
    private readonly toolRegistry: McpToolRegistry,
    private readonly auditService: McpAuditService,
    private readonly tokenService: McpTokenService,
    private readonly rateLimitService: RateLimitService,
    private readonly config: ConfigService,
  ) {}

  async handle(
    body: McpJsonRpcRequest,
    auth: AuthUser,
    ip?: string,
  ): Promise<Record<string, unknown>> {
    const id = body.id ?? null;
    const method = body.method ?? '';

    if (body.jsonrpc && body.jsonrpc !== '2.0') {
      return this.error(id, -32600, 'Invalid Request');
    }

    const limit = this.config.get<number>('mcp.rateLimitPerToken', 60);
    const tokenId = auth.mcpTokenId ?? auth.userId;
    const rate = this.rateLimitService.consume(`mcp:${tokenId}`, limit, 60_000);
    if (!rate.allowed) {
      throw new BusinessException(100004, `请求过于频繁，请 ${rate.retryAfterSec}s 后重试`, HttpStatus.TOO_MANY_REQUESTS);
    }

    const start = Date.now();
    try {
      let result: unknown;

      switch (method) {
        case 'initialize':
          result = {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'lingyi-doc-mcp', version: '1.0.0' },
          };
          break;
        case 'tools/list':
        case 'list_tools':
          result = { tools: this.toolRegistry.listTools() };
          break;
        case 'tools/call':
        case 'call_tool': {
          const params = (body.params ?? {}) as unknown as McpToolCallParams;
          const toolName = params.name;
          if (!toolName) {
            return this.error(id, -32602, 'Missing tool name');
          }
          const embedLimit = this.config.get<number>('mcp.embedRateLimit', 5);
          if (toolName === 'embed_document') {
            const embedRate = this.rateLimitService.consume(`mcp:embed:${tokenId}`, embedLimit, 60_000);
            if (!embedRate.allowed) {
              throw new BusinessException(100004, 'embed_document 调用过于频繁', HttpStatus.TOO_MANY_REQUESTS);
            }
          }
          result = await this.toolRegistry.callTool(toolName, params.arguments ?? {}, auth);
          await this.auditService.log({
            tokenId: auth.mcpTokenId!,
            userId: auth.userId,
            tenantId: auth.currentTenantId ?? null,
            method,
            toolName,
            requestSummary: params.arguments,
            status: (result as { isError?: boolean }).isError ? 'error' : 'success',
            latencyMs: Date.now() - start,
            ip,
          });
          if (auth.mcpTokenId) {
            await this.tokenService.touchUsage(auth.mcpTokenId, ip);
          }
          break;
        }
        case 'ping':
          result = {};
          break;
        default:
          return this.error(id, -32601, `Method not found: ${method}`);
      }

      if (method !== 'tools/call' && method !== 'call_tool' && auth.mcpTokenId) {
        await this.tokenService.touchUsage(auth.mcpTokenId, ip);
      }

      return { jsonrpc: '2.0', id, result };
    } catch (err) {
      const message = err instanceof BusinessException
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Internal error';

      if (auth.mcpTokenId) {
        await this.auditService.log({
          tokenId: auth.mcpTokenId,
          userId: auth.userId,
          tenantId: auth.currentTenantId ?? null,
          method,
          status: 'error',
          latencyMs: Date.now() - start,
          ip,
        });
      }

      if (err instanceof BusinessException) {
        return this.error(id, -32000, message);
      }
      return this.error(id, -32603, message);
    }
  }

  private error(id: string | number | null, code: number, message: string) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message },
    };
  }
}
