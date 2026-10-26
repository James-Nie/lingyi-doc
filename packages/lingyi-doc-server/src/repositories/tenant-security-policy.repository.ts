import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantSecurityPolicyEntity } from '../database/entities/admin-console.entity';

/** 外发与安全策略的完整形态（含默认值），服务层与前端共用 */
export interface TenantSecurityPolicy {
  tenantId: string;
  linkShareEnabled: boolean;
  allowExternalShare: boolean;
  maxExpireDays: number;
  forceDisableDownload: boolean;
  forceDisableCopy: boolean;
  forceDisablePrint: boolean;
  forceWatermark: boolean;
  watermarkText: string | null;
  requirePassword: boolean;
  updatedBy: string | null;
  updatedAt: number | null;
  /** true 表示该租户尚未配置过，当前返回的是默认策略 */
  isDefault: boolean;
}

export const DEFAULT_TENANT_SECURITY_POLICY = {
  linkShareEnabled: true,
  allowExternalShare: true,
  maxExpireDays: 0,
  forceDisableDownload: false,
  forceDisableCopy: false,
  forceDisablePrint: false,
  forceWatermark: false,
  watermarkText: null as string | null,
  requirePassword: false,
};

/** 单文档分享配置在写入前的钳制结果 */
export interface ShareSettingClamp {
  allowDownload: boolean;
  allowCopy: boolean;
  allowPrint: boolean;
  allowReshare: boolean;
  watermarkEnabled: boolean;
  expireTime: Date | null;
  /** 被全局策略改写的字段名，供审计 detail 与前端提示 */
  clamped: string[];
}

/**
 * 租户级外发与安全管控策略仓储（P0-2）。
 *
 * 职责边界：
 * - 只负责策略的持久化与「单文档配置钳制」的纯计算
 * - 不负责抛业务异常（由 service 层根据 clamp 结果决定拒绝还是改写）
 */
@Injectable()
export class TenantSecurityPolicyRepository {
  constructor(
    @InjectRepository(TenantSecurityPolicyEntity)
    private readonly repo: Repository<TenantSecurityPolicyEntity>,
  ) {}

  /** 读取策略；无记录时返回默认值且 isDefault=true */
  async get(tenantId: string): Promise<TenantSecurityPolicy> {
    const row = tenantId
      ? await this.repo.findOne({ where: { tenantId } })
      : null;
    if (!row) {
      return {
        tenantId,
        ...DEFAULT_TENANT_SECURITY_POLICY,
        updatedBy: null,
        updatedAt: null,
        isDefault: true,
      };
    }
    return this.toDto(row);
  }

  /** 批量读取（供 SaaS 列表页展示），跳过无记录租户 */
  async getMany(tenantIds: string[]): Promise<Map<string, TenantSecurityPolicy>> {
    const unique = [...new Set(tenantIds.filter(Boolean))];
    const map = new Map<string, TenantSecurityPolicy>();
    if (!unique.length) return map;
    const rows = await this.repo
      .createQueryBuilder('p')
      .where('p.tenantId IN (:...tenantIds)', { tenantIds: unique })
      .getMany();
    for (const row of rows) map.set(row.tenantId, this.toDto(row));
    return map;
  }

  async upsert(
    tenantId: string,
    patch: Partial<Omit<TenantSecurityPolicy, 'tenantId' | 'updatedBy' | 'updatedAt' | 'isDefault'>>,
    updatedBy: string,
  ): Promise<TenantSecurityPolicy> {
    const existing = await this.repo.findOne({ where: { tenantId } });
    const merged = { ...DEFAULT_TENANT_SECURITY_POLICY, ...(existing ?? {}), ...patch };

    if (existing) {
      existing.linkShareEnabled = merged.linkShareEnabled;
      existing.allowExternalShare = merged.allowExternalShare;
      existing.maxExpireDays = merged.maxExpireDays;
      existing.forceDisableDownload = merged.forceDisableDownload;
      existing.forceDisableCopy = merged.forceDisableCopy;
      existing.forceDisablePrint = merged.forceDisablePrint;
      existing.forceWatermark = merged.forceWatermark;
      existing.watermarkText = merged.watermarkText;
      existing.requirePassword = merged.requirePassword;
      existing.updatedBy = updatedBy;
      const saved = await this.repo.save(existing);
      return this.toDto(saved);
    }

    const saved = await this.repo.save({
      tenantId,
      linkShareEnabled: merged.linkShareEnabled,
      allowExternalShare: merged.allowExternalShare,
      maxExpireDays: merged.maxExpireDays,
      forceDisableDownload: merged.forceDisableDownload,
      forceDisableCopy: merged.forceDisableCopy,
      forceDisablePrint: merged.forceDisablePrint,
      forceWatermark: merged.forceWatermark,
      watermarkText: merged.watermarkText,
      requirePassword: merged.requirePassword,
      updatedBy,
    });
    return this.toDto(saved);
  }

  /**
   * 纯计算：把全局策略作为上限/下限钳制到单文档分享配置上。
   * 不做持久化，不抛异常 —— 由调用方决定「改写」还是「拒绝」。
   */
  clampShareSettings(
    policy: TenantSecurityPolicy,
    input: {
      allowDownload: boolean;
      allowCopy: boolean;
      allowPrint: boolean;
      allowReshare: boolean;
      watermarkEnabled: boolean;
      expireTime: Date | null;
    },
    now: Date = new Date(),
  ): ShareSettingClamp {
    const clamped: string[] = [];

    const allowDownload = policy.forceDisableDownload ? false : input.allowDownload;
    if (allowDownload !== input.allowDownload) clamped.push('allowDownload');

    const allowCopy = policy.forceDisableCopy ? false : input.allowCopy;
    if (allowCopy !== input.allowCopy) clamped.push('allowCopy');

    const allowPrint = policy.forceDisablePrint ? false : input.allowPrint;
    if (allowPrint !== input.allowPrint) clamped.push('allowPrint');

    const watermarkEnabled = policy.forceWatermark ? true : input.watermarkEnabled;
    if (watermarkEnabled !== input.watermarkEnabled) clamped.push('watermarkEnabled');

    // 不允许分享到企业外时，连带禁止二次转发
    const allowReshare = policy.allowExternalShare ? input.allowReshare : false;
    if (allowReshare !== input.allowReshare) clamped.push('allowReshare');

    let expireTime = input.expireTime;
    if (policy.maxExpireDays > 0) {
      const maxExpire = new Date(now.getTime() + policy.maxExpireDays * 24 * 60 * 60 * 1000);
      if (!expireTime || expireTime.getTime() > maxExpire.getTime()) {
        expireTime = maxExpire;
        clamped.push('expireTime');
      }
    }

    return {
      allowDownload,
      allowCopy,
      allowPrint,
      allowReshare,
      watermarkEnabled,
      expireTime,
      clamped,
    };
  }

  private toDto(row: TenantSecurityPolicyEntity): TenantSecurityPolicy {
    return {
      tenantId: row.tenantId,
      linkShareEnabled: row.linkShareEnabled,
      allowExternalShare: row.allowExternalShare,
      maxExpireDays: row.maxExpireDays,
      forceDisableDownload: row.forceDisableDownload,
      forceDisableCopy: row.forceDisableCopy,
      forceDisablePrint: row.forceDisablePrint,
      forceWatermark: row.forceWatermark,
      watermarkText: row.watermarkText,
      requirePassword: row.requirePassword,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.getTime() : new Date(row.updatedAt).getTime(),
      isDefault: false,
    };
  }
}
