import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CrdtOplogEntity } from '../../database/entities/crdt-oplog.entity';
import { CrdtOplogRepository } from '../../repositories/crdt-oplog.repository';
import { RedisModule } from '../../redis/redis.module';
import { CollabGateway } from './collab.gateway';
import { CollabService } from './collab.service';
import { RoomManager } from './room.manager';

@Module({
  imports: [
    RedisModule,
    TypeOrmModule.forFeature([CrdtOplogEntity]),
  ],
  providers: [
    CrdtOplogRepository,
    RoomManager,
    CollabService,
    CollabGateway,
  ],
  exports: [CollabService],
})
export class CollabModule {}
