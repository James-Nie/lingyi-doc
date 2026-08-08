import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AILLMUsageLogEntity } from './entities/ai-llm-usage-log.entity';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';

export interface UsageSummary {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  todayRequests: number;
  todayTokens: number;
  avgLatencyMs: number;
  errorRate: number;
  successCount: number;
  errorCount: number;
}

export interface UsageRecentItem {
  id: string;
  model: string;
  source: string;
  agentId: string | null;
  userId: string | null;
  tenantId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latency: number;
  status: string;
  createdAt: string;
}

export interface AdminUsageFilter {
  tenantId?: string;
  agentId?: string;
  model?: string;
}

export type UsageTrendPeriod = 'day' | 'week' | 'month';

export interface UsageTrendItem {
  period: string;
  label: string;
  tokens: string;
  cost: string;
  requests: string;
  errors: string;
  avgLatency: string;
}

@Injectable()
export class AIService {
  constructor(
    @InjectRepository(AILLMUsageLogEntity)
    private readonly usageLogRepo: Repository<AILLMUsageLogEntity>,
  ) {}

  private scopedQuery(user: AuthUser) {
    const qb = this.usageLogRepo.createQueryBuilder('log')
      .where('log.user_id = :userId', { userId: user.userId });
    if (user.currentTenantId) {
      qb.andWhere('(log.tenant_id IS NULL OR log.tenant_id = :tenantId)', {
        tenantId: user.currentTenantId,
      });
    }
    return qb;
  }

  private adminQuery(filter: AdminUsageFilter = {}) {
    const qb = this.usageLogRepo.createQueryBuilder('log');
    if (filter.tenantId) {
      qb.andWhere('log.tenant_id = :tenantId', { tenantId: filter.tenantId });
    }
    if (filter.agentId) {
      qb.andWhere('log.agent_id = :agentId', { agentId: filter.agentId });
    }
    if (filter.model) {
      qb.andWhere('log.model = :model', { model: filter.model });
    }
    return qb;
  }

  private buildUsageSummary(
    totals: {
      requests: string;
      tokens: string | null;
      cost: string | null;
      avgLatency: string | null;
      errors: string;
      success: string;
    } | undefined,
    today: { requests: string; tokens: string | null } | undefined,
  ): UsageSummary {
    const totalRequests = parseInt(totals?.requests ?? '0', 10);
    const errorCount = parseInt(totals?.errors ?? '0', 10);
    const successCount = parseInt(totals?.success ?? '0', 10);

    return {
      totalRequests,
      totalTokens: parseInt(totals?.tokens ?? '0', 10),
      totalCost: parseFloat(totals?.cost ?? '0'),
      todayRequests: parseInt(today?.requests ?? '0', 10),
      todayTokens: parseInt(today?.tokens ?? '0', 10),
      avgLatencyMs: Math.round(parseFloat(totals?.avgLatency ?? '0')),
      errorRate: totalRequests > 0 ? errorCount / totalRequests : 0,
      successCount,
      errorCount,
    };
  }

  async getUsageStats(user: AuthUser): Promise<UsageSummary> {
    const base = this.scopedQuery(user);

    const totals = await base.clone()
      .select('COUNT(*)', 'requests')
      .addSelect('SUM(log.input_tokens + log.output_tokens)', 'tokens')
      .addSelect('SUM(log.cost)', 'cost')
      .addSelect('AVG(log.latency)', 'avgLatency')
      .addSelect("SUM(CASE WHEN log.status = 'error' THEN 1 ELSE 0 END)", 'errors')
      .addSelect("SUM(CASE WHEN log.status = 'success' THEN 1 ELSE 0 END)", 'success')
      .getRawOne<{
        requests: string;
        tokens: string | null;
        cost: string | null;
        avgLatency: string | null;
        errors: string;
        success: string;
      }>();

    const today = await base.clone()
      .andWhere('log.created_at >= CURRENT_DATE')
      .andWhere('log.created_at < CURRENT_DATE + INTERVAL \'1 day\'')
      .select('COUNT(*)', 'requests')
      .addSelect('SUM(log.input_tokens + log.output_tokens)', 'tokens')
      .getRawOne<{ requests: string; tokens: string | null }>();

    return this.buildUsageSummary(totals, today);
  }

  async getAdminUsageStats(filter: AdminUsageFilter = {}): Promise<UsageSummary> {
    const base = this.adminQuery(filter);

    const totals = await base.clone()
      .select('COUNT(*)', 'requests')
      .addSelect('SUM(log.input_tokens + log.output_tokens)', 'tokens')
      .addSelect('SUM(log.cost)', 'cost')
      .addSelect('AVG(log.latency)', 'avgLatency')
      .addSelect("SUM(CASE WHEN log.status = 'error' THEN 1 ELSE 0 END)", 'errors')
      .addSelect("SUM(CASE WHEN log.status = 'success' THEN 1 ELSE 0 END)", 'success')
      .getRawOne();

    const today = await base.clone()
      .andWhere('log.created_at >= CURRENT_DATE')
      .andWhere('log.created_at < CURRENT_DATE + INTERVAL \'1 day\'')
      .select('COUNT(*)', 'requests')
      .addSelect('SUM(log.input_tokens + log.output_tokens)', 'tokens')
      .getRawOne();

    return this.buildUsageSummary(totals, today);
  }

