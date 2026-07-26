import { Module } from '@nestjs/common';
import { TenantDataModule } from '../../repositories/tenant-data.module';
import { ConsumerAuthController } from './consumer-auth.controller';
import { ConsumerAuthService } from './consumer-auth.service';

@Module({
  imports: [TenantDataModule],
  controllers: [ConsumerAuthController],
  providers: [ConsumerAuthService],
  exports: [ConsumerAuthService],
})
export class ConsumerAuthModule {}
