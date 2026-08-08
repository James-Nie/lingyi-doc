import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AiConfigService } from './ai-config.service';

@Injectable()
export class AIModuleGuard implements CanActivate {
  constructor(private readonly aiConfigService: AiConfigService) {}

  async canActivate(_context: ExecutionContext): Promise<boolean> {
    const enabled = await this.aiConfigService.isEnabled();
    if (!enabled) {
      throw new ForbiddenException('AI module is disabled');
    }
    return true;
  }
}
