import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from '../database/entities/misc.entity';
import type { DbAuditLog } from '../types/database';

function toDbAuditLog(entity: AuditLogEntity): DbAuditLog {
  return {
    id: Number(entity.id),
    operator_id: entity.operatorId,
    action: entity.action,
    target_type: entity.targetType,
    target_id: entity.targetId,
    detail: entity.detail,
    ip: entity.ip,
    user_agent: entity.userAgent,
    created_at: entity.createdAt,
  };
}

@Injectable()
export class AuditLogRepository {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
  ) {}

  async create(input: {
    operatorId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    detail?: unknown;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    await this.repo.save({
      operatorId: input.operatorId,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      detail: input.detail ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
  }

  async list(options: {
    operatorId?: string;
    action?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ items: DbAuditLog[]; total: number }> {
    const qb = this.repo.createQueryBuilder('a').where('1=1');

    if (options.operatorId) {
      qb.andWhere('a.operatorId = :operatorId', { operatorId: options.operatorId });
    }
    if (options.action) {
      qb.andWhere('a.action LIKE :action', { action: `%${options.action}%` });
    }

    const total = await qb.getCount();
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    const entities = await qb
      .orderBy('a.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();

    return { items: entities.map(toDbAuditLog), total };
  }
}
