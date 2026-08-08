import { Global, Module } from '@nestjs/common';
import { DeployService } from './deploy.service';
import { DomainMetricsService } from '../common/metrics/domain-metrics.service';

/**
 * 部署配置（Global）。
 * 从 RepositoriesModule 拆出，避免 TenantDataModule 等与 Global 仓库层循环依赖。
 */
@Global()
@Module({
  providers: [DeployService, DomainMetricsService],
  exports: [DeployService, DomainMetricsService],
})
export class DeployModule {}
