import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DEFAULT_SYSTEM_CONFIGS } from '../constants/rbac';
import { SystemConfigEntity } from '../database/entities/misc.entity';

@Injectable()
export class SystemConfigRepository {
  constructor(
    @InjectRepository(SystemConfigEntity)
    private readonly repo: Repository<SystemConfigEntity>,
  ) {}

  async seedDefaults(): Promise<void> {
    for (const item of DEFAULT_SYSTEM_CONFIGS) {
      const existing = await this.get(item.key);
      if (existing) continue;
      await this.repo.save({
        configKey: item.key,
        configValue: item.value,
        description: item.description,
      });
    }
  }

  async get(key: string): Promise<SystemConfigEntity | null> {
    return this.repo.findOne({ where: { configKey: key } });
  }

  async getValue<T>(key: string, fallback: T): Promise<T> {
    const row = await this.get(key);
    if (!row) return fallback;
    return row.configValue as T;
  }

  async list(): Promise<Array<{ key: string; value: unknown; description: string | null; updatedAt: number }>> {
    const rows = await this.repo.find({ order: { configKey: 'ASC' } });
    return rows.map((row) => ({
      key: row.configKey,
      value: row.configValue,
      description: row.description,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.getTime() : new Date(row.updatedAt).getTime(),
    }));
  }

  async set(key: string, value: unknown, updatedBy: string, description?: string): Promise<void> {
    const existing = await this.get(key);
    if (existing) {
      existing.configValue = value;
      existing.updatedBy = updatedBy;
      if (description !== undefined) existing.description = description;
      await this.repo.save(existing);
      return;
    }
    await this.repo.save({
      configKey: key,
      configValue: value,
      description: description ?? null,
      updatedBy,
    });
  }
}
