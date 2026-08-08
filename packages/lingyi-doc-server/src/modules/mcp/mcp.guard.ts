import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../common/exceptions/business.exception';
import { DeployService } from '../../config/deploy.service';
import { hasModule } from '../membership/membership-modules';
import { McpTokenService } from './mcp-token.service';

@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly mcpTokenService: McpTokenService,
    private readonly config: ConfigService,
    private readonly deployService: DeployService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.get<boolean>('mcp.enabled', true)) {
      throw new BusinessException(100004, 'MCP 模块未启用', HttpStatus.FORBIDDEN);
    }
    this.deployService.assertLicenseAvailable();
    const modules = this.deployService.getModuleMap();
    if (!hasModule(modules, 'mod.mcp')) {
      throw new BusinessException(120006, '未开通「MCP 接入」模块，请联系管理员授权', HttpStatus.FORBIDDEN);
    }

    const request = context.switchToHttp().getRequest<{
      auth?: import('../../auth/decorators/current-user.decorator').AuthUser;
      headers: { authorization?: string };
      ip?: string;
      socket?: { remoteAddress?: string };
    }>();

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new BusinessException(110001, '缺少 MCP Token', HttpStatus.UNAUTHORIZED);
    }

    const plainToken = authHeader.slice(7).trim();
    const ctx = await this.mcpTokenService.verifyPlainToken(plainToken);
    request.auth = this.mcpTokenService.toAuthUser(ctx);
    return true;
  }
}

@Injectable()
export class McpModuleGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly deployService: DeployService,
  ) {}

  canActivate(): boolean {
    if (!this.config.get<boolean>('mcp.enabled', true)) {
      throw new BusinessException(100004, 'MCP 模块未启用', HttpStatus.FORBIDDEN);
    }
    this.deployService.assertLicenseAvailable();
    const modules = this.deployService.getModuleMap();
    if (!hasModule(modules, 'mod.mcp')) {
      throw new BusinessException(120006, '未开通「MCP 接入」模块，请联系管理员授权', HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
