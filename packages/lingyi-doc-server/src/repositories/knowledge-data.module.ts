import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  KbMemberEntity,
  KbNodeEntity,
  KnowledgeBaseEntity,
} from '../database/entities/knowledge-base.entity';
import { DocumentDataModule } from './document-data.module';
import { KnowledgeBaseRepository } from './knowledge-base.repository';
import { KbNodeRepository } from './kb-node.repository';

/**
 * Knowledge 域数据模块（非 Global）。
 * 需要 KB 仓储的业务模块必须显式 imports: [KnowledgeDataModule]。
 * KbNodeRepository 需查询 DocumentEntity.docType，故依赖 DocumentDataModule。
 */
@Module({
  imports: [
    DocumentDataModule,
    TypeOrmModule.forFeature([KnowledgeBaseEntity, KbNodeEntity, KbMemberEntity]),
  ],
  providers: [KnowledgeBaseRepository, KbNodeRepository],
  exports: [KnowledgeBaseRepository, KbNodeRepository, TypeOrmModule],
})
export class KnowledgeDataModule {}
