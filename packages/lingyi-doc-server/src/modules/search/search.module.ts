import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { DocumentEntity } from '../../database/entities/document.entity';
import { DocumentContentEntity } from '../../database/entities/document-content.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { DocShareEntity } from '../../database/entities/document-share.entity';
import { BaseRecordEntity, BaseTableEntity } from '../../database/entities/base.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DocumentEntity,
      DocumentContentEntity,
      UserEntity,
      DocShareEntity,
      BaseRecordEntity,
      BaseTableEntity,
    ]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}