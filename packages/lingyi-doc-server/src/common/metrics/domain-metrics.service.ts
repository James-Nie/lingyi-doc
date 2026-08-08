import { Injectable, Logger } from '@nestjs/common';

export type DomainMetricName =
  | 'document.create'
  | 'document.open'
  | 'collab.connect'
  | 'ai.chat'
  | 'ai.embed'
  | 'mcp.tool_call'
  | 'membership.deny';

/**
 * 轻量按域计数（进程内）。为 Phase 4 可选拆分与后续 Prometheus 导出做准备。
 * 不引入外部依赖；可通过 snapshot() 挂到健康检查或日志。
 */
@Injectable()
export class DomainMetricsService {
  private readonly logger = new Logger(DomainMetricsService.name);
  private readonly counters = new Map<string, number>();

  inc(name: DomainMetricName, labels?: Record<string, string>, delta = 1): void {
    const key = labels ? `${name}|${stableLabels(labels)}` : name;
    this.counters.set(key, (this.counters.get(key) ?? 0) + delta);
  }

  get(name: DomainMetricName, labels?: Record<string, string>): number {
    const key = labels ? `${name}|${stableLabels(labels)}` : name;
    return this.counters.get(key) ?? 0;
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counters.entries());
  }

  logSnapshot(tag = 'domain-metrics'): void {
    this.logger.log(`${tag} ${JSON.stringify(this.snapshot())}`);
  }
}

function stableLabels(labels: Record<string, string>): string {
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(',');
}
