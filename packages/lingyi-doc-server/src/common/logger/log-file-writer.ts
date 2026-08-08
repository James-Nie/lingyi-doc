import { appendFileSync, mkdirSync } from 'fs';
import { basename, dirname, extname, join } from 'path';

/** 本地日历日 YYYY-MM-DD（按进程时区） */
function formatDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 将配置中的日志路径解析为按天文件路径。
 * 例：data/logs/server.log → data/logs/server-2026-07-16.log
 */
/**
 * 解析日志文件路径为按天文件路径
 * @param filePath 原始日志文件路径
 * @param date 日期对象，默认当前日期
 * @returns 按天日志文件路径
 */
export function resolveDailyLogPath(filePath: string, date: Date = new Date()): string {
  const trimmed = filePath.trim();
  if (!trimmed) return '';
  const dir = dirname(trimmed);
  const base = basename(trimmed);
  const ext = extname(base);
  const name = (ext ? basename(base, ext) : base) || 'server';
  return join(dir, `${name}-${formatDay(date)}${ext || '.log'}`);
}

/** 追加一行日志到当日文件（失败时静默，不影响主流程） */
export function appendLogLine(filePath: string, line: string): void {
  const dailyPath = resolveDailyLogPath(filePath);
  if (!dailyPath) return;
  try {
    mkdirSync(dirname(dailyPath), { recursive: true });
    appendFileSync(dailyPath, `${line}\n`, 'utf8');
  } catch {
    // 文件写入失败时不阻断服务
  }
}
