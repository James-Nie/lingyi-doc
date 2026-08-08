import { Module } from '@nestjs/common';
import { MembershipModule } from '../membership/membership.module';
import { UploadController } from './upload.controller';

@Module({
  imports: [MembershipModule],
  controllers: [UploadController],
})
export class UploadModule {}
