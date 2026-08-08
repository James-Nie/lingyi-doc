import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MCP_ENTITIES } from './entities';
import { DomainPortsModule } from '../domain-ports/domain-ports.module';
import { MembershipModule } from '../membership/membership.module';
import { McpController, McpTokenController } from './mcp.controller';
import { McpTokenService } from './mcp-token.service';
import { McpAuditService } from './mcp-audit.service';
import { McpAuthGuard, McpModuleGuard } from './mcp.guard';
import { McpToolRegistry } from './mcp-tool.registry';
import { McpTransportService } from './mcp.transport';

@Module({
  imports: [
    TypeOrmModule.forFeature(MCP_ENTITIES),
    DomainPortsModule,
    MembershipModule,
  ],
  controllers: [McpController, McpTokenController],
  providers: [
    McpTokenService,
    McpAuditService,
    McpAuthGuard,
    McpModuleGuard,
    McpToolRegistry,
    McpTransportService,
  ],
  exports: [McpTokenService],
})
export class McpModule {}
