import { Module } from '@nestjs/common';
import { AdminTemplateController } from './admin-template.controller';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';

@Module({
  controllers: [AdminTemplateController, TemplateController],
  providers: [TemplateService],
})
export class TemplateModule {}
