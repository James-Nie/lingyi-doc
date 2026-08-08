import type { AppLoggerService } from './app-logger.service';

/** 绑定固定 context 的日志器，便于在 Service 中注入使用 */
export class ContextLogger {
  constructor(
    private readonly root: AppLoggerService,
    private readonly context: string,
  ) {}

  log(message: unknown): void {
    this.root.log(message, this.context);
  }

  error(message: unknown, trace?: string): void {
    this.root.error(message, trace, this.context);
  }

  warn(message: unknown): void {
    this.root.warn(message, this.context);
  }

  debug(message: unknown): void {
    this.root.debug(message, this.context);
  }

  verbose(message: unknown): void {
    this.root.verbose(message, this.context);
  }

  fatal(message: unknown): void {
    this.root.fatal(message, this.context);
  }
}
