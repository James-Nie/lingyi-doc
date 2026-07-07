import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppLoggerService } from '../logger/app-logger.service';
import { BusinessException } from '../exceptions/business.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const requestMeta = {
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl || req.url,
    };

    if (exception instanceof BusinessException) {
      const body = exception.getResponse() as { code: number; message: string };
      if (exception.getStatus() >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.warn(`Business error ${body.code}: ${body.message}`, 'ExceptionFilter');
      }
      res.status(exception.getStatus()).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'object' && payload !== null && 'code' in payload) {
        res.status(status).json(payload);
        return;
      }

      const message = typeof payload === 'string'
        ? payload
        : (payload as { message?: string | string[] }).message;
      const normalizedMessage = Array.isArray(message) ? message.join('; ') : (message || '请求失败');

      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(
          `HTTP ${status} ${normalizedMessage} | ${JSON.stringify(requestMeta)}`,
          exception instanceof Error ? exception.stack : undefined,
          'ExceptionFilter',
        );
      }

      res.status(status).json({
        code: status === HttpStatus.UNAUTHORIZED ? 110002 : 100005,
        message: normalizedMessage,
      });
      return;
    }

    this.logger.error(
      `Unhandled exception | ${JSON.stringify(requestMeta)}`,
      exception instanceof Error ? exception.stack : String(exception),
      'ExceptionFilter',
    );
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 100005,
      message: '服务器内部错误',
    });
  }
}
