import crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { BusinessException } from '../../common/exceptions/business.exception';

function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = `ld_${uuidv4().replace(/-/g, '')}${uuidv4().replace(/-/g, '')}`;
  const prefix = raw.slice(0, 12);
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, prefix, hash };
}

@Injectable()
export class AdminApiKeyService {
  private readonly logger = new Logger(AdminApiKeyService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async listApiKeys(tenantId?: string) {
    let query = `
      SELECT
        ak.id, ak.tenant_id, ak.name, ak.key_prefix, ak.permissions,
        ak.status, ak.expires_at, ak.last_used_at, ak.last_used_ip,
        ak.created_by, ak.created_at, ak.revoked_at,
        u.display_name AS created_by_name
      FROM api_keys ak
      LEFT JOIN users u ON u.id = ak.created_by
      WHERE 1=1
    `;
    const params: string[] = [];
    if (tenantId) {
      params.push(tenantId);
      query += ` AND ak.tenant_id = $${params.length}`;
    }
    query += ' ORDER BY ak.created_at DESC';

    const rows = await this.dataSource.query(query, params);
    return {
      items: rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        tenantId: r.tenant_id,
        name: r.name,
        keyPrefix: r.key_prefix,
        permissions: r.permissions,
        status: r.status,
        expiresAt: r.expires_at ?? null,
        lastUsedAt: r.last_used_at ?? null,
        lastUsedIp: r.last_used_ip ?? null,
        createdBy: r.created_by,
        createdByName: r.created_by_name ?? null,
        createdAt: r.created_at instanceof Date ? r.created_at.getTime() : new Date(r.created_at as string).getTime(),
        revokedAt: r.revoked_at ?? null,
      })),
      total: rows.length,
    };
  }

  async createApiKey(input: {
    tenantId?: string | null;
    name: string;
    permissions?: string[];
    expiresAt?: string | null;
    createdBy: string;
  }) {
    const id = uuidv4();
    const { raw, prefix, hash } = generateApiKey();
    const permissions = Array.isArray(input.permissions) ? input.permissions : [];

    await this.dataSource.query(
      `INSERT INTO api_keys (id, tenant_id, name, key_prefix, key_hash, permissions, status, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'active', $7, $8)`,
      [
        id,
        input.tenantId ?? null,
        input.name,
        prefix,
        hash,
        JSON.stringify(permissions),
        input.expiresAt ?? null,
        input.createdBy,
      ],
    );

    return { id, name: input.name, keyPrefix: prefix, rawKey: raw };
  }

  async revokeApiKey(id: string) {
    const result = await this.dataSource.query(
      `UPDATE api_keys SET status = 'revoked', revoked_at = NOW() WHERE id = $1 AND status = 'active'`,
      [id],
    );
    if (result.rowCount === 0) throw new BusinessException(100004, 'API 密钥不存在或已撤销');
    return { success: true };
  }

  async deleteApiKey(id: string) {
    const result = await this.dataSource.query(
      `DELETE FROM api_keys WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0) throw new BusinessException(100004, 'API 密钥不存在');
    return { success: true };
  }
}