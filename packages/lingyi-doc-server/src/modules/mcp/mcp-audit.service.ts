import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { McpAuditLogEntity } from './entities/mcp-audit-log.entity';

@Injectable()
export class McpAuditService {
  constructor(
    @InjectRepository(McpAuditLogEntity)
    private readonly auditRepo: Repository<McpAuditLogEntity>,
  ) {}

  async log(input: {
    tokenId: string;
    userId: string;
    tenantId: string | null;
    method: string;
    toolName?: string;
    requestSummary?: unknown;
    status: 'success' | 'error';
    latencyMs: number;
    ip?: string;
  }): Promise<void> {
    try {
      await this.auditRepo.save({
        id: uuidv4(),
        tokenId: input.tokenId,
        userId: input.userId,
        tenantId: input.tenantId,
        method: input.method,
        toolName: input.toolName ?? null,
        requestSummary: input.requestSummary ?? null,
        status: input.status,
        latencyMs: input.latencyMs,
        ip: input.ip ?? null,
      });
    } catch {
      // 审计失败不阻断主流程
    }
  }

  async listByToken(tokenId: string, userId: string, limit = 50) {
    const rows = await this.auditRepo.find({
      where: { tokenId, userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      method: row.method,
      toolName: row.toolName,
      status: row.status,
      latencyMs: row.latencyMs,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
