import { Injectable, LoggerService, LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseLogLevel, shouldLogLevel } from './log-level';

type LogMeta = Record<string, unknown>;

interface HttpLogPayload {
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AppLoggerService implements LoggerService {
  private readonly minLevel: LogLevel;
  private readonly json: boolean;
  private readonly httpEnabled: boolean;
  private readonly slowRequestMs: number;

  constructor(private readonly config: ConfigService) {
    this.minLevel = parseLogLevel(this.config.get<string>('log.level'));
    this.json = this.config.get<boolean>('log.json') ?? false;
    this.httpEnabled = this.config.get<boolean>('log.http') ?? true;
    this.slowRequestMs = this.config.get<number>('log.slowRequestMs') ?? 1000;
  }

  log(message: unknown, context?: string): void {
    this.write('log', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace ? { trace } : undefined);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  fatal(message: unknown, context?: string): void {
    this.write('fatal', message, context);
  }

  logHttp(payload: HttpLogPayload): void {
    if (!this.httpEnabled) return;

    const level: LogLevel = payload.statusCode >= 500
      ? 'error'
      : payload.statusCode >= 400
        ? 'warn'
        : payload.durationMs >= this.slowRequestMs
          ? 'warn'
          : 'log';

    const message = `${payload.method} ${payload.url} ${payload.statusCode} ${payload.durationMs}ms`;
    this.write(level, message, 'HTTP', {
      requestId: payload.requestId,
      ip: payload.ip,
      userAgent: payload.userAgent,
      statusCode: payload.statusCode,
      durationMs: payload.durationMs,
    });
  }

  private write(
    level: LogLevel,
    message: unknown,
    context?: string,
    meta?: LogMeta,
  ): void {
    if (!shouldLogLevel(level, this.minLevel)) return;

    const normalizedMessage = this.normalizeMessage(message);
    const record = {
      timestamp: new Date().toISOString(),
      level,
      context: context || 'App',
      message: normalizedMessage,
      ...(meta && Object.keys(meta).length ? { meta } : {}),
    };

    const line = this.json
      ? JSON.stringify(record)
      : this.formatPretty(record);

    this.print(level, line);
  }

  private normalizeMessage(message: unknown): string {
    if (message instanceof Error) {
      return message.stack || message.message;
    }
    if (typeof message === 'string') return message;
    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }

  private formatPretty(record: {
    timestamp: string;
    level: string;
    context: string;
    message: string;
    meta?: LogMeta;
  }): string {
    const base = `[${record.timestamp}] [${record.level.toUpperCase()}] [${record.context}] ${record.message}`;
    if (!record.meta) return base;
    const metaText = Object.entries(record.meta)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
      .join(' ');
    return metaText ? `${base} | ${metaText}` : base;
  }

  private print(level: LogLevel, line: string): void {
    switch (level) {
      case 'error':
      case 'fatal':
        console.error(line);
        break;
      case 'warn':
        console.warn(line);
        break;
      case 'debug':
      case 'verbose':
        console.debug(line);
        break;
      default:
        console.log(line);
        break;
    }
  }
}
