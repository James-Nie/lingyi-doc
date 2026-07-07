import { Global, Module } from '@nestjs/common';
import { AppBootstrapService } from './app-bootstrap.service';

@Global()
@Module({
  providers: [AppBootstrapService],
})
export class BootstrapModule {}
