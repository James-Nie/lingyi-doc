import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { AiConfigService } from './ai-config.service';

@Module({
  imports: [RepositoriesModule],
  providers: [AiConfigService],
  exports: [AiConfigService],
})
export class AiConfigModule {}
