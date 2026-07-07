import {
  Controller,
  Get,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../common/exceptions/business.exception';
import { StorageService } from '../../services/storage.service';
import { HealthService } from '../health/health.service';

@Controller('api/v1/system')
export class SystemController {
  private readonly logger = new Logger(SystemController.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly healthService: HealthService,
    private readonly config: ConfigService,
  ) {}

  @Get('stats')
  async stats() {
    try {
      const total = this.storageService.isReady() ? await this.storageService.countDocuments() : 0;
      const wsStats = { rooms: 0, connections: 0 };
      const dbOk = await this.healthService.pingDatabase();

      return {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        database: {
          connected: dbOk,
          host: this.config.get<string>('db.host'),
          name: this.config.get<string>('db.database'),
        },
        documents: { total },
        collaboration: wsStats,
      };
    } catch (err) {
      this.logger.error('stats failed', err);
      throw new BusinessException(100005, '获取系统统计失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
