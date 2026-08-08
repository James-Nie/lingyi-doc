import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BusinessException } from '../../common/exceptions/business.exception';

@Injectable()
export class AdminStorageService {
  private readonly logger = new Logger(AdminStorageService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** 获取所有租户的存储概览 */
  async getStorageOverview() {
    const rows = await this.dataSource.query(`
      SELECT
        t.id AS tenant_id,
        t.name AS tenant_name,
        t.storage_quota_bytes,
        COALESCE(SUM(dc.storage_size), 0)::BIGINT AS used_bytes,
        COUNT(d.id) FILTER (WHERE d.is_deleted = false) AS doc_count
      FROM tenants t
      LEFT JOIN documents d ON d.tenant_id = t.id AND d.is_deleted = false
      LEFT JOIN document_contents dc ON dc.doc_id = d.id
      GROUP BY t.id, t.name, t.storage_quota_bytes
      ORDER BY t.name
    `);
    return {
      items: rows.map((r: Record<string, unknown>) => ({
        tenantId: r.tenant_id,
        tenantName: r.tenant_name,
        quotaBytes: Number(r.storage_quota_bytes),
        usedBytes: Number(r.used_bytes),
        usedPercent: Number(r.storage_quota_bytes) > 0
          ? Math.round((Number(r.used_bytes) / Number(r.storage_quota_bytes)) * 100)
          : 0,
        docCount: Number(r.doc_count),
      })),
      totalBytes: rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.used_bytes), 0),
    };
  }

  /** 获取单个租户的存储详情 */
  async getTenantStorage(tenantId: string) {
    const tenant = await this.dataSource.query(
      `SELECT id, name, storage_quota_bytes FROM tenants WHERE id = $1`,
      [tenantId],
    );
    if (!tenant.length) throw new BusinessException(100004, '租户不存在');

    const usage = await this.dataSource.query(
      `SELECT
        COALESCE(SUM(dc.storage_size), 0)::BIGINT AS used_bytes,
        COUNT(d.id) AS doc_count
      FROM documents d
      LEFT JOIN document_contents dc ON dc.doc_id = d.id
      WHERE d.tenant_id = $1 AND d.is_deleted = false`,
      [tenantId],
    );
    const t = tenant[0];
    return {
      tenantId: t.id,
      tenantName: t.name,
      quotaBytes: Number(t.storage_quota_bytes),
      usedBytes: Number(usage[0]?.used_bytes ?? 0),
      docCount: Number(usage[0]?.doc_count ?? 0),
      usedPercent: Number(t.storage_quota_bytes) > 0
        ? Math.round((Number(usage[0]?.used_bytes ?? 0) / Number(t.storage_quota_bytes)) * 100)
        : 0,
    };
  }

  /** 更新租户存储配额 */
  async updateTenantQuota(tenantId: string, quotaBytes: number) {
    const result = await this.dataSource.query(
      `UPDATE tenants SET storage_quota_bytes = $1 WHERE id = $2`,
      [quotaBytes, tenantId],
    );
    if (result.rowCount === 0) throw new BusinessException(100004, '租户不存在');
    return { success: true };
  }
}