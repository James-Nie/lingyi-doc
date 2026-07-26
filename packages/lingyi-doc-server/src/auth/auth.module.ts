import { Global, Module } from '@nestjs/common';
import { RepositoriesModule } from '../repositories/repositories.module';
import { TenantDataModule } from '../repositories/tenant-data.module';
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
  imports: [RepositoriesModule, TenantDataModule],
  providers: guards,
  /** TenantDataModule 需随 Auth 全局导出：TenantContextGuard 被多模块 @UseGuards 使用 */
  exports: [...guards, RepositoriesModule, TenantDataModule],
})
export class AuthModule {}
