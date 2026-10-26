import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from '../database/entities/misc.entity';
import { UserEntity } from '../database/entities/user.entity';
import { moduleOfAction } from '../constants/audit';
import type { DbAuditLog } from '../types/database';

export interface AuditLogListFilter {
  operatorId?: string;
  /** 精确动作码 */
  action?: string;
  /** 动作关键字（模糊匹配 action） */
  actionKeyword?: string;
  /** 模块（由 action 前缀推导的存储列） */
  module?: string;
  result?: string;
  /** 目标对象类型 */
  targetType?: string;
  /** 目标 ID 关键字 */
  keyword?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  sortOrder?: 'ASC' | 'DESC';
}

function toDbAuditLog(entity: AuditLogEntity, operatorName?: string | null): DbAuditLog {
  return {
    id: Number(entity.id),
    operator_id: entity.operatorId,
    operator_name: operatorName ?? null,
    action: entity.action,
    module: entity.module ?? moduleOfAction(entity.action),
    result: entity.result ?? 'success',
    target_type: entity.targetType,
    target_id: entity.targetId,
    detail: entity.detail,
    ip: entity.ip,
    user_agent: entity.userAgent,
    created_at: entity.createdAt,
  };
}

const RAW_SELECT = [
  'a.id',
  'a.operatorId',
  'a.action',
  'a.module',
  'a.result',
  'a.targetType',
  'a.targetId',
  'a.detail',
  'a.ip',
  'a.userAgent',
  'a.createdAt',
  'u.displayName',
] as const;

