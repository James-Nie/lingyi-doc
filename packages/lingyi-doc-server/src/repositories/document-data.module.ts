import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentEntity } from '../database/entities/document.entity';
import { DocumentContentEntity } from '../database/entities/document-content.entity';
import { DocumentSnapshotEntity } from '../database/entities/document-snapshot.entity';
import { RecordChangeHistoryEntity } from '../database/entities/record-change-history.entity';
import { DocumentRepository } from './document.repository';

/**
 * Document 域数据模块（非 Global）。
 * 需要 DocumentRepository 的业务模块必须显式 imports: [DocumentDataModule]。
 */
@Module({
  imports: [TypeOrmModule.forFeature([DocumentEntity, DocumentContentEntity, DocumentSnapshotEntity, RecordChangeHistoryEntity])],
  providers: [DocumentRepository],
  exports: [DocumentRepository, TypeOrmModule],
})
export class DocumentDataModule {}
