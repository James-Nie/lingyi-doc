import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BaseDashboardEntity, BaseDashboardPrefsEntity } from '../../database/entities/base.entity';
import { BaseDashboardRepository } from '../../repositories/base-dashboard.repository';
import { DocumentDataModule } from '../../repositories/document-data.module';
import { BaseDashboardController } from './base-dashboard.controller';
import { BaseDashboardService } from './base-dashboard.service';

@Module({
  imports: [
    DocumentDataModule,
    TypeOrmModule.forFeature([BaseDashboardEntity, BaseDashboardPrefsEntity]),
  ],
  controllers: [BaseDashboardController],
  providers: [BaseDashboardRepository, BaseDashboardService],
  exports: [BaseDashboardService],
})
export class BaseDashboardModule {}
