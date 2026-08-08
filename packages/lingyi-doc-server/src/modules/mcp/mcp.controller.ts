import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SkipResponseWrap } from '../../common/decorators/skip-response-wrap.decorator';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../auth/guards/tenant-context.guard';
import { McpAuthGuard } from './mcp.guard';
import { McpAuditService } from './mcp-audit.service';
import { McpTokenService } from './mcp-token.service';
import { McpTransportService } from './mcp.transport';
import type { McpJsonRpcRequest } from './mcp.types';

@Controller('api/v1/mcp')
@UseGuards(McpAuthGuard)
export class McpController {
  constructor(private readonly transport: McpTransportService) {}

  @Post()
  @SkipResponseWrap()
  async handle(
    @Body() body: McpJsonRpcRequest,
    @CurrentUser() auth: AuthUser,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.transport.handle(body, auth, ip);
  }
}

@Controller('api/v1/c/mcp/tokens')
@UseGuards(JwtAuthGuard, TenantContextGuard)
@AuthAudience('consumer')
export class McpTokenController {
  constructor(
    private readonly tokenService: McpTokenService,
    private readonly auditService: McpAuditService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.tokenService.listByUser(user.userId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: { name?: string; preset?: string; scopes?: string[]; expiresInDays?: number },
  ) {
    return this.tokenService.create(user, {
      name: body.name ?? '',
      preset: body.preset,
      scopes: body.scopes,
      expiresInDays: body.expiresInDays,
    });
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { name?: string; preset?: string; scopes?: string[] },
  ) {
    return this.tokenService.update(user.userId, id, {
      name: body.name,
      preset: body.preset,
      scopes: body.scopes,
    });
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.tokenService.remove(user.userId, id);
    return { success: true };
  }

  @Get(':id/audit')
  audit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.auditService.listByToken(id, user.userId);
  }
}