@Injectable()
export class AuditLogRepository {
  private readonly logger = new Logger(AuditLogRepository.name);

  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
  ) {}

  async create(input: {
    operatorId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    detail?: unknown;
    ip?: string | null;
    userAgent?: string | null;
    /** success | failure，缺省 success */
    result?: 'success' | 'failure';
  }): Promise<void> {
    try {
      await this.repo.save({
        operatorId: input.operatorId,
        action: input.action,
        module: moduleOfAction(input.action),
        result: input.result ?? 'success',
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        detail: input.detail ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      });
    } catch (err) {
      // 审计写入失败不得中断主业务流程，但必须留日志（等保 8.1.4.3 d 保护审计进程可用性）
      this.logger.error(`审计日志写入失败 action=${input.action}`, err as Error);
    }
  }

  /** 构造与其他筛选条件一致的 QueryBuilder，供列表 / 计数 / 导出 / 详情复用 */
  private buildQuery(filter: AuditLogListFilter) {
    const qb = this.repo.createQueryBuilder('a').where('1=1');

    if (filter.operatorId) {
      qb.andWhere('a.operatorId = :operatorId', { operatorId: filter.operatorId });
    }
    if (filter.action) {
      qb.andWhere('a.action = :action', { action: filter.action });
    }
    if (filter.actionKeyword) {
      qb.andWhere('a.action LIKE :actionKeyword', { actionKeyword: `%${filter.actionKeyword}%` });
    }
    if (filter.module) {
      qb.andWhere('a.module = :module', { module: filter.module });
    }
    if (filter.result) {
      qb.andWhere('a.result = :result', { result: filter.result });
    }
    if (filter.targetType) {
      qb.andWhere('a.targetType = :targetType', { targetType: filter.targetType });
    }
    if (filter.keyword) {
      qb.andWhere('(a.targetId ILIKE :kw OR a.action ILIKE :kw)', { kw: `%${filter.keyword}%` });
    }
    if (filter.startDate) {
      qb.andWhere('a.createdAt >= :startDate', { startDate: filter.startDate });
    }
    if (filter.endDate) {
      qb.andWhere('a.createdAt <= :endDate', { endDate: filter.endDate });
    }
    return qb;
  }

  async list(filter: AuditLogListFilter = {}): Promise<{ items: DbAuditLog[]; total: number }> {
    const limit = Math.min(filter.limit ?? 20, 10000);
    const offset = filter.offset ?? 0;

    const countQb = this.buildQuery(filter);
    const total = await countQb.getCount();

    const rows = await this.buildQuery(filter)
      .leftJoin(UserEntity, 'u', 'u.id = a.operatorId')
      .select([...RAW_SELECT])
      .orderBy('a.createdAt', filter.sortOrder ?? 'DESC')
      .skip(offset)
      .take(limit)
      .getRawMany<Record<string, unknown>>();

    return { items: rows.map((row) => this.mapRaw(row)), total };
  }

  async findById(id: number): Promise<DbAuditLog | null> {
    const row = await this.repo
      .createQueryBuilder('a')
      .leftJoin(UserEntity, 'u', 'u.id = a.operatorId')
      .select([...RAW_SELECT])
      .where('a.id = :id', { id })
      .getRawOne<Record<string, unknown>>();
    return row ? this.mapRaw(row) : null;
  }

  /** 可选筛选项：模块 / 动作 / 操作人，供前端下拉（限定时间窗避免全表扫描） */
  async facets(sinceDays = 90): Promise<{
    modules: string[];
    actions: Array<{ action: string; count: number }>;
    operators: Array<{ userId: string; displayName: string | null; count: number }>;
  }> {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

    const moduleRows = await this.repo
      .createQueryBuilder('a')
      .select('DISTINCT a.module', 'module')
      .where('a.createdAt >= :since', { since })
      .andWhere('a.module IS NOT NULL')
      .getRawMany<{ module: string }>();

    const actionRows = await this.repo
      .createQueryBuilder('a')
      .select('a.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .where('a.createdAt >= :since', { since })
      .groupBy('a.action')
      .orderBy('count', 'DESC')
      .limit(200)
      .getRawMany<{ action: string; count: string }>();

    const operatorRows = await this.repo
      .createQueryBuilder('a')
      .leftJoin(UserEntity, 'u', 'u.id = a.operatorId')
      .select('a.operatorId', 'userId')
      .addSelect('u.displayName', 'displayName')
      .addSelect('COUNT(*)', 'count')
      .where('a.createdAt >= :since', { since })
      .groupBy('a.operatorId')
      .addGroupBy('u.displayName')
      .orderBy('count', 'DESC')
      .limit(100)
      .getRawMany<{ userId: string; displayName: string | null; count: string }>();

    return {
      modules: moduleRows.map((r) => r.module).filter(Boolean).sort(),
      actions: actionRows.map((r) => ({ action: r.action, count: Number(r.count) })),
      operators: operatorRows.map((r) => ({
        userId: r.userId,
        displayName: r.displayName,
        count: Number(r.count),
      })),
    };
  }

  async countAll(): Promise<number> {
    return this.repo.count();
  }

  async countBefore(date: Date): Promise<number> {
    return this.repo
      .createQueryBuilder('a')
      .where('a.createdAt < :date', { date })
      .getCount();
  }

  /**
   * 按保留期清理。
   *
   * 等保 8.1.4.3 c) 要求审计记录受保护、避免未预期的删除 —— 故：
   * - 仅此一个删除入口，且必须由调用方按保留策略触发
   * - 调用方必须在清理后写 `audit.cleanup` 审计（见 AdminController）
   */
  async deleteBefore(date: Date): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .from(AuditLogEntity)
      .where('createdAt < :date', { date })
      .execute();
    return result.affected ?? 0;
  }

  /** 最早的审计记录时间，用于展示实际留存跨度 */
  async earliestCreatedAt(): Promise<Date | null> {
    const row = await this.repo
      .createQueryBuilder('a')
      .select('MIN(a.createdAt)', 'min')
      .getRawOne<{ min: Date | string | null }>();
    if (!row?.min) return null;
    return row.min instanceof Date ? row.min : new Date(row.min);
  }

  private mapRaw(row: Record<string, unknown>): DbAuditLog {
    return toDbAuditLog(
      {
        id: String(row.a_id),
        operatorId: (row.a_operator_id ?? row.a_operatorId) as string,
        action: row.a_action as string,
        module: (row.a_module ?? null) as string | null,
        result: (row.a_result ?? 'success') as string,
        targetType: (row.a_target_type ?? row.a_targetType ?? null) as string | null,
        targetId: (row.a_target_id ?? row.a_targetId ?? null) as string | null,
        detail: row.a_detail ?? null,
        ip: (row.a_ip ?? null) as string | null,
        userAgent: (row.a_user_agent ?? row.a_userAgent ?? null) as string | null,
        createdAt: (row.a_created_at ?? row.a_createdAt) as Date,
      } as AuditLogEntity,
      (row.u_display_name ?? row.u_displayName ?? null) as string | null,
    );
  }
}
