import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AppLoggerModule } from './common/logger/app-logger.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { ConsumerAuthModule } from './modules/consumer-auth/consumer-auth.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env'],
    }),
    AppLoggerModule,
    DatabaseModule,
    BootstrapModule,
    AuthModule,
    HealthModule,
    ConsumerAuthModule,
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
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
