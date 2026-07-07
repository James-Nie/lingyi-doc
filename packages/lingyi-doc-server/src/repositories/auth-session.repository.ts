import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AuthSessionEntity } from '../database/entities/misc.entity';
import type { ClientType } from '../types/database';
import type { ConsumerSessionContext } from '../types/session';
import { hashRefreshToken } from '../services/auth.service';

@Injectable()
export class AuthSessionRepository {
  constructor(
    @InjectRepository(AuthSessionEntity)
    private readonly repo: Repository<AuthSessionEntity>,
  ) {}

  async create(input: {
    userId: string;
    refreshToken: string;
    clientType: ClientType;
    expiresAt: Date;
    ip?: string | null;
    deviceInfo?: string | null;
    sessionContext?: ConsumerSessionContext | null;
  }): Promise<void> {
    await this.repo.save({
      id: uuidv4(),
      userId: input.userId,
      refreshTokenHash: hashRefreshToken(input.refreshToken),
      clientType: input.clientType,
      sessionContext: input.sessionContext ?? null,
      deviceInfo: input.deviceInfo ?? null,
      ip: input.ip ?? null,
      expiresAt: input.expiresAt,
    });
  }

  async findValid(
    refreshToken: string,
    clientType: ClientType,
  ): Promise<{ userId: string; sessionContext: ConsumerSessionContext | null } | null> {
    const hash = hashRefreshToken(refreshToken);
    const row = await this.repo.findOne({
      where: {
        refreshTokenHash: hash,
        clientType,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
    if (!row) return null;

    let sessionContext: ConsumerSessionContext | null = null;
    if (row.sessionContext) {
      try {
        sessionContext = typeof row.sessionContext === 'string'
          ? JSON.parse(row.sessionContext) as ConsumerSessionContext
          : row.sessionContext as ConsumerSessionContext;
      } catch {
        sessionContext = null;
      }
    }
    return { userId: row.userId, sessionContext };
  }

  async updateSessionContext(refreshToken: string, sessionContext: ConsumerSessionContext): Promise<void> {
    const hash = hashRefreshToken(refreshToken);
    await this.repo
      .createQueryBuilder()
      .update(AuthSessionEntity)
      .set({ sessionContext })
      .where('refreshTokenHash = :hash', { hash })
      .andWhere('revokedAt IS NULL')
      .execute();
  }

  async revoke(refreshToken: string): Promise<void> {
    const hash = hashRefreshToken(refreshToken);
    await this.repo
      .createQueryBuilder()
      .update(AuthSessionEntity)
      .set({ revokedAt: new Date() })
      .where('refreshTokenHash = :hash', { hash })
      .andWhere('revokedAt IS NULL')
      .execute();
  }

  async listForUser(userId: string, clientType: ClientType, limit = 50): Promise<AuthSessionEntity[]> {
    return this.repo.find({
      where: { userId, clientType },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async revokeAllForUser(userId: string, clientType?: ClientType): Promise<void> {
    const qb = this.repo
      .createQueryBuilder()
      .update(AuthSessionEntity)
      .set({ revokedAt: new Date() })
      .where('userId = :userId', { userId })
      .andWhere('revokedAt IS NULL');
    if (clientType) {
      qb.andWhere('clientType = :clientType', { clientType });
    }
    await qb.execute();
  }
}
