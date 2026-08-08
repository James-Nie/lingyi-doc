import { Module } from '@nestjs/common';
import { ConsumerAuthModule } from '../consumer-auth/consumer-auth.module';
import { LegacyAuthController } from './legacy-auth.controller';

@Module({
  imports: [ConsumerAuthModule],
  controllers: [LegacyAuthController],
})
export class LegacyAuthModule {}