  async getDailyUsageStats(user: AuthUser) {
    return this.scopedQuery(user)
      .andWhere("log.created_at >= CURRENT_DATE - INTERVAL '30 days'")
      .select("to_char(log.created_at, 'YYYY-MM-DD')", 'date')
      .addSelect('SUM(log.input_tokens + log.output_tokens)', 'tokens')
      .addSelect('SUM(log.cost)', 'cost')
      .addSelect('COUNT(*)', 'requests')
      .addSelect("SUM(CASE WHEN log.status = 'error' THEN 1 ELSE 0 END)", 'errors')
      .addSelect('AVG(log.latency)', 'avgLatency')
      .groupBy("to_char(log.created_at, 'YYYY-MM-DD')")
      .orderBy('date', 'DESC')
      .limit(30)
      .getRawMany();
  }

  async getUsageByModelStats(user: AuthUser) {
    return this.scopedQuery(user)
      .select('log.model', 'model')
      .addSelect('SUM(log.input_tokens + log.output_tokens)', 'tokens')
      .addSelect('SUM(log.cost)', 'cost')
      .addSelect('COUNT(*)', 'requests')
      .addSelect('AVG(log.latency)', 'avgLatency')
      .groupBy('log.model')
      .orderBy('tokens', 'DESC')
      .getRawMany();
  }

