import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async pingDatabase(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1 AS ok');
      return true;
    } catch {
      return false;
    }
  }

  async getHealth() {
    const dbOk = await this.pingDatabase();
    return {
      status: dbOk ? 'ok' : 'degraded',
      version: '0.1.0',
      timestamp: Date.now(),
      database: dbOk ? 'connected' : 'disconnected',
    };
  }
}
