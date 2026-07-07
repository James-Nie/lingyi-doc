import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { SkipResponseWrap } from '../../common/decorators/skip-response-wrap.decorator';
import { HealthService } from './health.service';

@Controller('api/v1/health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @SkipResponseWrap()
  @HttpCode(HttpStatus.OK)
  async check(@Res() res: Response) {
    const payload = await this.healthService.getHealth();
    const status = payload.database === 'connected' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    res.status(status).json(payload);
  }
}