  async getRecentUsage(user: AuthUser, limit = 20): Promise<UsageRecentItem[]> {
    const rows = await this.scopedQuery(user)
      .orderBy('log.created_at', 'DESC')
      .take(limit)
      .getMany();

    return rows.map((row) => ({
      id: row.id,
      model: row.model,
      source: row.source,
      agentId: row.agentId,
      userId: row.userId,
      tenantId: row.tenantId,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      totalTokens: row.inputTokens + row.outputTokens,
      latency: row.latency,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getHourlyUsageStats(user: AuthUser) {
    return this.scopedQuery(user)
      .andWhere("log.created_at >= NOW() - INTERVAL '24 hours'")
      .select("to_char(log.created_at, 'YYYY-MM-DD HH24:00:00')", 'hour')
      .addSelect('COUNT(*)', 'requests')
      .addSelect('SUM(log.input_tokens + log.output_tokens)', 'tokens')
      .addSelect('AVG(log.latency)', 'avgLatency')
      .groupBy("to_char(log.created_at, 'YYYY-MM-DD HH24:00:00')")
      .orderBy('hour', 'ASC')
      .getRawMany();
  }

  async getAdminDailyUsageStats(filter: AdminUsageFilter = {}) {
    return this.getAdminTrendUsageStats(filter, 'day');
  }

  async getAdminTrendUsageStats(
    filter: AdminUsageFilter = {},
    period: UsageTrendPeriod = 'day',
  ): Promise<UsageTrendItem[]> {
    if (period === 'day') {
      return this.getAdminTodayHourlyTrend(filter);
    }
    if (period === 'week') {
      return this.getAdminDailyTrend(filter, 7);
    }
    return this.getAdminDailyTrend(filter, 30);
  }

  private async getAdminTodayHourlyTrend(filter: AdminUsageFilter): Promise<UsageTrendItem[]> {
    const rows = await this.adminQuery(filter)
      .andWhere('log.created_at >= CURRENT_DATE')
      .andWhere('log.created_at < CURRENT_DATE + INTERVAL \'1 day\'')
      .select("to_char(log.created_at, 'HH24:00')", 'period')
      .addSelect('SUM(log.input_tokens + log.output_tokens)', 'tokens')
      .addSelect('SUM(log.cost)', 'cost')
      .addSelect('COUNT(*)', 'requests')
      .addSelect("SUM(CASE WHEN log.status = 'error' THEN 1 ELSE 0 END)", 'errors')
      .addSelect('AVG(log.latency)', 'avgLatency')
      .groupBy("to_char(log.created_at, 'HH24:00')")
      .orderBy('period', 'ASC')
      .getRawMany<Omit<UsageTrendItem, 'label'>>();

    const slots = Array.from({ length: 24 }, (_, hour) => {
      const period = `${String(hour).padStart(2, '0')}:00`;
      return { period, label: period };
    });

    return this.mergeTrendSlots(slots, rows);
  }

  private async getAdminDailyTrend(
    filter: AdminUsageFilter,
    days: number,
  ): Promise<UsageTrendItem[]> {
    const rows = await this.adminQuery(filter)
      .andWhere("log.created_at >= CURRENT_DATE - (:offset || ' days')::interval", {
        offset: days - 1,
      })
      .select("to_char(log.created_at, 'YYYY-MM-DD')", 'period')
      .addSelect('SUM(log.input_tokens + log.output_tokens)', 'tokens')
      .addSelect('SUM(log.cost)', 'cost')
      .addSelect('COUNT(*)', 'requests')
      .addSelect("SUM(CASE WHEN log.status = 'error' THEN 1 ELSE 0 END)", 'errors')
      .addSelect('AVG(log.latency)', 'avgLatency')
      .groupBy("to_char(log.created_at, 'YYYY-MM-DD')")
      .orderBy('period', 'ASC')
      .getRawMany<Omit<UsageTrendItem, 'label'>>();

    const slots = await this.buildRecentDaySlots(days);
    return this.mergeTrendSlots(slots, rows);
  }

  private async buildRecentDaySlots(days: number): Promise<Array<{ period: string; label: string }>> {
    if (days <= 0) return [];

    const seqUnion = Array.from({ length: days }, (_, i) => `SELECT ${i} AS seq`).join(' UNION ALL ');
    const rows = await this.usageLogRepo.manager.query(
      `SELECT to_char(CURRENT_DATE - (seq || ' days')::interval, 'YYYY-MM-DD') AS period
       FROM (${seqUnion}) AS days
       ORDER BY period ASC`,
    ) as Array<{ period: string }>;

    return rows.map(({ period }) => {
      const [, month, day] = period.split('-');
      return {
        period,
        label: month && day ? `${parseInt(month, 10)}/${parseInt(day, 10)}` : period,
      };
    });
  }

  private normalizePeriodKey(period: unknown): string {
    if (period instanceof Date) {
      const year = period.getUTCFullYear();
      const month = String(period.getUTCMonth() + 1).padStart(2, '0');
      const day = String(period.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return String(period).slice(0, 10);
  }

  private mergeTrendSlots(
    slots: Array<{ period: string; label: string }>,
    rows: Array<Omit<UsageTrendItem, 'label'>>,
  ): UsageTrendItem[] {
    const map = new Map(rows.map((row) => [this.normalizePeriodKey(row.period), row]));
    return slots.map(({ period, label }) => {
      const row = map.get(period);
      return {
        period,
        label,
        tokens: row?.tokens ?? '0',
        cost: row?.cost ?? '0',
        requests: row?.requests ?? '0',
        errors: row?.errors ?? '0',
        avgLatency: row?.avgLatency ?? '0',
      };
    });
  }

  async getAdminUsageByModelStats(filter: AdminUsageFilter = {}) {
    return this.adminQuery(filter)
      .select('log.model', 'model')
      .addSelect('SUM(log.input_tokens + log.output_tokens)', 'tokens')
      .addSelect('SUM(log.cost)', 'cost')
      .addSelect('COUNT(*)', 'requests')
      .addSelect('AVG(log.latency)', 'avgLatency')
      .groupBy('log.model')
      .orderBy('tokens', 'DESC')
      .getRawMany();
  }

  async getAdminUsageByAgentStats(filter: AdminUsageFilter = {}) {
    return this.adminQuery(filter)
      .select('log.agent_id', 'agentId')
      .addSelect('SUM(log.input_tokens + log.output_tokens)', 'tokens')
      .addSelect('COUNT(*)', 'requests')
      .addSelect('AVG(log.latency)', 'avgLatency')
      .groupBy('log.agent_id')
      .orderBy('tokens', 'DESC')
      .getRawMany();
  }

  async getAdminRecentUsage(limit = 20, filter: AdminUsageFilter = {}): Promise<UsageRecentItem[]> {
    const rows = await this.adminQuery(filter)
      .orderBy('log.created_at', 'DESC')
      .take(limit)
      .getMany();

    return rows.map((row) => ({
      id: row.id,
      model: row.model,
      source: row.source,
      agentId: row.agentId,
      userId: row.userId,
      tenantId: row.tenantId,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      totalTokens: row.inputTokens + row.outputTokens,
      latency: row.latency,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getAdminHourlyUsageStats(filter: AdminUsageFilter = {}) {
    return this.adminQuery(filter)
      .andWhere("log.created_at >= NOW() - INTERVAL '24 hours'")
      .select("to_char(log.created_at, 'YYYY-MM-DD HH24:00:00')", 'hour')
      .addSelect('COUNT(*)', 'requests')
      .addSelect('SUM(log.input_tokens + log.output_tokens)', 'tokens')
      .addSelect('AVG(log.latency)', 'avgLatency')
      .groupBy("to_char(log.created_at, 'YYYY-MM-DD HH24:00:00')")
      .orderBy('hour', 'ASC')
      .getRawMany();
  }

  getAvailableModels(defaultModel: string, models: string[]) {
    const list = models.length > 0 ? models : [defaultModel];
    return {
      defaultModel,
      models: list.map((id) => ({ id, label: id })),
    };
  }
}
