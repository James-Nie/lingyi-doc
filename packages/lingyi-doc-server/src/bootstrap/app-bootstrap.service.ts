import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AdminRoleRepository } from '../repositories/admin-role.repository';
import { SystemConfigRepository } from '../repositories/system-config.repository';

@Injectable()
export class AppBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AppBootstrapService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly adminRoleRepository: AdminRoleRepository,
    private readonly systemConfigRepository: SystemConfigRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      if (!this.dataSource.isInitialized) return;
      await this.dataSource.query('SELECT 1');
      await this.adminRoleRepository.seedDefaults();
      await this.systemConfigRepository.seedDefaults();
      this.logger.log('RBAC 与系统配置种子数据已就绪');
    } catch (err) {
      this.logger.warn('启动种子初始化跳过（数据库未就绪）', err);
    }
  }
}
