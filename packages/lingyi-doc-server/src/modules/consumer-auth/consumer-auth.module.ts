import { Module } from '@nestjs/common';
import { ConsumerAuthController } from './consumer-auth.controller';
import { ConsumerAuthService } from './consumer-auth.service';

@Module({
  controllers: [ConsumerAuthController],
  providers: [ConsumerAuthService],
  exports: [ConsumerAuthService],
})
export class ConsumerAuthModule {}
