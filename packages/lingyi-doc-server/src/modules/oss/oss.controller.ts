import {
  Controller,
  Get,
  HttpStatus,
  Logger,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { SkipResponseWrap } from '../../common/decorators/skip-response-wrap.decorator';
import { OssService } from '../../services/oss.service';
import { assertAllowedObjectKey, verifyObjectAccess } from '../../utils/ossAccess';

@Controller('api/v1/oss')
export class OssController {
  private readonly logger = new Logger(OssController.name);

  constructor(
    private readonly ossService: OssService,
    private readonly config: ConfigService,
  ) {}

  @Get('access')
  @SkipResponseWrap()
  async access(
    @Query('key') keyB64: string | undefined,
    @Query('exp') expRaw: string | undefined,
    @Query('sig') sig: string | undefined,
    @Res() res: Response,
  ) {
    try {
      if (!this.ossService.isEnabled()) {
        res.status(HttpStatus.SERVICE_UNAVAILABLE).send('OSS 未配置');
        return;
      }

      const exp = Number(expRaw);
      if (!keyB64 || !sig || !Number.isFinite(exp)) {
        res.status(HttpStatus.BAD_REQUEST).send('参数无效');
        return;
      }

      const objectKey = Buffer.from(keyB64, 'base64url').toString('utf8');
      assertAllowedObjectKey(objectKey, this.config);
      if (!verifyObjectAccess(objectKey, exp, sig, this.config)) {
        res.status(HttpStatus.FORBIDDEN).send('链接无效或已过期');
        return;
      }

      const { stream, contentType, contentLength } = await this.ossService.getObjectStream(objectKey);
      if (contentType) res.setHeader('Content-Type', contentType);
      if (contentLength != null) res.setHeader('Content-Length', String(contentLength));
      const ttl = this.config.get<number>('oss.accessUrlTtl') ?? 86400;
      res.setHeader('Cache-Control', `private, max-age=${Math.min(ttl, 86400)}`);
      stream.pipe(res);
    } catch (err) {
      this.logger.error('access failed', err);
      res.status(HttpStatus.NOT_FOUND).send('文件不存在');
    }
  }
}
