import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DemoRequestEntity } from '../database/entities/misc.entity';
import { UserEntity } from '../database/entities/user.entity';
import type { DbDemoRequest, DemoRequestStatus } from '../types/database';

function parseProducts(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toTimestamp(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

export interface DemoRequestCreateInput {
  name: string;
  phone: string;
  company: string;
  companySize: string;
  scenario: string;
  products: string[];
  questions: string;
  ip?: string | null;
  userAgent?: string | null;
  submittedBy?: string | null;
}

type DemoRequestRow = DbDemoRequest & {
  processed_by_name?: string | null;
};

function entityToDbDemoRequest(entity: DemoRequestEntity): DbDemoRequest {
  return {
    id: entity.id,
    name: entity.name,
    phone: entity.phone,
    company: entity.company,
    company_size: entity.companySize,
    scenario: entity.scenario,
    products: entity.products,
    questions: entity.questions,
    status: entity.status as DemoRequestStatus,
    ip: entity.ip,
    user_agent: entity.userAgent,
    submitted_by: entity.submittedBy,
    contacted_at: entity.contactedAt,
    admin_note: entity.adminNote,
    processed_by: entity.processedBy,
    processed_at: entity.processedAt,
    created_at: entity.createdAt,
    updated_at: entity.updatedAt,
  };
}

@Injectable()
export class DemoRequestRepository {
  constructor(
    @InjectRepository(DemoRequestEntity)
    private readonly repo: Repository<DemoRequestEntity>,
  ) {}

  toPublic(row: DemoRequestRow) {
    const isProcessed = row.status !== 'pending';
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      company: row.company,
      companySize: row.company_size,
      scenario: row.scenario,
      products: parseProducts(row.products),
      questions: row.questions,
      status: row.status,
      isProcessed,
      ip: row.ip,
      userAgent: row.user_agent,
      submittedBy: row.submitted_by,
      contactedAt: toTimestamp(row.contacted_at),
      handleComment: row.admin_note,
      processedBy: row.processed_by,
      processedByName: row.processed_by_name ?? null,
      processedAt: toTimestamp(row.processed_at),
      createdAt: toTimestamp(row.created_at)!,
      updatedAt: toTimestamp(row.updated_at)!,
    };
  }

  async create(input: DemoRequestCreateInput): Promise<DbDemoRequest> {
    const id = uuidv4();
    await this.repo.save({
      id,
      name: input.name,
      phone: input.phone,
      company: input.company,
      companySize: input.companySize,
      scenario: input.scenario,
      products: input.products,
      questions: input.questions,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      submittedBy: input.submittedBy ?? null,
    });
    const row = await this.findById(id);
    if (!row) throw new Error('创建预约演示记录失败');
    return row;
  }

  async findById(id: string): Promise<DemoRequestRow | null> {
    const raw = await this.repo
      .createQueryBuilder('dr')
      .leftJoin(UserEntity, 'u', 'u.id = dr.processedBy')
      .where('dr.id = :id', { id })
      .select(['dr', 'u.displayName'])
      .getRawAndEntities();

    const entity = raw.entities[0];
    if (!entity) return null;

    const processedByName = raw.raw[0]?.u_displayName as string | null | undefined;
    return {
      ...entityToDbDemoRequest(entity),
      processed_by_name: processedByName ?? null,
    };
  }

  async list(options: {
    status?: DemoRequestStatus;
    keyword?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ items: DemoRequestRow[]; total: number }> {
    const qb = this.repo.createQueryBuilder('dr');

    if (options.status) {
      qb.andWhere('dr.status = :status', { status: options.status });
    }
    if (options.keyword?.trim()) {
      const kw = `%${options.keyword.trim()}%`;
      qb.andWhere('(dr.name LIKE :kw OR dr.phone LIKE :kw OR dr.company LIKE :kw)', { kw });
    }

    const total = await qb.getCount();
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;

    const rows = await qb
      .leftJoin(UserEntity, 'u', 'u.id = dr.processedBy')
      .select(['dr', 'u.displayName'])
      .orderBy('dr.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getRawAndEntities();

    const items: DemoRequestRow[] = rows.entities.map((entity, i) => ({
      ...entityToDbDemoRequest(entity),
      processed_by_name: (rows.raw[i]?.u_displayName as string | null) ?? null,
    }));

    return { items, total };
  }

  async process(
    id: string,
    input: {
      status: DemoRequestStatus;
      handleComment?: string | null;
      processedBy: string;
    },
  ): Promise<DemoRequestRow | null> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) return null;

    const contactedAt =
      ['contacted', 'closed'].includes(input.status) && !existing.contactedAt
        ? new Date()
        : existing.contactedAt;

    await this.repo.update(id, {
      status: input.status,
      adminNote: input.handleComment ?? existing.adminNote,
      processedBy: input.processedBy,
      processedAt: new Date(),
      contactedAt,
    });

    return this.findById(id);
  }

  async countRecentByIp(ip: string, windowMinutes: number): Promise<number> {
    const since = new Date(Date.now() - windowMinutes * 60_000);
    return this.repo
      .createQueryBuilder('dr')
      .where('dr.ip = :ip', { ip })
      .andWhere('dr.createdAt >= :since', { since })
      .getCount();
  }
}
