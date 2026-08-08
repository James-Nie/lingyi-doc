import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DomainMetricsService } from '../../common/metrics/domain-metrics.service';
import { DeployService } from '../../config/deploy.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly deployService: DeployService,
    private readonly domainMetrics: DomainMetricsService,
  ) {}

  async pingDatabase(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1 AS ok');
      return true;
    } catch {
      return false;
    }
  }

  async pingRedis(): Promise<boolean | null> {
    if (!this.config.get<string>('redis.url')) return null;
    return this.redis.ping();
  }

  async getHealth() {
    const dbOk = await this.pingDatabase();
    const redisOk = await this.pingRedis();
    const collabEnabled = this.config.get<boolean>('collab.enabled', false);
    const degraded = !dbOk || (collabEnabled && redisOk === false);
    return {
      status: degraded ? 'degraded' : 'ok',
      version: '0.1.0',
      timestamp: Date.now(),
      database: dbOk ? 'connected' : 'disconnected',
      redis: redisOk == null ? 'not_configured' : (redisOk ? 'connected' : 'disconnected'),
      collaboration: {
        enabled: collabEnabled,
      },
      deploy: {
        edition: this.deployService.getEdition(),
        type: this.deployService.type,
        license: this.deployService.getLicenseResult().status,
        licenseEnforced: this.deployService.isLicenseEnforced(),
      },
      metrics: this.domainMetrics.snapshot(),
    };
  }
}
