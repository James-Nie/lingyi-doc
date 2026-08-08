import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { DeployModule } from './config/deploy.module';
import { DatabaseModule } from './database/database.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AppLoggerModule } from './common/logger';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { ConsumerAuthModule } from './modules/consumer-auth/consumer-auth.module';
import { ConsumerTenantModule } from './modules/consumer-tenant/consumer-tenant.module';
import { LegacyAuthModule } from './modules/legacy-auth/legacy-auth.module';
import { AdminAuthModule } from './modules/admin-auth/admin-auth.module';
import { DocumentModule } from './modules/document/document.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { UploadModule } from './modules/upload/upload.module';
import { OssModule } from './modules/oss/oss.module';
import { DemoModule } from './modules/demo/demo.module';
import { AdminModule } from './modules/admin/admin.module';
import { AdminTenantModule } from './modules/admin-tenant/admin-tenant.module';
import { SystemModule } from './modules/system/system.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { DocumentShareModule } from './modules/document-share/document-share.module';
import { TemplateModule } from './modules/template/template.module';
import { MembershipModule } from './modules/membership/membership.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { RedisModule } from './redis/redis.module';
import { DocumentCommentModule } from './modules/document-comment/document-comment.module';
import { CollabModule } from './modules/collab/collab.module';
import { AIModule } from './modules/ai/ai.module';
import { McpModule } from './modules/mcp/mcp.module';
import { BaseDashboardModule } from './modules/base-dashboard/base-dashboard.module';
import { SearchModule } from './modules/search/search.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env'],
    }),
    ScheduleModule.forRoot(),
    DeployModule,
    AppLoggerModule,
    DatabaseModule,
    RedisModule,
    BootstrapModule,
    AuthModule,
    HealthModule,
    ConsumerAuthModule,
    ConsumerTenantModule,
    LegacyAuthModule,
    AdminAuthModule,
    DocumentModule,
    TenantModule,
    UploadModule,
    OssModule,
    DemoModule,
    AdminModule,
    AdminTenantModule,
    SystemModule,
    KnowledgeBaseModule,
    DocumentShareModule,
    TemplateModule,
    MembershipModule,
    CollabModule,
    DocumentCommentModule,
    AIModule,
    McpModule,
    BaseDashboardModule,
    SearchModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
