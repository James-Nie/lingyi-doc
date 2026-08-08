import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import type { Request, Response } from 'express';
import { AppLoggerService } from '../logger/app-logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();

    const logRequest = (statusCode: number) => {
      this.logger.logHttp({
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode,
        durationMs: Date.now() - startedAt,
        requestId: req.requestId,
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      });
    };

    return next.handle().pipe(
      tap(() => {
        logRequest(res.statusCode || 200);
      }),
      catchError(err => {
        const statusCode = typeof err?.getStatus === 'function'
          ? err.getStatus()
          : res.statusCode || 500;
        logRequest(statusCode);
        return throwError(() => err);
      }),
    );
  }
}
