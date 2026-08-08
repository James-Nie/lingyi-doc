import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { BusinessException } from '../../common/exceptions/business.exception';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import { UserRepository } from '../../repositories/user.repository';
import { McpTokenEntity } from './entities/mcp-token.entity';
import {
  MCP_SCOPE_PRESETS,
  type McpAuthContext,
  type McpScope,
} from './mcp.types';

@Injectable()
export class McpTokenService {
  constructor(
    @InjectRepository(McpTokenEntity)
    private readonly tokenRepo: Repository<McpTokenEntity>,
    private readonly userRepository: UserRepository,
    private readonly config: ConfigService,
  ) {}

  private get prefix(): string {
    return this.config.get<string>('mcp.tokenPrefix', 'mcp_');
  }

  private hashToken(plain: string): string {
    return createHash('sha256').update(plain).digest('hex');
  }

  private generatePlainToken(): string {
    return `${this.prefix}${randomBytes(32).toString('hex')}`;
  }

  private resolveScopes(preset?: string, scopes?: string[]): McpScope[] {
    if (scopes?.length) {
      return scopes as McpScope[];
    }
    const key = preset && MCP_SCOPE_PRESETS[preset] ? preset : 'editor';
    return MCP_SCOPE_PRESETS[key];
  }

  async listByUser(userId: string): Promise<Array<{
    id: string;
    name: string;
    tokenPrefix: string;
    scopes: string[];
    status: string;
    expiresAt: string | null;
    lastUsedAt: string | null;
    createdAt: string;
  }>> {
    const rows = await this.tokenRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      tokenPrefix: row.tokenPrefix,
      scopes: row.scopes,
      status: row.status,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async create(
    user: AuthUser,
    input: { name: string; preset?: string; scopes?: string[]; expiresInDays?: number },
  ): Promise<{
    id: string;
    name: string;
    plainToken: string;
    scopes: McpScope[];
    expiresAt: string | null;
    warning: string;
  }> {
    const maxTokens = this.config.get<number>('mcp.maxTokensPerUser', 10);
    const activeCount = await this.tokenRepo.count({
      where: { userId: user.userId, status: 'active' },
    });
    if (activeCount >= maxTokens) {
      throw new BusinessException(100003, `最多创建 ${maxTokens} 个 MCP Token`);
    }

    const name = input.name.trim();
    if (!name) {
      throw new BusinessException(100002, '请填写 Token 名称');
    }

    const plainToken = this.generatePlainToken();
    const defaultDays = this.config.get<number>('mcp.defaultExpiresDays', 90);
    const days = input.expiresInDays ?? defaultDays;
    const expiresAt = days > 0
      ? new Date(Date.now() + days * 24 * 60 * 60 * 1000)
      : null;

    const entity = await this.tokenRepo.save({
      id: uuidv4(),
      userId: user.userId,
      tenantId: user.currentTenantId ?? null,
      name,
      tokenHash: this.hashToken(plainToken),
      tokenPrefix: plainToken.slice(0, 12),
      scopes: this.resolveScopes(input.preset, input.scopes),
      status: 'active',
      expiresAt,
    });

    return {
      id: entity.id,
      name: entity.name,
      plainToken,
      scopes: entity.scopes as McpScope[],
      expiresAt: entity.expiresAt?.toISOString() ?? null,
      warning: '明文 Token 仅显示一次，请妥善保存',
    };
  }

  async update(
    userId: string,
    tokenId: string,
    input: { name?: string; preset?: string; scopes?: string[] },
  ): Promise<{
    id: string;
    name: string;
    tokenPrefix: string;
    scopes: string[];
    status: string;
    expiresAt: string | null;
    lastUsedAt: string | null;
    createdAt: string;
  }> {
    const row = await this.tokenRepo.findOne({ where: { id: tokenId, userId } });
    if (!row) {
      throw new BusinessException(200001, 'Token 不存在', HttpStatus.NOT_FOUND);
    }

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw new BusinessException(100002, '请填写 Token 名称');
      }
      row.name = name;
    }

    if (input.preset !== undefined || input.scopes !== undefined) {
      row.scopes = this.resolveScopes(input.preset, input.scopes);
    }

    const saved = await this.tokenRepo.save(row);
    return {
      id: saved.id,
      name: saved.name,
      tokenPrefix: saved.tokenPrefix,
      scopes: saved.scopes,
      status: saved.status,
      expiresAt: saved.expiresAt?.toISOString() ?? null,
      lastUsedAt: saved.lastUsedAt?.toISOString() ?? null,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  async revoke(userId: string, tokenId: string): Promise<void> {
    const row = await this.tokenRepo.findOne({ where: { id: tokenId, userId } });
    if (!row) {
      throw new BusinessException(200001, 'Token 不存在', HttpStatus.NOT_FOUND);
    }
    row.status = 'revoked';
    row.revokedAt = new Date();
    await this.tokenRepo.save(row);
  }

  async remove(userId: string, tokenId: string): Promise<void> {
    const row = await this.tokenRepo.findOne({ where: { id: tokenId, userId } });
    if (!row) {
      throw new BusinessException(200001, 'Token 不存在', HttpStatus.NOT_FOUND);
    }
    await this.tokenRepo.manager.query(
      'DELETE FROM mcp_audit_logs WHERE token_id = $1',
      [tokenId],
    );
    await this.tokenRepo.delete({ id: tokenId, userId });
  }

  async verifyPlainToken(plainToken: string): Promise<McpAuthContext> {
    if (!plainToken.startsWith(this.prefix)) {
      throw new BusinessException(110002, '无效的 MCP Token', HttpStatus.UNAUTHORIZED);
    }

    const hash = this.hashToken(plainToken);
    const prefix = plainToken.slice(0, 12);
    const row = await this.tokenRepo.findOne({
      where: { tokenHash: hash, tokenPrefix: prefix, status: 'active' },
    });

    if (!row) {
      throw new BusinessException(110002, '无效的 MCP Token', HttpStatus.UNAUTHORIZED);
    }

    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      row.status = 'expired';
      await this.tokenRepo.save(row);
      throw new BusinessException(110002, 'MCP Token 已过期', HttpStatus.UNAUTHORIZED);
    }

    const user = await this.userRepository.findById(row.userId);
    if (!user) {
      throw new BusinessException(110002, 'Token 关联用户不存在', HttpStatus.UNAUTHORIZED);
    }

    return {
      tokenId: row.id,
      tokenName: row.name,
      userId: row.userId,
      email: user.email,
      tenantId: row.tenantId,
      scopes: row.scopes as McpScope[],
    };
  }

  async touchUsage(tokenId: string, ip?: string): Promise<void> {
    await this.tokenRepo.update(tokenId, {
      lastUsedAt: new Date(),
      lastUsedIp: ip ?? null,
    });
  }

  toAuthUser(ctx: McpAuthContext): AuthUser {
    return {
      userId: ctx.userId,
      email: ctx.email,
      userType: 'consumer',
      audience: 'mcp',
      currentIdentityType: ctx.tenantId ? 'tenant' : 'personal',
      currentTenantId: ctx.tenantId,
      mcpScopes: ctx.scopes,
      mcpTokenId: ctx.tokenId,
    };
  }
}
