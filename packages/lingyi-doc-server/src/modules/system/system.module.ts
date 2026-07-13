import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { CollabModule } from '../collab/collab.module';
import { DocumentCommentModule } from '../document-comment/document-comment.module';
import { SystemController } from './system.controller';

@Module({
  imports: [HealthModule, CollabModule, DocumentCommentModule],
  controllers: [SystemController],
})
export class SystemModule {}
