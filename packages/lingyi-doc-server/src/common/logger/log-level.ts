import type { LogLevel } from '@nestjs/common';

const LEVEL_RANK: Record<LogLevel, number> = {
  verbose: 0,
  debug: 1,
  log: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

export function parseLogLevel(raw: string | undefined): LogLevel {
  const value = (raw || 'log').trim().toLowerCase();
  switch (value) {
    case 'fatal':
      return 'fatal';
    case 'error':
      return 'error';
    case 'warn':
    case 'warning':
      return 'warn';
    case 'info':
    case 'log':
      return 'log';
    case 'debug':
      return 'debug';
    case 'verbose':
    case 'trace':
      return 'verbose';
    default:
      return 'log';
  }
}

export function shouldLogLevel(current: LogLevel, min: LogLevel): boolean {
  return LEVEL_RANK[current] >= LEVEL_RANK[min];
}
