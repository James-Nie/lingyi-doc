import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from '../database/entities/misc.entity';
import { UserEntity } from '../database/entities/user.entity';
import type { DbAuditLog } from '../types/database';

function toDbAuditLog(entity: AuditLogEntity, operatorName?: string | null): DbAuditLog {
  return {
    id: Number(entity.id),
    operator_id: entity.operatorId,
    operator_name: operatorName ?? null,
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
    const rows = await qb
      .leftJoin(UserEntity, 'u', 'u.id = a.operatorId')
      .select([
        'a.id',
        'a.operatorId',
        'a.action',
        'a.targetType',
        'a.targetId',
        'a.detail',
        'a.ip',
        'a.userAgent',
        'a.createdAt',
        'u.displayName',
      ])
      .orderBy('a.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getRawMany<Record<string, unknown>>();

    const items = rows.map((row) => toDbAuditLog(
      {
        id: String(row.a_id),
        operatorId: (row.a_operator_id ?? row.a_operatorId) as string,
        action: (row.a_action) as string,
        targetType: (row.a_target_type ?? row.a_targetType ?? null) as string | null,
        targetId: (row.a_target_id ?? row.a_targetId ?? null) as string | null,
        detail: row.a_detail ?? null,
        ip: (row.a_ip ?? null) as string | null,
        userAgent: (row.a_user_agent ?? row.a_userAgent ?? null) as string | null,
        createdAt: (row.a_created_at ?? row.a_createdAt) as Date,
      } as AuditLogEntity,
      (row.u_display_name ?? row.u_displayName ?? null) as string | null,
    ));

    return { items, total };
  }
}
