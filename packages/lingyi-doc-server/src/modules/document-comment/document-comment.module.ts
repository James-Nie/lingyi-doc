import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DocCommentReplyEntity,
  DocCommentReplyLikeEntity,
  DocCommentThreadEntity,
} from '../../database/entities/document-comment.entity';
import { DocumentCommentRepository } from '../../repositories/document-comment.repository';
import { CollabModule } from '../collab/collab.module';
import { DocumentCommentController } from './document-comment.controller';
import { DocumentCommentService } from './document-comment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocCommentThreadEntity, DocCommentReplyEntity, DocCommentReplyLikeEntity]),
    CollabModule,
  ],
  controllers: [DocumentCommentController],
  providers: [DocumentCommentRepository, DocumentCommentService],
  exports: [DocumentCommentService],
})
export class DocumentCommentModule {}
