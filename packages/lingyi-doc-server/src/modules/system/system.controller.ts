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
import { CollabService } from '../collab/collab.service';
import { DocumentCommentService } from '../document-comment/document-comment.service';

@Controller('api/v1/system')
export class SystemController {
  private readonly logger = new Logger(SystemController.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly healthService: HealthService,
    private readonly collabService: CollabService,
    private readonly commentService: DocumentCommentService,
    private readonly config: ConfigService,
  ) {}

  @Get('features')
  features() {
    return {
      collab: this.collabService.isEnabled(),
      comments: this.commentService.isEnabled(),
      ai: this.config.get<boolean>('ai.enabled'),
    };
  }

  @Get('stats')
  async stats() {
    try {
      const total = this.storageService.isReady() ? await this.storageService.countDocuments() : 0;
      const wsStats = this.collabService.getStats();
      const dbOk = await this.healthService.pingDatabase();
      const redisOk = await this.healthService.pingRedis();

      return {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        database: {
          connected: dbOk,
          host: this.config.get<string>('db.host'),
          name: this.config.get<string>('db.database'),
        },
        documents: { total },
        collaboration: {
          enabled: this.collabService.isEnabled(),
          ...wsStats,
        },
        comments: {
          enabled: this.commentService.isEnabled(),
        },
        redis: {
          configured: this.config.get<string>('redis.url') != null,
          connected: redisOk === true,
        },
      };
    } catch (err) {
      this.logger.error('stats failed', err);
      throw new BusinessException(100005, '获取系统统计失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
