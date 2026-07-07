import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuotaDailyLogEntity } from '../database/entities/quota-daily-log.entity';

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class QuotaDailyLogRepository {
  constructor(
    @InjectRepository(QuotaDailyLogEntity)
    private readonly repo: Repository<QuotaDailyLogEntity>,
  ) {}

  async getCount(spaceKind: 1 | 2, spaceId: string, metric: string, logDate = todayDateString()): Promise<number> {
    const row = await this.repo.findOne({
      where: { spaceKind, spaceId, metric, logDate },
    });
    return row?.countValue ?? 0;
  }

  async increment(
    spaceKind: 1 | 2,
    spaceId: string,
    metric: string,
    delta = 1,
    logDate = todayDateString(),
  ): Promise<number> {
    await this.repo.query(
      `INSERT INTO quota_daily_log (space_kind, space_id, metric, log_date, count_value)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE count_value = count_value + VALUES(count_value)`,
      [spaceKind, spaceId, metric, logDate, delta],
    );
    return this.getCount(spaceKind, spaceId, metric, logDate);
  }
}
