import { Global, Module } from '@nestjs/common';
import { RepositoriesModule } from '../repositories/repositories.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import { TenantContextGuard } from './guards/tenant-context.guard';
import { PermissionsGuard } from './guards/permissions.guard';

const guards = [
  JwtAuthGuard,
  OptionalJwtAuthGuard,
  TenantContextGuard,
  PermissionsGuard,
];

@Global()
@Module({
  imports: [RepositoriesModule],
  providers: guards,
  exports: [...guards, RepositoriesModule],
})
export class AuthModule {}
