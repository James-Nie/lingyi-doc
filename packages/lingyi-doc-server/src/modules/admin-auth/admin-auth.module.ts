import { Module } from '@nestjs/common';
import { AdminAuthController } from './admin-auth.controller';

@Module({
  controllers: [AdminAuthController],
})
export class AdminAuthModule {}
