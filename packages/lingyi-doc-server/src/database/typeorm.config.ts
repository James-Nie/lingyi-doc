import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ALL_ENTITIES } from '../database/entities';

export function buildTypeOrmOptions(config: ConfigService): TypeOrmModuleOptions {
  return {
    type: 'mysql',
    host: config.get<string>('db.host'),
    port: config.get<number>('db.port'),
    username: config.get<string>('db.username'),
    password: config.get<string>('db.password'),
    database: config.get<string>('db.database'),
    entities: ALL_ENTITIES,
    synchronize: false,
    timezone: 'Z',
    charset: 'utf8mb4',
    extra: {
      connectionLimit: config.get<number>('db.connectionLimit'),
    },
    logging: process.env.TYPEORM_LOGGING === '1',
  };
}
